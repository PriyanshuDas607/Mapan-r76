/**
 * Test Session Controller
 * ========================
 * Handles the complete OIML verification workflow with 4-tier RBAC:
 *
 *   POST   /tests/sessions                   — Create a new test session (TE+)
 *   GET    /tests/sessions                   — List sessions (lab-scoped)
 *   GET    /tests/sessions/:id               — Get single session (lab-scoped + ownership)
 *   POST   /tests/sessions/:id/observations  — Add observation (TE — own session)
 *   POST   /tests/sessions/:id/calculate     — Run OIML R-76 calculation (TE — own session)
 *   POST   /tests/sessions/:id/submit        — Submit for supervisor review (TE)
 *   PATCH  /tests/sessions/:id/approve       — Approve session (SUPERVISOR+)
 *   PATCH  /tests/sessions/:id/reject        — Reject session (SUPERVISOR+)
 *   POST   /tests/sessions/:id/report        — Generate signed PDF report (TE after approval)
 *
 * Every mutating operation appends an event to the cryptographic audit hash chain.
 */

import { Response } from 'express';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { prisma } from '../utils/prisma';
import { calculateOIML, OIMLTestInput } from '../services/formulaEngine';
import { sha256Hex } from '../utils/crypto';
import { appendAuditEvent } from '../services/auditService';
import { createReportPdf } from '../services/reportService';
import { AuthRequest } from '../middleware/auth';
import { ROLES } from '../middleware/rbac';
import { z } from 'zod';

const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'reports');
mkdirSync(UPLOADS_DIR, { recursive: true });

// ─── Schemas ──────────────────────────────────────────────────────────────────

const sessionSchema = z.object({
  instrumentId: z.string().uuid(),
  operatorId:   z.string().uuid().optional(), // optional: SA/LA can create on behalf of a TE
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getUserId(req: AuthRequest): string | undefined {
  return req.user?.id;
}

function getUserLabId(req: AuthRequest): string | undefined {
  return req.user?.labId;
}

function getUserRole(req: AuthRequest): string | undefined {
  return req.user?.role;
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/tests/sessions
 * List test sessions with RBAC scoping.
 * - SUPER_ADMIN: all sessions (optionally ?labId=)
 * - LAB_ADMIN:   all sessions in their lab
 * - SUPERVISOR:  sessions in their lab (all operators)
 * - TEST_ENGINEER: only their own sessions
 */
export const listSessions = async (req: AuthRequest, res: Response): Promise<Response> => {
  const userRole  = getUserRole(req);
  const userLabId = getUserLabId(req);
  const userId    = getUserId(req);

  let whereClause: Record<string, unknown> = {};

  if (userRole === ROLES.SUPER_ADMIN) {
    if (req.query.labId) whereClause = { labId: req.query.labId as string };
  } else if (userRole === ROLES.LAB_ADMIN || userRole === ROLES.SUPERVISOR) {
    if (!userLabId) {
      return res.status(403).json({
        success: false,
        error: { code: 'NO_LAB_ASSIGNED', message: 'No laboratory assignment.' },
      });
    }
    whereClause = { labId: userLabId };
  } else {
    // TEST_ENGINEER — own sessions only
    whereClause = { operatorId: userId };
  }

  const sessions = await prisma.testSessions.findMany({
    where: whereClause,
    orderBy: { startedAt: 'desc' },
    include: {
      instrument: { select: { serialNumber: true, model: true, labId: true } },
      operator:   { select: { id: true, email: true } },
    },
  });

  return res.json({ success: true, data: sessions });
};

/**
 * GET /api/v1/tests/sessions/:id
 * Get a single session with RBAC checks.
 */
export const getSession = async (req: AuthRequest, res: Response): Promise<Response> => {
  const { id }    = req.params;
  const userRole  = getUserRole(req);
  const userLabId = getUserLabId(req);
  const userId    = getUserId(req);

  const session = await prisma.testSessions.findUnique({
    where: { id },
    include: {
      instrument:   true,
      operator:     { select: { id: true, email: true } },
      observations: true,
      calculation:  true,
    },
  });

  if (!session) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Session not found' },
    });
  }

  // RBAC check
  if (userRole !== ROLES.SUPER_ADMIN) {
    if (session.labId && session.labId !== userLabId) {
      return res.status(403).json({
        success: false,
        error: { code: 'LAB_ISOLATION_VIOLATION', message: 'You do not have access to this session.' },
      });
    }
    // TEST_ENGINEER can only see their own sessions
    if (userRole === ROLES.TEST_ENGINEER && session.operatorId !== userId) {
      return res.status(403).json({
        success: false,
        error: { code: 'OWNERSHIP_VIOLATION', message: 'You can only access your own sessions.' },
      });
    }
  }

  return res.json({ success: true, data: session });
};

