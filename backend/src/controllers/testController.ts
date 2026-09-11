/**
 * Test Session Controller
 * ========================
 * Handles the complete OIML verification workflow:
 *   POST /tests/sessions              — Create a new test session
 *   POST /tests/sessions/:id/observations — Add an observation record
 *   POST /tests/sessions/:id/calculate    — Run deterministic OIML R-76 calculation
 *   POST /tests/sessions/:id/report       — Generate immutable signed PDF report
 *
 * Every mutating operation appends an event to the cryptographic audit hash chain.
 */

import { Request, Response } from 'express';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { prisma } from '../utils/prisma';
import { calculateOIML, OIMLTestInput } from '../services/formulaEngine';
import { sha256Hex } from '../utils/crypto';
import { appendAuditEvent } from '../services/auditService';
import { createReportPdf } from '../services/reportService';
import { z } from 'zod';

const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'reports');

// Ensure uploads directory exists on startup
mkdirSync(UPLOADS_DIR, { recursive: true });

// ─── Schemas ──────────────────────────────────────────────────────────────────

const sessionSchema = z.object({
  instrumentId: z.string().uuid(),
  operatorId: z.string().uuid(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract user ID from JWT payload attached by auth middleware */
function getUserId(req: Request): string | undefined {
  // The authenticate middleware attaches { id, roles } as req.user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req as any).user?.id as string | undefined;
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/tests/sessions
 * Create a new test session for an instrument.
 */
export const startSession = async (req: Request, res: Response): Promise<Response> => {
  const parse = sessionSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parse.error.message },
    });
  }

  const session = await prisma.testSessions.create({
    data: {
      instrumentId: parse.data.instrumentId,
      operatorId: parse.data.operatorId,
      startedAt: new Date(),
      status: 'IN_PROGRESS',
    },
  });

  // Append to audit hash chain
  await appendAuditEvent(
    'SESSION_STARTED',
    'TestSession',
    session.id,
    getUserId(req),
    req,
    { instrumentId: parse.data.instrumentId, operatorId: parse.data.operatorId },
  );

  return res.status(201).json({ success: true, data: session });
};

/**
 * POST /api/v1/tests/sessions/:id/observations
 * Record a raw observation for the session.
 */
export const addObservation = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { data } = req.body as { data: unknown };

  if (!data) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_DATA', message: 'Observation data required' },
    });
  }

  const observation = await prisma.observations.create({
    data: { sessionId: id, data, recordedAt: new Date() },
  });

  // Append to audit hash chain
  await appendAuditEvent(
    'OBSERVATION_ADDED',
    'Observation',
    observation.id,
    getUserId(req),
    req,
    { sessionId: id },
  );

  return res.status(201).json({ success: true, data: observation });
};

/**
 * POST /api/v1/tests/sessions/:id/calculate
 * Run the deterministic OIML R-76 calculation engine.
 * Result is SHA-256 hashed and stored immutably.
 */
export const executeCalculation = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;

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

  // Collect OIML test input from request body
  const oimlInput = req.body as OIMLTestInput;
  if (!oimlInput?.weighingRows?.length) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_WEIGHING_ROWS',
        message: 'weighingRows are required in the request body',
      },
    });
  }

  // Deterministic OIML R-76 calculation (no hardcoded results)
  const result = calculateOIML(oimlInput);

  // Hash the result JSON for immutability (SHA-256 hex)
  const resultJson = JSON.stringify(result);
  const hash = sha256Hex(resultJson);

  const calculation = await prisma.calculations.create({
    data: {
      sessionId: id,
      engineVersion: result.engineVersion,
      result: result as unknown as Record<string, unknown>,
      hash,
    },
  });

  // Mark session as completed
  await prisma.testSessions.update({
    where: { id },
    data: { status: 'COMPLETED', endedAt: new Date() },
  });

  // Append to audit hash chain
  await appendAuditEvent(
    'CALCULATION_EXECUTED',
    'Calculation',
    calculation.id,
    getUserId(req),
    req,
    {
      sessionId: id,
      engineVersion: result.engineVersion,
      overallDecision: result.overallDecision,
      calculationHash: hash,
    },
  );

  return res.json({ success: true, data: calculation });
};

