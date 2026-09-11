/**
 * Public Verification Controller
 * ================================
 * GET /api/v1/verify/:reportId  — No authentication required (public endpoint)
 *
 * Verifies the cryptographic integrity of an issued report:
 *   1. Fetches the Report record from the database
 *   2. Reads the PDF from disk
 *   3. Recomputes SHA-256 of the PDF bytes
 *   4. Compares to the stored SHA-256 hash in the database
 *   5. Returns: { valid: true, ... } or { valid: false, reason: "TAMPERED" }
 *
 * This endpoint powers the QR code scan-to-verify workflow.
 * Scanning the QR code on a printed report opens this endpoint.
 */

import { Request, Response } from 'express';
import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import { prisma } from '../utils/prisma';

/** Absolute path to the uploads directory where PDFs are stored */
const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'reports');

export const verifyReport = async (req: Request, res: Response): Promise<Response> => {
  const { reportId } = req.params;

  if (!reportId) {
    return res.status(400).json({
      valid: false,
      reason: 'MISSING_REPORT_ID',
      message: 'Report ID is required',
    });
  }

  // 1. Fetch report from DB
  const report = await prisma.reports.findUnique({
    where: { id: reportId },
    include: {
      calculation: {
        include: {
          testSession: {
            include: {
              instrument: true,
            },
          },
        },
      },
    },
  });

  if (!report) {
    return res.status(404).json({
      valid: false,
      reason: 'NOT_FOUND',
      message: 'Report not found',
    });
  }

  // 2. Check if PDF file exists on disk
  if (!report.pdfKey) {
    return res.status(422).json({
      valid: false,
      reason: 'NO_PDF',
      message: 'This report has no PDF attached',
    });
  }

  const pdfPath = path.join(UPLOADS_DIR, report.pdfKey);
  if (!existsSync(pdfPath)) {
    return res.status(422).json({
      valid: false,
      reason: 'PDF_MISSING_ON_DISK',
      message: 'PDF file not found on server. Contact the issuing authority.',
    });
  }

  // 3. Recompute SHA-256 of the PDF
  const pdfBuffer = readFileSync(pdfPath);
  const recomputedSha256 = createHash('sha256').update(pdfBuffer).digest('hex');

  // 4. Compare with stored hash
  if (recomputedSha256 !== report.sha256) {
    return res.status(200).json({
      valid: false,
      reason: 'TAMPERED',
      message: 'WARNING: The PDF has been tampered with. The hash does not match the original.',
      reportId,
      storedSha256: report.sha256,
      computedSha256: recomputedSha256,
    });
  }

  // 5. Build the verification response
  const instrument = report.calculation?.testSession?.instrument;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oimlResult = report.calculation?.result as any;

  return res.status(200).json({
    valid: true,
    reportId,
    sha256: report.sha256,
    status: report.status,
    issuedAt: report.createdAt,
    signedAt: report.signedAt,
    overallDecision: oimlResult?.overallDecision ?? 'UNKNOWN',
    engineVersion: report.calculation?.engineVersion ?? 'UNKNOWN',
    instrument: instrument
      ? {
          serialNumber: instrument.serialNumber,
          model: instrument.model,
          accuracyClass: instrument.accuracyClass,
          maxCapacity: instrument.maxCapacity,
        }
      : null,
    message: 'This report is authentic and has not been modified since issuance.',
  });
};
