/**
 * Instrument Controller
 * ======================
 * Handles Legal Metrology instrument registration and retrieval.
 * All mutating operations are appended to the cryptographic audit hash chain.
 */

import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { appendAuditEvent } from '../services/auditService';
import { z } from 'zod';

const instrumentSchema = z.object({
  labId: z.string().uuid(),
  serialNumber: z.string().min(1),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  accuracyClass: z.enum(['I', 'II', 'III', 'IIII']).default('III'),
  maxCapacity: z.number().positive().optional(),
  verificationInterval: z.number().positive().optional(),
  calibrationDate: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/** Extract user ID from JWT payload attached by auth middleware */
function getUserId(req: Request): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req as any).user?.id as string | undefined;
}

/**
 * GET /api/v1/instruments
 * Returns all registered instruments.
 */
export const getAll = async (_req: Request, res: Response): Promise<Response> => {
  const instruments = await prisma.instruments.findMany({
    orderBy: { id: 'desc' },
  });
  return res.json({ success: true, data: instruments });
};

/**
 * POST /api/v1/instruments
 * Register a new weighing instrument in the system.
 * Appends a INSTRUMENT_REGISTERED event to the audit hash chain.
 */
export const createInstrument = async (req: Request, res: Response): Promise<Response> => {
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
      calibrationDate: calibrationDate ? new Date(calibrationDate) : undefined,
      registeredByUserId: getUserId(req) ?? null,
    },
  });

  // Append to audit hash chain
  await appendAuditEvent(
    'INSTRUMENT_REGISTERED',
    'Instrument',
    instrument.id,
    getUserId(req),
    req,
    {
      serialNumber: instrument.serialNumber,
      labId: instrument.labId,
      accuracyClass: instrument.accuracyClass,
    },
  );

  return res.status(201).json({ success: true, data: instrument });
};