/**
 * POST /api/v1/tests/sessions/:id/report
 * Generate an immutable, digitally signed PDF report for the session.
 *
 * Workflow:
 *   1. Fetch session + calculation + instrument
 *   2. Generate 4-page PDF via reportService
 *   3. Compute SHA-256 of PDF bytes
 *   4. Sign PDF with ECDSA P-256
 *   5. Save PDF to disk (uploads/reports/<reportId>.pdf)
 *   6. Create Reports record in DB (immutable — status: APPROVED)
 *   7. Append audit event
 *   8. Return { reportId, sha256, downloadUrl, qrPayload }
 */
export const generateReport = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;

  // 1. Load session with all related data
  const session = await prisma.testSessions.findUnique({
    where: { id },
    include: {
      calculation: true,
      instrument: true,
      operator: true,
    },
  });

  if (!session) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Session not found' },
    });
  }

  if (!session.calculation) {
    return res.status(422).json({
      success: false,
      error: {
        code: 'NO_CALCULATION',
        message: 'Run calculation first before generating a report',
      },
    });
  }

  // Check for existing report to prevent duplicate generation
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

  // Determine verification base URL
  const protocol = req.protocol;
  const host = req.get('host') ?? 'localhost:4000';
  const verificationBaseUrl = `${protocol}://${host}/api/v1`;

  // 2. Generate the PDF
  const { pdfBuffer, sha256, signature, qrPayload } = await createReportPdf(
    'PENDING_ID', // placeholder — we'll create DB record first for actual ID
    {
      id: session.calculation.id,
      engineVersion: session.calculation.engineVersion,
      hash: session.calculation.hash,
      result: session.calculation.result,
    },
    {
      id: session.id,
      startedAt: session.startedAt,
      operator: { id: session.operator.id, email: session.operator.email },
    },
    {
      id: session.instrument.id,
      serialNumber: session.instrument.serialNumber,
      manufacturer: session.instrument.manufacturer,
      model: session.instrument.model,
      accuracyClass: session.instrument.accuracyClass,
      maxCapacity: session.instrument.maxCapacity,
      verificationInterval: session.instrument.verificationInterval,
      labId: session.instrument.labId,
    },
    verificationBaseUrl,
  );

  // 3. Create the Reports record in the DB (get the real ID)
  const report = await prisma.reports.create({
    data: {
      calculationId: session.calculation.id,
      version: 1,
      status: 'APPROVED',
      sha256,
      qrPayload: JSON.stringify({ ...qrPayload, reportId: 'PENDING' }), // updated below
      signedAt: new Date(),
      signerUserId: getUserId(req) ?? null,
    },
  });

  // 4. Save PDF to disk with the actual report ID as filename
  const pdfFilename = `${report.id}.pdf`;
  const pdfPath = path.join(UPLOADS_DIR, pdfFilename);
  writeFileSync(pdfPath, pdfBuffer);

  // 5. Update the report record with the pdfKey and final QR payload
  const finalQrPayload = {
    reportId: report.id,
    sha256,
    verificationUrl: `${verificationBaseUrl}/verify/${report.id}`,
  };

  await prisma.reports.update({
    where: { id: report.id },
    data: {
      pdfKey: pdfFilename,
      qrPayload: JSON.stringify(finalQrPayload),
    },
  });

  // 6. Append to audit hash chain
  await appendAuditEvent(
    'REPORT_GENERATED',
    'Report',
    report.id,
    getUserId(req),
    req,
    {
      sessionId: id,
      calculationId: session.calculation.id,
      sha256,
      overallDecision: (session.calculation.result as Record<string, unknown>)?.overallDecision ?? 'UNKNOWN',
    },
  );

  // 7. Return response
  const downloadUrl = `${protocol}://${host}/api/v1/reports/${report.id}/download`;

  return res.status(201).json({
    success: true,
    data: {
      reportId: report.id,
      sha256,
      signature,
      status: report.status,
      signedAt: report.signedAt,
      downloadUrl,
      qrPayload: finalQrPayload,
      verificationUrl: finalQrPayload.verificationUrl,
    },
  });
};