/**
 * POST /api/v1/tests/sessions
 * Create a new test session for an instrument.
 */
export const startSession = async (req: AuthRequest, res: Response): Promise<Response> => {
  const parse = sessionSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parse.error.message },
    });
  }

  const userRole  = getUserRole(req);
  const userLabId = getUserLabId(req);
  const userId    = getUserId(req);

  // Verify instrument is in the same lab (unless SA)
  const instrument = await prisma.instruments.findUnique({
    where: { id: parse.data.instrumentId },
  });

  if (!instrument) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Instrument not found' },
    });
  }

  if (userRole !== ROLES.SUPER_ADMIN && instrument.labId !== userLabId) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'LAB_ISOLATION_VIOLATION',
        message: 'Instrument does not belong to your laboratory.',
      },
    });
  }

  // Determine operatorId: body value for SA/LA, always self for TE/SUPERVISOR
  const operatorId =
    (userRole === ROLES.SUPER_ADMIN || userRole === ROLES.LAB_ADMIN) && parse.data.operatorId
      ? parse.data.operatorId
      : (userId as string);

  const session = await prisma.testSessions.create({
    data: {
      instrumentId: parse.data.instrumentId,
      operatorId,
      labId:    instrument.labId,
      startedAt: new Date(),
      status:   'IN_PROGRESS',
    },
  });

  await appendAuditEvent('SESSION_STARTED', 'TestSession', session.id, userId, req, {
    instrumentId: parse.data.instrumentId,
    operatorId,
    labId: instrument.labId,
  });

  return res.status(201).json({ success: true, data: session });
};

/**
 * POST /api/v1/tests/sessions/:id/observations
 * Record a raw observation for the session.
 * Only the session operator (or SA/LA/SUPERVISOR in same lab) can add observations.
 */
export const addObservation = async (req: AuthRequest, res: Response): Promise<Response> => {
  const { id }    = req.params;
  const { data }  = req.body as { data: unknown };
  const userRole  = getUserRole(req);
  const userLabId = getUserLabId(req);
  const userId    = getUserId(req);

  if (!data) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_DATA', message: 'Observation data required' },
    });
  }

  const session = await prisma.testSessions.findUnique({ where: { id } });
  if (!session) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Session not found' },
    });
  }

  // Lab isolation
  if (userRole !== ROLES.SUPER_ADMIN && session.labId && session.labId !== userLabId) {
    return res.status(403).json({
      success: false,
      error: { code: 'LAB_ISOLATION_VIOLATION', message: 'Session belongs to another laboratory.' },
    });
  }

  // Ownership: TEST_ENGINEER can only add observations to their own sessions
  if (userRole === ROLES.TEST_ENGINEER && session.operatorId !== userId) {
    return res.status(403).json({
      success: false,
      error: { code: 'OWNERSHIP_VIOLATION', message: 'You can only add observations to your own sessions.' },
    });
  }

  const observation = await prisma.observations.create({
    data: { sessionId: id, data, recordedAt: new Date() },
  });

  await appendAuditEvent('OBSERVATION_ADDED', 'Observation', observation.id, userId, req, {
    sessionId: id,
  });

  return res.status(201).json({ success: true, data: observation });
};

