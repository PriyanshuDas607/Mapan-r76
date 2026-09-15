/**
 * Instrument Controller
 * ======================
 * Handles Legal Metrology instrument registration and retrieval.
 * All mutating operations are appended to the cryptographic audit hash chain.
 *
 * RBAC Enforcement:
 *   GET  /instruments        — All authenticated roles; SA=all labs, others=own lab only
 *   GET  /instruments/:id    — Same scoping as list
 *   POST /instruments        — TEST_ENGINEER and above (within their lab)
 *   PATCH /instruments/:id   — LAB_ADMIN+ (within their lab) or SA
 *   DELETE /instruments/:id  — LAB_ADMIN+ (within their lab) or SA
 */

import { Response } from 'express';
import { prisma } from '../utils/prisma';
import { appendAuditEvent } from '../services/auditService';
import { AuthRequest } from '../middleware/auth';
import { ROLES } from '../middleware/rbac';
import { z } from 'zod';

const instrumentSchema = z.object({
  labId:                z.string().uuid(),
  serialNumber:         z.string().min(1),
  manufacturer:         z.string().optional(),
  model:                z.string().optional(),
  accuracyClass:        z.enum(['I', 'II', 'III', 'IIII']).default('III'),
  maxCapacity:          z.number().positive().optional(),
  verificationInterval: z.number().positive().optional(),
  calibrationDate:      z.string().datetime().optional(),
  metadata:             z.record(z.unknown()).optional(),
});

const updateSchema = instrumentSchema.partial().omit({ labId: true });

/** Extract user ID from JWT payload attached by auth middleware */
function getUserId(req: AuthRequest): string | undefined {
  return req.user?.id;
}

/**
 * GET /api/v1/instruments
 * Returns instruments filtered by lab scope.
 * - SUPER_ADMIN: all instruments (optionally filtered by ?labId= query param)
 * - LAB_ADMIN / SUPERVISOR / TEST_ENGINEER: only instruments in their lab
 */
export const getAll = async (req: AuthRequest, res: Response): Promise<Response> => {
  const userRole  = req.user?.role;
  const userLabId = req.user?.labId;

  let whereClause: Record<string, unknown> = {};

  if (userRole === ROLES.SUPER_ADMIN) {
    // SA can optionally filter by lab via query param
    if (req.query.labId) {
      whereClause = { labId: req.query.labId as string };
    }
    // else: no filter — returns all
  } else {
    // Non-SA: restrict to their assigned lab
    if (!userLabId) {
      return res.status(403).json({
        success: false,
        error: { code: 'NO_LAB_ASSIGNED', message: 'Your account has no laboratory assignment.' },
      });
    }
    whereClause = { labId: userLabId };
  }

  const instruments = await prisma.instruments.findMany({
    where: whereClause,
    orderBy: { id: 'desc' },
    include: { registeredBy: { select: { id: true, email: true } } },
  });

  return res.json({ success: true, data: instruments });
};

/**
 * GET /api/v1/instruments/:id
 * Returns a single instrument with lab-scope check.
 */
export const getById = async (req: AuthRequest, res: Response): Promise<Response> => {
  const { id } = req.params;
  const userRole  = req.user?.role;
  const userLabId = req.user?.labId;

  const instrument = await prisma.instruments.findUnique({
    where: { id },
    include: { registeredBy: { select: { id: true, email: true } } },
  });

  if (!instrument) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Instrument not found' },
    });
  }

  // Lab isolation check
  if (userRole !== ROLES.SUPER_ADMIN && instrument.labId !== userLabId) {
    await appendAuditEvent('PERMISSION_DENIED', 'Instrument', id, getUserId(req), req, {
      reason: 'LAB_ISOLATION_VIOLATION',
      attemptedLabId: instrument.labId,
      userLabId,
    });
    return res.status(403).json({
      success: false,
      error: { code: 'LAB_ISOLATION_VIOLATION', message: 'You do not have access to this instrument.' },
    });
  }

  return res.json({ success: true, data: instrument });
};

