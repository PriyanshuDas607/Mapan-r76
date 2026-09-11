/**
 * PDF Report Generation Service (Puppeteer Edition)
 * ===================================================
 * Renders the HTML report template in a headless Chrome browser
 * and exports it as a high-quality A4 PDF.
 *
 * Why Puppeteer over PDFKit?
 *   - Full CSS support (gradients, flexbox, grid, fonts, badges)
 *   - "What you see in browser = what you get in PDF"
 *   - Easier to maintain and style — just HTML/CSS
 *   - Tables, colours and layouts render perfectly
 *
 * Security:
 *   - SHA-256 hash computed from the PDF buffer (immutable fingerprint)
 *   - ECDSA P-256 digital signature over the PDF buffer
 *   - QR code encoded as base64 PNG and embedded in the HTML
 */

import puppeteer from 'puppeteer';
import { createHash } from 'crypto';
import { signBuffer } from './signatureService';
import { generateReportHtml } from './reportTemplate';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InstrumentInfo {
  id: string;
  serialNumber: string;
  manufacturer?: string | null;
  model?: string | null;
  accuracyClass: string;
  maxCapacity?: number | null;
  verificationInterval?: number | null;
  labId: string;
}

export interface SessionInfo {
  id: string;
  startedAt: Date;
  operator: { id: string; email: string };
}

export interface CalculationInfo {
  id: string;
  engineVersion: string;
  hash: string;
  result: unknown;
}

export interface ReportPdfResult {
  pdfBuffer: Buffer;
  sha256: string;
  signature: string;
  qrPayload: object;
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function createReportPdf(
  reportId: string,
  calculation: CalculationInfo,
  session: SessionInfo,
  instrument: InstrumentInfo,
  verificationBaseUrl: string,
): Promise<ReportPdfResult> {

  // 1. Build the QR payload (will be embedded in the HTML as a QR code image)
  const qrPayload = {
    reportId,
    verificationUrl: `${verificationBaseUrl}/verify/${reportId}`,
    calculationHash: calculation.hash,
  };

  // 2. Generate the HTML
  const html = await generateReportHtml(
    reportId,
    calculation,
    session,
    instrument,
    qrPayload,
  );

  // 3. Launch headless Chrome and render the HTML to PDF
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
    ],
  });

  let pdfUint8Array: Uint8Array;

  try {
    const page = await browser.newPage();

    // Set the HTML content directly (no file I/O needed)
    await page.setContent(html, {
      waitUntil: 'load',
      timeout: 30000,
    });

    // Wait a bit extra for Google Fonts to load
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Print to PDF — A4, print background colours/images
    pdfUint8Array = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      displayHeaderFooter: false,
    });
  } finally {
    await browser.close();
  }

  // 4. Convert Uint8Array → Buffer
  const pdfBuffer = Buffer.from(pdfUint8Array);

  // 5. Compute SHA-256 of the PDF bytes (immutable fingerprint)
  const sha256 = createHash('sha256').update(pdfBuffer).digest('hex');

  // 6. Sign the PDF with ECDSA P-256
  const signature = signBuffer(pdfBuffer);

  return { pdfBuffer, sha256, signature, qrPayload };
}