/**
 * POST /api/v1/tests/sessions/:id/calculate
 * Run the deterministic OIML R-76 calculation engine.
 * Result is SHA-256 hashed and stored immutably.
 */
export const executeCalculation = async (req: AuthRequest, res: Response): Promise<Response> => {
  const { id }    = req.params;
  const userRole  = getUserRole(req);
  const userLabId = getUserLabId(req);
  const userId    = getUserId(req);

  const session = await prisma.testSessions.findUnique({
    where: { id },
    include: { observations: true },
  });

  if (!session) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Session not found' },
    });
  }

  // Lab isolation
  if (userRole !== ROLES.SUPER_ADMIN && session.labId && session.labId !== userLabId) {
    return res.status(403).json({
      success: false,
      error: { code: 'LAB_ISOLATION_VIOLATION', message: 'Session belongs to another laboratory.' },
    });
  }

  // Ownership
  if (userRole === ROLES.TEST_ENGINEER && session.operatorId !== userId) {
    return res.status(403).json({
      success: false,
      error: { code: 'OWNERSHIP_VIOLATION', message: 'You can only calculate your own sessions.' },
    });
  }

  const oimlInput = req.body as OIMLTestInput;
  if (!oimlInput?.weighingRows?.length) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_WEIGHING_ROWS', message: 'weighingRows are required in the request body' },
    });
  }

  // Deterministic OIML R-76 calculation (no hardcoded results)
  const result     = calculateOIML(oimlInput);
  const resultJson = JSON.stringify(result);
  const hash       = sha256Hex(resultJson);

  const calculation = await prisma.calculations.create({
    data: {
      sessionId:     id,
      engineVersion: result.engineVersion,
      result:        result as unknown as Record<string, unknown>,
      hash,
    },
  });

  // Mark session as COMPLETED — awaiting submission
  await prisma.testSessions.update({
    where: { id },
    data: { status: 'COMPLETED', endedAt: new Date() },
  });

  await appendAuditEvent('CALCULATION_EXECUTED', 'Calculation', calculation.id, userId, req, {
    sessionId:       id,
    engineVersion:   result.engineVersion,
    overallDecision: result.overallDecision,
    calculationHash: hash,
    labId:           session.labId,
  });

  return res.json({ success: true, data: calculation });
};

/**
 * POST /api/v1/tests/sessions/:id/submit
 * Submit a completed test session for supervisor review.
 * Only the session operator (TEST_ENGINEER) can submit their own session.
 */
export const submitSession = async (req: AuthRequest, res: Response): Promise<Response> => {
  const { id }  = req.params;
  const userId  = getUserId(req);
  const userRole = getUserRole(req);

  const session = await prisma.testSessions.findUnique({
    where: { id },
    include: { calculation: true },
  });

  if (!session) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Session not found' },
    });
  }

  // Only the operator who owns this session can submit it
  if (session.operatorId !== userId) {
    return res.status(403).json({
      success: false,
      error: { code: 'OWNERSHIP_VIOLATION', message: 'You can only submit your own sessions.' },
    });
  }

  if (!session.calculation) {
    return res.status(422).json({
      success: false,
      error: { code: 'NO_CALCULATION', message: 'Run calculation first before submitting.' },
    });
  }

  if (session.status !== 'COMPLETED') {
    return res.status(422).json({
      success: false,
      error: { code: 'INVALID_STATUS', message: `Cannot submit a session in '${session.status}' status.` },
    });
  }

  const updated = await prisma.testSessions.update({
    where: { id },
    data: { status: 'PENDING_REVIEW' },
  });

  await appendAuditEvent('TEST_SUBMITTED', 'TestSession', id, userId, req, {
    labId:      session.labId,
    operatorId: session.operatorId,
  });

  return res.json({ success: true, data: updated });
};