/**
 * POST /api/v1/instruments
 * Register a new weighing instrument.
 * TEST_ENGINEER and above; labId is derived from JWT (cannot be spoofed).
 */
export const createInstrument = async (req: AuthRequest, res: Response): Promise<Response> => {
  const userRole  = req.user?.role;
  const userLabId = req.user?.labId;

  // For non-SA users, override labId from JWT to prevent spoofing
  if (userRole !== ROLES.SUPER_ADMIN) {
    if (!userLabId) {
      return res.status(403).json({
        success: false,
        error: { code: 'NO_LAB_ASSIGNED', message: 'Your account has no laboratory assignment.' },
      });
    }
    req.body.labId = userLabId; // Override — cannot use body labId
  }

  const parse = instrumentSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parse.error.message },
    });
  }

  const { calibrationDate, ...rest } = parse.data;

  const instrument = await prisma.instruments.create({
    data: {
      ...rest,
      calibrationDate:    calibrationDate ? new Date(calibrationDate) : undefined,
      registeredByUserId: getUserId(req) ?? null,
    },
  });

  await appendAuditEvent(
    'INSTRUMENT_REGISTERED',
    'Instrument',
    instrument.id,
    getUserId(req),
    req,
    { serialNumber: instrument.serialNumber, labId: instrument.labId, accuracyClass: instrument.accuracyClass },
  );

  return res.status(201).json({ success: true, data: instrument });
};

/**
 * PATCH /api/v1/instruments/:id
 * Update instrument details. Requires LAB_ADMIN or SUPER_ADMIN.
 */
export const updateInstrument = async (req: AuthRequest, res: Response): Promise<Response> => {
  const { id }    = req.params;
  const userRole  = req.user?.role;
  const userLabId = req.user?.labId;

  const instrument = await prisma.instruments.findUnique({ where: { id } });
  if (!instrument) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Instrument not found' },
    });
  }

  // Lab isolation
  if (userRole !== ROLES.SUPER_ADMIN && instrument.labId !== userLabId) {
    await appendAuditEvent('PERMISSION_DENIED', 'Instrument', id, getUserId(req), req, {
      reason: 'LAB_ISOLATION_VIOLATION',
    });
    return res.status(403).json({
      success: false,
      error: { code: 'LAB_ISOLATION_VIOLATION', message: 'You do not have access to this instrument.' },
    });
  }

  const parse = updateSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parse.error.message },
    });
  }

  const { calibrationDate, ...rest } = parse.data;

  const updated = await prisma.instruments.update({
    where: { id },
    data: { ...rest, calibrationDate: calibrationDate ? new Date(calibrationDate) : undefined },
  });

  await appendAuditEvent('INSTRUMENT_UPDATED', 'Instrument', id, getUserId(req), req, {
    serialNumber: instrument.serialNumber,
    labId:        instrument.labId,
    changes:      rest,
  });

  return res.json({ success: true, data: updated });
};

/**
 * DELETE /api/v1/instruments/:id
 * Delete an instrument record. Requires LAB_ADMIN or SUPER_ADMIN.
 */
export const deleteInstrument = async (req: AuthRequest, res: Response): Promise<Response> => {
  const { id }    = req.params;
  const userRole  = req.user?.role;
  const userLabId = req.user?.labId;

  const instrument = await prisma.instruments.findUnique({ where: { id } });
  if (!instrument) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Instrument not found' },
    });
  }

  // Lab isolation
  if (userRole !== ROLES.SUPER_ADMIN && instrument.labId !== userLabId) {
    await appendAuditEvent('PERMISSION_DENIED', 'Instrument', id, getUserId(req), req, {
      reason: 'LAB_ISOLATION_VIOLATION',
    });
    return res.status(403).json({
      success: false,
      error: { code: 'LAB_ISOLATION_VIOLATION', message: 'You do not have access to this instrument.' },
    });
  }

  await prisma.instruments.delete({ where: { id } });

  await appendAuditEvent('INSTRUMENT_DELETED', 'Instrument', id, getUserId(req), req, {
    serialNumber: instrument.serialNumber,
    labId:        instrument.labId,
  });

  return res.json({ success: true, data: { id } });
};
