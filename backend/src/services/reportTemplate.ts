/**
 * HTML Report Template Generator
 * ================================
 * Generates a full HTML page that looks like a professional
 * government-grade Legal Metrology verification report.
 *
 * This HTML is then passed to Puppeteer (headless Chrome)
 * which prints it as a high-quality PDF — exactly as it looks
 * in the browser, with full CSS support.
 *
 * Sections:
 *   - Cover header (Government of India, ministry, emblem)
 *   - Report metadata (number, date, session, operator)
 *   - Instrument details table
 *   - OIML Test Results (one section per test module)
 *   - Overall decision badge
 *   - Cryptographic integrity section (SHA-256, engine version)
 *   - QR code (base64 PNG embedded directly)
 *   - Digital signature block
 *   - Footer on every page
 */

import QRCode from 'qrcode';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TemplateInstrument {
  serialNumber: string;
  manufacturer?: string | null;
  model?: string | null;
  accuracyClass: string;
  maxCapacity?: number | null;
  verificationInterval?: number | null;
  labId: string;
}

export interface TemplateSession {
  id: string;
  startedAt: Date;
  operator: { email: string };
}

export interface TemplateCalculation {
  id: string;
  engineVersion: string;
  hash: string;
  result: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function fmtNum(n: number | undefined | null, decimals = 6): string {
  if (n === undefined || n === null) return '—';
  return n.toFixed(decimals);
}

function passBadge(pass: boolean): string {
  return pass
    ? `<span class="badge pass">✓ PASS</span>`
    : `<span class="badge fail">✗ FAIL</span>`;
}

function sectionHeader(title: string, subtitle = ''): string {
  return `
    <div class="section-header">
      <div class="section-title">${title}</div>
      ${subtitle ? `<div class="section-subtitle">${subtitle}</div>` : ''}
    </div>`;
}

// ─── Main template generator ──────────────────────────────────────────────────

export async function generateReportHtml(
  reportId: string,
  calculation: TemplateCalculation,
  session: TemplateSession,
  instrument: TemplateInstrument,
  qrPayload: object,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oiml = calculation.result as any;
  const decision: string = oiml?.overallDecision ?? 'UNKNOWN';
  const validation = oiml?.instrumentValidation;

  // Generate QR code as base64 data URL
  const qrDataUrl = await QRCode.toDataURL(JSON.stringify(qrPayload), {
    width: 160,
    margin: 2,
    color: { dark: '#1a2e4a', light: '#ffffff' },
  });

  // ─── Weighing rows ─────────────────────────────────────────────────────────
  const wRows: unknown[] = oiml?.tests?.weighingPerformance?.rows ?? [];
  const weighingTableRows = wRows
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r: any, i: number) => `
      <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
        <td>${fmtNum(r.appliedLoad, 4)}</td>
        <td>${fmtNum(r.indication, 4)}</td>
        <td class="${Math.abs(r.error) > r.mpe ? 'error-val' : ''}">${fmtNum(r.error)}</td>
        <td>${fmtNum(r.absoluteError)}</td>
        <td><span class="region-badge ${r.region}">${r.region?.toUpperCase()}</span></td>
        <td>${fmtNum(r.mpe)}</td>
        <td>${passBadge(r.pass)}</td>
      </tr>`)
    .join('');

  // ─── Repeatability rows ────────────────────────────────────────────────────
  const repGroups: unknown[] = oiml?.tests?.repeatability?.groups ?? [];
  const repeatabilitySection = repGroups.length ? `
    ${sectionHeader('Repeatability Test — T.2.8', 'R = max(Iᵢ) − min(Iᵢ) &nbsp;|&nbsp; Pass: R ≤ MPE &nbsp;|&nbsp; Min. 5 readings required')}
    <table>
      <thead>
        <tr>
          <th>Applied Load</th>
          <th>Readings</th>
          <th>Max Deviation (R)</th>
          <th>Std Dev</th>
          <th>MPE</th>
          <th>Result</th>
        </tr>
      </thead>
      <tbody>
        ${repGroups
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((g: any, i: number) => `
          <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
            <td>${fmtNum(g.appliedLoad, 4)}</td>
            <td class="readings-cell">[${g.indications.map((v: number) => fmtNum(v, 4)).join(', ')}]</td>
            <td>${fmtNum(g.maxDeviation)}</td>
            <td>${fmtNum(g.stdDev)}</td>
            <td>${fmtNum(g.mpe)}</td>
            <td>${passBadge(g.pass)}</td>
          </tr>`).join('')}
      </tbody>
    </table>` : '';

  // ─── Eccentricity ─────────────────────────────────────────────────────────
  const eccTests: unknown[] = oiml?.tests?.eccentricity?.tests ?? [];
  const eccentricitySection = eccTests.length ? `
    ${sectionHeader('Eccentricity Test — T.2.9', 'Error = I_position − I_centre &nbsp;|&nbsp; Pass: max|Error| ≤ MPE')}
    <table>
      <thead>
        <tr><th>Applied Load</th><th>Positions</th><th>Max Deviation</th><th>MPE</th><th>Result</th></tr>
      </thead>
      <tbody>
        ${eccTests
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((t: any, i: number) => `
          <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
            <td>${fmtNum(t.appliedLoad, 4)}</td>
            <td class="readings-cell">${t.positions.map((p: { position: string; indication: number; error: number }) => `${p.position}: ${fmtNum(p.indication, 4)} (err: ${fmtNum(p.error)})`).join('<br>')}</td>
            <td>${fmtNum(t.maxDeviation)}</td>
            <td>${fmtNum(t.mpe)}</td>
            <td>${passBadge(t.pass)}</td>
          </tr>`).join('')}
      </tbody>
    </table>` : '';

  // ─── Zero Setting ─────────────────────────────────────────────────────────
  const zs = oiml?.tests?.zeroSetting;
  const zeroSection = zs ? `
    ${sectionHeader('Zero Setting Test — T.2.6', 'Drift = Zero_after − Zero_before &nbsp;|&nbsp; MPE = 0.25e')}
    <table>
      <thead><tr><th>Zero Before</th><th>Zero After</th><th>Drift</th><th>MPE (0.25e)</th><th>Result</th></tr></thead>
      <tbody>
        <tr class="even">
          <td>${fmtNum(zs.zeroBeforeTest)}</td>
          <td>${fmtNum(zs.zeroAfterTest)}</td>
          <td>${fmtNum(zs.drift)}</td>
          <td>${fmtNum(zs.mpe)}</td>
          <td>${passBadge(zs.pass)}</td>
        </tr>
      </tbody>
    </table>` : '';

  // ─── Return to Zero ───────────────────────────────────────────────────────
  const rtz = oiml?.tests?.returnToZero;
  const rtzSection = rtz ? `
    ${sectionHeader('Return to Zero Test — T.2.7', 'After load removal &nbsp;|&nbsp; MPE = 0.5e')}
    <table>
      <thead><tr><th>Pre-Load</th><th>Return Indication</th><th>|Error|</th><th>MPE (0.5e)</th><th>Result</th></tr></thead>
      <tbody>
        <tr class="even">
          <td>${fmtNum(rtz.preLoad, 4)}</td>
          <td>${fmtNum(rtz.returnIndication)}</td>
          <td>${fmtNum(rtz.error)}</td>
          <td>${fmtNum(rtz.mpe)}</td>
          <td>${passBadge(rtz.pass)}</td>
        </tr>
      </tbody>
    </table>` : '';

  // ─── Span ─────────────────────────────────────────────────────────────────
  const span = oiml?.tests?.span;
  const spanSection = span ? `
    ${sectionHeader('Span Test — T.2.7', 'E = Indication − Reference Load &nbsp;|&nbsp; Pass: |E| ≤ MPE')}
    <table>
      <thead><tr><th>Reference Load</th><th>Indication</th><th>Error</th><th>MPE</th><th>Result</th></tr></thead>
      <tbody>
        <tr class="even">
          <td>${fmtNum(span.referenceLoad, 4)}</td>
          <td>${fmtNum(span.indication)}</td>
          <td>${fmtNum(span.error)}</td>
          <td>${fmtNum(span.mpe)}</td>
          <td>${passBadge(span.pass)}</td>
        </tr>
      </tbody>
    </table>` : '';

  // ─── Discrimination ───────────────────────────────────────────────────────
  const disc = oiml?.tests?.discrimination;
  const discSection = disc ? `
    ${sectionHeader('Discrimination Test — T.2.4', 'Δ = I_after − I_before &nbsp;|&nbsp; Pass: Δ > 0')}
    <table>
      <thead><tr><th>Applied Load</th><th>Indication Before</th><th>Added Weight</th><th>Indication After</th><th>Δ (Delta)</th><th>Result</th></tr></thead>
      <tbody>
        <tr class="even">
          <td>${fmtNum(disc.appliedLoad, 4)}</td>
          <td>${fmtNum(disc.indicationBefore)}</td>
          <td>${fmtNum(disc.addedWeight)}</td>
          <td>${fmtNum(disc.indicationAfter)}</td>
          <td>${fmtNum(disc.delta)}</td>
          <td>${passBadge(disc.pass)}</td>
        </tr>
      </tbody>
    </table>` : '';

  // ─── Module summary ───────────────────────────────────────────────────────
  const modules = [
    { name: 'Weighing Performance (T.2.7)', pass: oiml?.tests?.weighingPerformance?.allPass },
    { name: 'Repeatability (T.2.8)', pass: oiml?.tests?.repeatability?.allPass },
    { name: 'Eccentricity (T.2.9)', pass: oiml?.tests?.eccentricity?.allPass },
    { name: 'Zero Setting (T.2.6)', pass: oiml?.tests?.zeroSetting?.pass },
    { name: 'Return to Zero (T.2.7)', pass: oiml?.tests?.returnToZero?.pass },
    { name: 'Span Test (T.2.7)', pass: oiml?.tests?.span?.pass },
    { name: 'Discrimination (T.2.4)', pass: oiml?.tests?.discrimination?.pass },
  ].filter(m => m.pass !== undefined && m.pass !== null);

  const summaryRows = modules.map((m, i) => `
    <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
      <td>${m.name}</td>
      <td>${passBadge(m.pass as boolean)}</td>
    </tr>`).join('');

  // ─── Full HTML ─────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verification Report — ${reportId}</title>
  <style>
    /* ── Reset & Base ─────────────────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

    body {
      font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
      font-size: 11px;
      color: #1a1a2e;
      background: #ffffff;
      line-height: 1.5;
    }

    /* ── Page Layout ──────────────────────────────────────────────────────── */
    .page { padding: 0; }

    /* ── Government Header ────────────────────────────────────────────────── */
    .gov-header {
      background: linear-gradient(135deg, #0f1f3d 0%, #1a3560 60%, #0d2347 100%);
      color: white;
      padding: 20px 40px;
      display: flex;
      align-items: center;
      gap: 20px;
      border-bottom: 4px solid #c8a84b;
    }

    .emblem {
      font-size: 52px;
      line-height: 1;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
    }

    .gov-text { flex: 1; }

    .gov-text .country {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #c8a84b;
    }

    .gov-text .ministry {
      font-size: 11px;
      color: #94b4d4;
      margin-top: 2px;
    }

    .gov-text .division {
      font-size: 10px;
      color: #7090b0;
      margin-top: 1px;
    }

    .report-badge {
      text-align: right;
    }

    .report-badge .report-title {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: #ffffff;
    }

    .report-badge .standard-tag {
      display: inline-block;
      background: #c8a84b;
      color: #0f1f3d;
      font-size: 9px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 10px;
      margin-top: 4px;
      letter-spacing: 0.5px;
    }

    /* ── Decision Banner ──────────────────────────────────────────────────── */
    .decision-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 40px;
      background: ${decision === 'PASS' ? 'linear-gradient(90deg, #14532d, #15803d)' : 'linear-gradient(90deg, #7f1d1d, #b91c1c)'};
      color: white;
    }

    .decision-label {
      font-size: 11px;
      opacity: 0.85;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    .decision-text {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 3px;
    }

    .decision-meta {
      text-align: right;
      font-size: 9px;
      opacity: 0.8;
    }

    .decision-meta strong { font-size: 11px; display: block; }

    /* ── Content Area ─────────────────────────────────────────────────────── */
    .content { padding: 24px 40px; }

    /* ── Meta Grid ────────────────────────────────────────────────────────── */
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 20px;
    }

    .meta-card {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      overflow: hidden;
    }

    .meta-card-header {
      background: #1e3a5f;
      color: white;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      padding: 6px 12px;
    }

    .meta-card-body { padding: 10px 12px; }

    .meta-row {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      border-bottom: 1px solid #f1f5f9;
      font-size: 10px;
    }

    .meta-row:last-child { border-bottom: none; }

    .meta-label {
      color: #64748b;
      font-weight: 500;
    }

    .meta-value {
      color: #1a1a2e;
      font-weight: 600;
      text-align: right;
    }

    .class-badge {
      display: inline-block;
      background: #1e3a5f;
      color: white;
      padding: 1px 8px;
      border-radius: 10px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    /* ── Section header ───────────────────────────────────────────────────── */
    .section-header {
      display: flex;
      align-items: baseline;
      gap: 10px;
      background: #1e3a5f;
      color: white;
      padding: 8px 12px;
      border-radius: 4px 4px 0 0;
      margin-top: 18px;
    }

    .section-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }

    .section-subtitle {
      font-size: 9px;
      color: #94b4d4;
      font-weight: 400;
    }

    /* ── n-validation strip ───────────────────────────────────────────────── */
    .n-validation {
      display: flex;
      gap: 20px;
      padding: 8px 12px;
      background: #f0f4f8;
      border: 1px solid #dde4ed;
      border-top: none;
      font-size: 10px;
      border-radius: 0 0 4px 4px;
      margin-bottom: 0;
    }

    .n-item { display: flex; gap: 6px; align-items: center; }
    .n-item .n-key { color: #64748b; }
    .n-item .n-val { font-weight: 700; color: #1a1a2e; }

    /* ── Tables ───────────────────────────────────────────────────────────── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      border: 1px solid #dde4ed;
      border-top: none;
      border-radius: 0 0 4px 4px;
      overflow: hidden;
    }

    thead tr {
      background: #334155;
      color: white;
    }

    th {
      padding: 7px 10px;
      text-align: left;
      font-weight: 600;
      font-size: 9px;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }

    td {
      padding: 6px 10px;
      border-bottom: 1px solid #f1f5f9;
    }

    tr.even td { background: #f8fafc; }
    tr.odd td  { background: #ffffff; }

    tr:last-child td { border-bottom: none; }

    .readings-cell {
      font-family: 'Courier New', monospace;
      font-size: 9px;
      color: #475569;
    }

    .error-val { color: #b91c1c; font-weight: 700; }

    /* ── Badges ───────────────────────────────────────────────────────────── */
    .badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 10px;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }

    .badge.pass { background: #dcfce7; color: #14532d; border: 1px solid #86efac; }
    .badge.fail { background: #fee2e2; color: #7f1d1d; border: 1px solid #fca5a5; }

    .region-badge {
      display: inline-block;
      padding: 1px 7px;
      border-radius: 8px;
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .region-badge.low  { background: #dbeafe; color: #1e40af; }
    .region-badge.mid  { background: #fef9c3; color: #854d0e; }
    .region-badge.high { background: #ffe4e6; color: #9f1239; }

    /* ── Summary module table ─────────────────────────────────────────────── */
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-top: 18px;
    }

    /* ── Crypto section ───────────────────────────────────────────────────── */
    .crypto-section {
      margin-top: 18px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      overflow: hidden;
    }

    .crypto-header {
      background: #0f172a;
      color: #94a3b8;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      padding: 6px 12px;
    }

    .crypto-body {
      padding: 12px;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: start;
    }

    .hash-row {
      margin-bottom: 8px;
    }

    .hash-label {
      font-size: 9px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 3px;
    }

    .hash-value {
      font-family: 'Courier New', monospace;
      font-size: 9px;
      color: #1e293b;
      background: #f8fafc;
      padding: 5px 8px;
      border-radius: 3px;
      border: 1px solid #e2e8f0;
      word-break: break-all;
    }

    .qr-block { text-align: center; }

    .qr-block img {
      width: 120px;
      height: 120px;
      border: 2px solid #1a2e4a;
      border-radius: 4px;
      padding: 4px;
    }

    .qr-label {
      font-size: 8px;
      color: #64748b;
      margin-top: 4px;
      text-align: center;
      max-width: 120px;
    }

    /* ── Signature block ──────────────────────────────────────────────────── */
    .signature-section {
      margin-top: 24px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      padding-top: 16px;
      border-top: 2px solid #e2e8f0;
    }

    .sig-box {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .sig-line {
      width: 100%;
      height: 1px;
      background: #1a1a2e;
      margin-bottom: 4px;
    }

    .sig-label {
      font-size: 9px;
      color: #475569;
      text-align: center;
    }

    .sig-title {
      font-size: 10px;
      font-weight: 700;
      color: #1a1a2e;
      text-align: center;
    }

    .sig-stamp-area {
      height: 50px;
      border: 1px dashed #cbd5e1;
      border-radius: 4px;
      width: 100%;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .sig-stamp-placeholder {
      font-size: 8px;
      color: #94a3b8;
      letter-spacing: 0.5px;
    }

    /* ── Footer ───────────────────────────────────────────────────────────── */
    .report-footer {
      margin-top: 16px;
      padding: 8px 40px;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8px;
      color: #94a3b8;
    }

    /* ── Print styles ─────────────────────────────────────────────────────── */
    @media print {
      @page { size: A4; margin: 0; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page-break { page-break-before: always; }
    }
  </style>
</head>
<body>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- GOVERNMENT HEADER                                                       -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div class="gov-header">
  <div class="emblem">⚖️</div>
  <div class="gov-text">
    <div class="country">Government of India</div>
    <div class="ministry">Ministry of Consumer Affairs, Food &amp; Public Distribution</div>
    <div class="division">Legal Metrology Division — Weights &amp; Measures</div>
  </div>
  <div class="report-badge">
    <div class="report-title">WEIGHING INSTRUMENT<br>VERIFICATION REPORT</div>
    <div class="standard-tag">OIML R 76-1 (2006)</div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- OVERALL DECISION BANNER                                                  -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div class="decision-banner">
  <div>
    <div class="decision-label">Overall Verification Decision</div>
    <div class="decision-text">${decision}</div>
  </div>
  <div class="decision-meta">
    <strong>Report No.</strong>
    ${reportId.substring(0, 8).toUpperCase()}
    <br>Issued: ${fmtDate(new Date())}
    <br>Engine v${calculation.engineVersion}
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- CONTENT                                                                  -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div class="content">

  <!-- Meta Grid: Report Info + Instrument Details -->
  <div class="meta-grid">

    <div class="meta-card">
      <div class="meta-card-header">📋 Report Details</div>
      <div class="meta-card-body">
        <div class="meta-row">
          <span class="meta-label">Report Number</span>
          <span class="meta-value" style="font-family:monospace;font-size:9px;">${reportId}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Date of Issue</span>
          <span class="meta-value">${fmtDate(new Date())}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Session ID</span>
          <span class="meta-value" style="font-family:monospace;font-size:9px;">${session.id.substring(0, 16)}…</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Session Start</span>
          <span class="meta-value">${fmtDate(session.startedAt)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Operator</span>
          <span class="meta-value">${session.operator.email}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Laboratory ID</span>
          <span class="meta-value">${instrument.labId}</span>
        </div>
      </div>
    </div>

    <div class="meta-card">
      <div class="meta-card-header">⚖️ Instrument Under Test</div>
      <div class="meta-card-body">
        <div class="meta-row">
          <span class="meta-label">Serial Number</span>
          <span class="meta-value">${instrument.serialNumber}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Manufacturer</span>
          <span class="meta-value">${instrument.manufacturer ?? '—'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Model</span>
          <span class="meta-value">${instrument.model ?? '—'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Accuracy Class</span>
          <span class="meta-value"><span class="class-badge">Class ${instrument.accuracyClass}</span></span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Max Capacity</span>
          <span class="meta-value">${instrument.maxCapacity ? `${instrument.maxCapacity} kg` : '—'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Verification Interval (e)</span>
          <span class="meta-value">${instrument.verificationInterval ? `${instrument.verificationInterval} kg` : '—'}</span>
        </div>
      </div>
    </div>

  </div>

  <!-- n-Validation -->
  ${validation ? `
  ${sectionHeader('Scale Interval Validation', 'n = Max Capacity ÷ e')}
  <div class="n-validation">
    <div class="n-item">
      <span class="n-key">n (verification intervals):</span>
      <span class="n-val">${validation.n}</span>
    </div>
    <div class="n-item">
      <span class="n-key">Valid for Class ${instrument.accuracyClass}:</span>
      <span class="n-val" style="color:${validation.nValid ? '#15803d' : '#b91c1c'}">${validation.nValid ? '✓ Yes' : '✗ No — ' + (validation.nMessage ?? '')}</span>
    </div>
  </div>` : ''}

  <!-- ─── Weighing Performance Test ─────────────────────────────────────── -->
  ${wRows.length ? `
  ${sectionHeader('Weighing Performance Test — T.2.7', 'E = Indication − Applied Load &nbsp;|&nbsp; Pass: |E| ≤ MPE')}
  <table>
    <thead>
      <tr>
        <th>Applied Load (kg)</th>
        <th>Indication (kg)</th>
        <th>Error E</th>
        <th>|E|</th>
        <th>Region</th>
        <th>MPE</th>
        <th>Result</th>
      </tr>
    </thead>
    <tbody>${weighingTableRows}</tbody>
  </table>` : ''}

  <!-- ─── Additional Tests ───────────────────────────────────────────────── -->
  ${repeatabilitySection}
  ${eccentricitySection}
  ${zeroSection}
  ${rtzSection}
  ${spanSection}
  ${discSection}

  <!-- ─── Module Summary ────────────────────────────────────────────────── -->
  <div class="summary-grid">
    <div>
      ${sectionHeader('Test Module Summary')}
      <table>
        <thead><tr><th>Test Module</th><th>Decision</th></tr></thead>
        <tbody>${summaryRows}</tbody>
      </table>
    </div>
    <div>
      ${sectionHeader('Formula Reference')}
      <table>
        <thead><tr><th>Formula</th><th>Expression</th></tr></thead>
        <tbody>
          <tr class="even"><td>Indication Error</td><td style="font-family:monospace">E = I − L</td></tr>
          <tr class="odd"><td>MPE (Low Region)</td><td style="font-family:monospace">± 0.5 × e</td></tr>
          <tr class="even"><td>MPE (Mid Region)</td><td style="font-family:monospace">± 1.0 × e</td></tr>
          <tr class="odd"><td>MPE (High Region)</td><td style="font-family:monospace">± 1.5 × e</td></tr>
          <tr class="even"><td>Repeatability</td><td style="font-family:monospace">R = max(Iᵢ) − min(Iᵢ)</td></tr>
          <tr class="odd"><td>Eccentricity</td><td style="font-family:monospace">Δ = I_pos − I_centre</td></tr>
          <tr class="even"><td>Zero Drift MPE</td><td style="font-family:monospace">± 0.25 × e</td></tr>
          <tr class="odd"><td>RTZ MPE</td><td style="font-family:monospace">± 0.5 × e</td></tr>
          <tr class="even"><td>n (intervals)</td><td style="font-family:monospace">n = MaxCap ÷ e</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- ─── Cryptographic Integrity ───────────────────────────────────────── -->
  <div class="crypto-section">
    <div class="crypto-header">🔒 Cryptographic Integrity — Immutable Fingerprints</div>
    <div class="crypto-body">
      <div>
        <div class="hash-row">
          <div class="hash-label">Calculation Result SHA-256 (OIML Engine Output Hash)</div>
          <div class="hash-value">${calculation.hash}</div>
        </div>
        <div class="hash-row">
          <div class="hash-label">PDF Document SHA-256 (stored in database — compare via QR scan)</div>
          <div class="hash-value" style="color:#94a3b8;font-style:italic;">Computed at PDF generation time — stored in Legal Metrology database</div>
        </div>
        <div class="hash-row">
          <div class="hash-label">Calculation Engine Version</div>
          <div class="hash-value">${calculation.engineVersion} — OIML R 76-1 (2006)</div>
        </div>
        <div class="hash-row">
          <div class="hash-label">Digital Signature</div>
          <div class="hash-value" style="color:#94a3b8;font-style:italic;">ECDSA P-256 — Verify at: /api/v1/verify/${reportId}</div>
        </div>
      </div>
      <div class="qr-block">
        <img src="${qrDataUrl}" alt="Verification QR Code" />
        <div class="qr-label">Scan to verify<br>authenticity online</div>
      </div>
    </div>
  </div>

  <!-- ─── Signature Block ────────────────────────────────────────────────── -->
  <div class="signature-section">
    <div class="sig-box">
      <div class="sig-stamp-area">
        <span class="sig-stamp-placeholder">OFFICIAL SEAL / STAMP</span>
      </div>
      <div class="sig-line"></div>
      <div class="sig-title">Legal Metrology Officer</div>
      <div class="sig-label">Authorised Signatory</div>
    </div>
    <div class="sig-box">
      <div class="sig-stamp-area">
        <span class="sig-stamp-placeholder">LABORATORY STAMP</span>
      </div>
      <div class="sig-line"></div>
      <div class="sig-title">Laboratory In-Charge</div>
      <div class="sig-label">Approved By</div>
    </div>
  </div>

</div><!-- /.content -->

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- FOOTER                                                                   -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div class="report-footer">
  <span>Report ID: ${reportId} &nbsp;|&nbsp; Standard: OIML R 76-1 (2006) &nbsp;|&nbsp; Engine: v${calculation.engineVersion}</span>
  <span>This report is digitally signed and cryptographically immutable. Verify at /api/v1/verify/${reportId}</span>
</div>

</body>
</html>`;
}