/**
 * PATCH /api/v1/tests/sessions/:id/approve
 * Approve a test session. Requires SUPERVISOR or above.
 * TEST_ENGINEER cannot approve their own test.
 */
export const approveSession = async (req: AuthRequest, res: Response): Promise<Response> => {
  const { id }    = req.params;
  const userId    = getUserId(req);
  const userRole  = getUserRole(req);
  const userLabId = getUserLabId(req);

  const session = await prisma.testSessions.findUnique({ where: { id } });
  if (!session) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Session not found' },
    });
  }

  // Lab isolation
  if (userRole !== ROLES.SUPER_ADMIN && session.labId && session.labId !== userLabId) {
    return res.status(403).json({
      success: false,
      error: { code: 'LAB_ISOLATION_VIOLATION', message: 'Session belongs to another laboratory.' },
    });
  }

  // TEST_ENGINEER cannot approve (even their own)
  if (userRole === ROLES.TEST_ENGINEER) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Test Engineers cannot approve sessions.' },
    });
  }

  // Cannot approve own session (additional safety for TE-turned-supervisor edge case)
  if (session.operatorId === userId) {
    return res.status(403).json({
      success: false,
      error: { code: 'SELF_APPROVAL_DENIED', message: 'You cannot approve your own test session.' },
    });
  }

  if (!['PENDING_REVIEW', 'COMPLETED'].includes(session.status)) {
    return res.status(422).json({
      success: false,
      error: { code: 'INVALID_STATUS', message: `Cannot approve a session in '${session.status}' status.` },
    });
  }

  const updated = await prisma.testSessions.update({
    where: { id },
    data: { status: 'APPROVED', supervisorId: userId, approvedAt: new Date() },
  });

  await appendAuditEvent('TEST_APPROVED', 'TestSession', id, userId, req, {
    labId:      session.labId,
    operatorId: session.operatorId,
    approvedBy: userId,
  });

  return res.json({ success: true, data: updated });
};

/**
 * PATCH /api/v1/tests/sessions/:id/reject
 * Reject a test session with feedback. Requires SUPERVISOR or above.
 */
export const rejectSession = async (req: AuthRequest, res: Response): Promise<Response> => {
  const { id }     = req.params;
  const { feedback } = req.body as { feedback?: string };
  const userId     = getUserId(req);
  const userRole   = getUserRole(req);
  const userLabId  = getUserLabId(req);

  const session = await prisma.testSessions.findUnique({ where: { id } });
  if (!session) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Session not found' },
    });
  }

  // Lab isolation
  if (userRole !== ROLES.SUPER_ADMIN && session.labId && session.labId !== userLabId) {
    return res.status(403).json({
      success: false,
      error: { code: 'LAB_ISOLATION_VIOLATION', message: 'Session belongs to another laboratory.' },
    });
  }

  if (userRole === ROLES.TEST_ENGINEER) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Test Engineers cannot reject sessions.' },
    });
  }

  const updated = await prisma.testSessions.update({
    where: { id },
    data: {
      status:      'REJECTED',
      supervisorId: userId,
      rejectedAt:  new Date(),
      feedback:    feedback ?? null,
    },
  });

  await appendAuditEvent('TEST_REJECTED', 'TestSession', id, userId, req, {
    labId:      session.labId,
    operatorId: session.operatorId,
    rejectedBy: userId,
    feedback,
  });

  return res.json({ success: true, data: updated });
};

/**
 * POST /api/v1/tests/sessions/:id/report
 * Generate an immutable, digitally signed PDF report.
 * Requires session to be APPROVED (or COMPLETED for backward compat if no supervisor assigned).
 * TEST_ENGINEER cannot approve their own report — they can only request generation.
 */
export const generateReport = async (req: AuthRequest, res: Response): Promise<Response> => {
  const { id }    = req.params;
  const userRole  = getUserRole(req);
  const userLabId = getUserLabId(req);
  const userId    = getUserId(req);

  const session = await prisma.testSessions.findUnique({
    where: { id },
    include: { calculation: true, instrument: true, operator: true },
  });

  if (!session) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Session not found' },
    });
  }

  // Lab isolation
  if (userRole !== ROLES.SUPER_ADMIN && session.labId && session.labId !== userLabId) {
    return res.status(403).json({
      success: false,
      error: { code: 'LAB_ISOLATION_VIOLATION', message: 'Session belongs to another laboratory.' },
    });
  }

  // Ownership: TE can only generate report for their own session
  if (userRole === ROLES.TEST_ENGINEER && session.operatorId !== userId) {
    return res.status(403).json({
      success: false,
      error: { code: 'OWNERSHIP_VIOLATION', message: 'You can only generate reports for your own sessions.' },
    });
  }

  if (!session.calculation) {
    return res.status(422).json({
      success: false,
      error: { code: 'NO_CALCULATION', message: 'Run calculation first before generating a report' },
    });
  }

  // Prevent duplicate reports
  const existingReport = await prisma.reports.findFirst({
    where: { calculationId: session.calculation.id },
  });
  if (existingReport) {
    return res.status(409).json({
      success: false,
      error: {
        code: 'REPORT_EXISTS',
        message: `Report already generated. Report ID: ${existingReport.id}`,
        reportId: existingReport.id,
      },
    });
  }

  const protocol          = req.protocol;
  const host              = req.get('host') ?? 'localhost:4000';
  const verificationBaseUrl = `${protocol}://${host}/api/v1`;

  const { pdfBuffer, sha256, signature, qrPayload } = await createReportPdf(
    'PENDING_ID',
    {
      id:            session.calculation.id,
      engineVersion: session.calculation.engineVersion,
      hash:          session.calculation.hash,
      result:        session.calculation.result,
    },
    {
      id:        session.id,
      startedAt: session.startedAt,
      operator:  { id: session.operator.id, email: session.operator.email },
    },
    {
      id:                  session.instrument.id,
      serialNumber:        session.instrument.serialNumber,
      manufacturer:        session.instrument.manufacturer,
      model:               session.instrument.model,
      accuracyClass:       session.instrument.accuracyClass,
      maxCapacity:         session.instrument.maxCapacity,
      verificationInterval: session.instrument.verificationInterval,
      labId:               session.instrument.labId,
    },
    verificationBaseUrl,
  );

  const report = await prisma.reports.create({
    data: {
      calculationId: session.calculation.id,
      labId:         session.labId,
      version:       1,
      status:        'APPROVED',
      sha256,
      qrPayload:     JSON.stringify({ ...qrPayload, reportId: 'PENDING' }),
      signedAt:      new Date(),
      signerUserId:  userId ?? null,
    },
  });

  const pdfFilename  = `${report.id}.pdf`;
  const pdfPath      = path.join(UPLOADS_DIR, pdfFilename);
  writeFileSync(pdfPath, pdfBuffer);

  const finalQrPayload = {
    reportId:        report.id,
    sha256,
    verificationUrl: `${verificationBaseUrl}/verify/${report.id}`,
  };

  await prisma.reports.update({
    where: { id: report.id },
    data:  { pdfKey: pdfFilename, qrPayload: JSON.stringify(finalQrPayload) },
  });

  await appendAuditEvent('REPORT_GENERATED', 'Report', report.id, userId, req, {
    sessionId:       id,
    calculationId:   session.calculation.id,
    labId:           session.labId,
    sha256,
    overallDecision: (session.calculation.result as Record<string, unknown>)?.overallDecision ?? 'UNKNOWN',
  });

  const downloadUrl = `${protocol}://${host}/api/v1/reports/${report.id}/download`;

  return res.status(201).json({
    success: true,
    data: {
      reportId:        report.id,
      sha256,
      signature,
      status:          report.status,
      signedAt:        report.signedAt,
      downloadUrl,
      qrPayload:       finalQrPayload,
      verificationUrl: finalQrPayload.verificationUrl,
    },
  });
};
