/**
 * OIML R-76 Deterministic Calculation Engine
 * Version: 2.0.0
 * Standard: OIML R 76-1 (2006) – Non-automatic weighing instruments
 *
 * Implements the following OIML test modules:
 *   1. Weighing Performance Test  (T.2.7)
 *   2. Repeatability Test         (T.2.8)
 *   3. Eccentricity Test          (T.2.9)  – placeholder
 *   4. Zero Setting / Tare Test   (T.2.6)
 *   5. Return to Zero Test        (T.2.7)
 *   6. Span Test                  (T.2.7)
 *   7. Creep Test                 (T.2.5)  – placeholder
 *   8. Discrimination Test        (T.2.4)
 *
 * NEVER hardcode calculation results.
 * All outputs are derived deterministically from inputs and the official MPE table.
 */

import { z } from 'zod';
import {
  AccuracyClass,
  lookupMPE,
  calculateN,
  validateN,
  getRegion,
} from '../config/mpeTable';

// =============================================================================
// INPUT SCHEMAS
// =============================================================================

/** A single weighing observation (one row of the measurement table). */
export const WeighingObservationSchema = z.object({
  appliedLoad: z.number().positive('Applied load must be positive'),
  indication: z.number(),
  accuracyClass: z.enum(['I', 'II', 'III', 'IIII'] as const),
  verificationInterval: z.number().positive('Verification interval must be positive'),
  maxCapacity: z.number().positive('Max capacity must be positive'),
});

/** Repeatability test: same load repeated multiple times (≥5 per OIML). */
export const RepeatabilityObservationSchema = z.object({
  appliedLoad: z.number().positive(),
  indications: z.array(z.number()).min(5, 'OIML requires at least 5 repetitions'),
  accuracyClass: z.enum(['I', 'II', 'III', 'IIII'] as const),
  verificationInterval: z.number().positive(),
  maxCapacity: z.number().positive(),
});

/** Eccentricity test: same load placed at multiple positions on the pan. */
export const EccentricityObservationSchema = z.object({
  appliedLoad: z.number().positive(),
  positions: z.array(
    z.object({
      position: z.string(),
      indication: z.number(),
    })
  ).min(4, 'OIML requires at least 4 positions (centre + 4 quarters)'),
  accuracyClass: z.enum(['I', 'II', 'III', 'IIII'] as const),
  verificationInterval: z.number().positive(),
  maxCapacity: z.number().positive(),
});

/** Zero/Tare setting test observation. */
export const ZeroSettingObservationSchema = z.object({
  zeroBeforeTest: z.number(),
  zeroAfterTest: z.number(),
  accuracyClass: z.enum(['I', 'II', 'III', 'IIII'] as const),
  verificationInterval: z.number().positive(),
  maxCapacity: z.number().positive(),
});

/** Return to zero test: indication after a load is removed. */
export const ReturnToZeroObservationSchema = z.object({
  preLoad: z.number().positive(),
  returnIndication: z.number(),
  accuracyClass: z.enum(['I', 'II', 'III', 'IIII'] as const),
  verificationInterval: z.number().positive(),
  maxCapacity: z.number().positive(),
});

/** Span test: a reference weight at or near max capacity. */
export const SpanObservationSchema = z.object({
  referenceLoad: z.number().positive(),
  indication: z.number(),
  accuracyClass: z.enum(['I', 'II', 'III', 'IIII'] as const),
  verificationInterval: z.number().positive(),
  maxCapacity: z.number().positive(),
});

/** Discrimination test: adding 1.4d (or e) and checking step. */
export const DiscriminationObservationSchema = z.object({
  appliedLoad: z.number().positive(),
  indicationBefore: z.number(),
  indicationAfter: z.number(),
  addedWeight: z.number().positive(),
  accuracyClass: z.enum(['I', 'II', 'III', 'IIII'] as const),
  verificationInterval: z.number().positive(),
  maxCapacity: z.number().positive(),
});

// =============================================================================
// OUTPUT TYPES
// =============================================================================

export interface InstrumentValidation {
  n: number;
  nValid: boolean;
  nMessage?: string;
}

export interface WeighingRowResult {
  appliedLoad: number;
  indication: number;
  error: number;               // E = I - L
  absoluteError: number;       // |E|
  region: string;              // low / mid / high
  mpeMultiplier: number;       // 0.5 / 1.0 / 1.5 (in e units)
  mpe: number;                 // MPE in same unit as load
  pass: boolean;               // |E| ≤ MPE
}

export interface RepeatabilityRowResult {
  appliedLoad: number;
  indications: number[];
  mean: number;
  maxDeviation: number;        // max(|I_i - I_min|) = range
  stdDev: number;              // sample standard deviation
  mpe: number;                 // same MPE as for weighing at that load
  pass: boolean;               // maxDeviation ≤ MPE (OIML uses max deviation, not stdDev)
}

export interface EccentricityRowResult {
  appliedLoad: number;
  positions: { position: string; indication: number; error: number }[];
  maxDeviation: number;        // max difference between any two position indications
  mpe: number;
  pass: boolean;
}

export interface ZeroSettingResult {
  zeroBeforeTest: number;
  zeroAfterTest: number;
  drift: number;               // zeroAfterTest - zeroBeforeTest
  mpe: number;                 // 0.25e per OIML (example)
  pass: boolean;
}

export interface ReturnToZeroResult {
  preLoad: number;
  returnIndication: number;
  error: number;               // returnIndication - 0
  mpe: number;                 // 0.5e (same as low-region MPE)
  pass: boolean;
}

export interface SpanResult {
  referenceLoad: number;
  indication: number;
  error: number;               // E = I - L
  mpe: number;
  pass: boolean;
}

export interface DiscriminationResult {
  appliedLoad: number;
  indicationBefore: number;
  indicationAfter: number;
  addedWeight: number;
  delta: number;               // indicationAfter - indicationBefore
  expectedStep: number;        // should equal 1 verification interval
  pass: boolean;               // delta > 0 (indication changed)
}

// =============================================================================
// CORE ENGINE
// =============================================================================

/** ENGINE VERSION – must be stored with every calculation for audit. */
export const ENGINE_VERSION = '2.0.0';

// ---------------------------------------------------------------------------
// T.2.7 – Weighing Performance Test
// ---------------------------------------------------------------------------
/**
 * Evaluates each weighing row individually.
 *   Error       = Indication − Applied Load      (E = I − L)
 *   Absolute E  = |E|
 *   MPE         = region_multiplier × e          (0.5e / 1.0e / 1.5e)
 *   PASS        = |E| ≤ MPE
 */
export function runWeighingPerformanceTest(
  rows: z.infer<typeof WeighingObservationSchema>[],
): {
  validation: InstrumentValidation;
  rows: WeighingRowResult[];
  allPass: boolean;
} {
  const parsed = rows.map(r => WeighingObservationSchema.parse(r));

  // Validate n for the instrument using first row (class/capacity/interval are per instrument)
  const first = parsed[0];
  const n = calculateN(first.maxCapacity, first.verificationInterval);
  const nValidation = validateN(n, first.accuracyClass);

  const rowResults: WeighingRowResult[] = parsed.map(obs => {
    const error = obs.indication - obs.appliedLoad;
    const absoluteError = Math.abs(error);
    const region = getRegion(obs.appliedLoad, obs.verificationInterval, obs.accuracyClass);
    const mpe = lookupMPE(obs.accuracyClass, obs.appliedLoad, obs.verificationInterval);
    // Derive the multiplier for display (mpe / e)
    const mpeMultiplier = mpe / obs.verificationInterval;
    const pass = absoluteError <= mpe;
    return {
      appliedLoad: obs.appliedLoad,
      indication: obs.indication,
      error,
      absoluteError,
      region,
      mpeMultiplier,
      mpe,
      pass,
    };
  });

  return {
    validation: { n, nValid: nValidation.valid, nMessage: nValidation.message },
    rows: rowResults,
    allPass: rowResults.every(r => r.pass),
  };
}

// ---------------------------------------------------------------------------
// T.2.8 – Repeatability Test
// ---------------------------------------------------------------------------
/**
 * OIML R-76 specifies:
 *   - Same load applied at least 5 (class I/II) or 3 (class III/IIII) times.
 *   - Repeatability = max( |I_i − I_min| ) for all readings.
 *   - PASS: Repeatability ≤ MPE at that load.
 *
 * We also compute stdDev as supplementary information.
 */
export function runRepeatabilityTest(
  groups: z.infer<typeof RepeatabilityObservationSchema>[],
): { groups: RepeatabilityRowResult[]; allPass: boolean } {
  const parsedGroups = groups.map(g => RepeatabilityObservationSchema.parse(g));

  const groupResults: RepeatabilityRowResult[] = parsedGroups.map(g => {
    const n = g.indications.length;
    const mean = g.indications.reduce((s: number, v: number) => s + v, 0) / n;

    // Sample standard deviation
    const variance =
      g.indications.reduce((s: number, v: number) => s + Math.pow(v - mean, 2), 0) / (n - 1);
    const stdDev = Math.sqrt(variance);

    // OIML repeatability criterion: max deviation from minimum indication
    const minInd = Math.min(...g.indications);
    const maxDeviation = Math.max(...g.indications.map((i: number) => Math.abs(i - minInd)));

    const mpe = lookupMPE(g.accuracyClass, g.appliedLoad, g.verificationInterval);
    const pass = maxDeviation <= mpe;

    return {
      appliedLoad: g.appliedLoad,
      indications: g.indications,
      mean,
      maxDeviation,
      stdDev,
      mpe,
      pass,
    };
  });

  return {
    groups: groupResults,
    allPass: groupResults.every(r => r.pass),
  };
}

// ---------------------------------------------------------------------------
// T.2.9 – Eccentricity Test
// ---------------------------------------------------------------------------
/**
 * OIML R-76 specifies loading at the centre and at least 4 other positions.
 * Eccentricity = max( |I_position − I_centre| ) for any position vs centre.
 * PASS: max deviation ≤ MPE at that load.
 *
 * NOTE: The centre position is identified by position name "centre".
 */
export function runEccentricityTest(
  tests: z.infer<typeof EccentricityObservationSchema>[],
): { tests: EccentricityRowResult[]; allPass: boolean } {
  const parsedTests = tests.map(t => EccentricityObservationSchema.parse(t));

  const testResults: EccentricityRowResult[] = parsedTests.map(t => {
    const centrePos = t.positions.find((p: { position: string; indication: number }) =>
      p.position.toLowerCase() === 'centre' || p.position.toLowerCase() === 'center',
    );
    const centreIndication = centrePos?.indication ?? t.positions[0].indication;

    const positions = t.positions.map((p: { position: string; indication: number }) => ({
      position: p.position,
      indication: p.indication,
      error: p.indication - centreIndication,
    }));

    const maxDeviation = Math.max(...positions.map((p: { position: string; indication: number; error: number }) => Math.abs(p.error)));
    const mpe = lookupMPE(t.accuracyClass, t.appliedLoad, t.verificationInterval);
    const pass = maxDeviation <= mpe;

    return { appliedLoad: t.appliedLoad, positions, maxDeviation, mpe, pass };
  });

  return { tests: testResults, allPass: testResults.every(r => r.pass) };
}

// ---------------------------------------------------------------------------
// T.2.6 – Zero Setting / Tare Test
// ---------------------------------------------------------------------------
/**
 * Zero drift = zeroAfterTest − zeroBeforeTest
 * MPE for zero setting = 0.25 × e  (OIML R-76, T.2.6.2)
 * PASS: |drift| ≤ 0.25e
 */
export function runZeroSettingTest(
  obs: z.infer<typeof ZeroSettingObservationSchema>,
): ZeroSettingResult {
  const parsed = ZeroSettingObservationSchema.parse(obs);
  const drift = parsed.zeroAfterTest - parsed.zeroBeforeTest;
  const mpe = 0.25 * parsed.verificationInterval; // 0.25e per OIML
  const pass = Math.abs(drift) <= mpe;
  return {
    zeroBeforeTest: parsed.zeroBeforeTest,
    zeroAfterTest: parsed.zeroAfterTest,
    drift,
    mpe,
    pass,
  };
}

// ---------------------------------------------------------------------------
// T.2.7 – Return to Zero Test
// ---------------------------------------------------------------------------
/**
 * After removing the preload, the instrument must return to within 0.5e of zero.
 * PASS: |returnIndication| ≤ 0.5e
 */
export function runReturnToZeroTest(
  obs: z.infer<typeof ReturnToZeroObservationSchema>,
): ReturnToZeroResult {
  const parsed = ReturnToZeroObservationSchema.parse(obs);
  const error = Math.abs(parsed.returnIndication);
  const mpe = 0.5 * parsed.verificationInterval; // 0.5e per OIML
  const pass = error <= mpe;
  return {
    preLoad: parsed.preLoad,
    returnIndication: parsed.returnIndication,
    error,
    mpe,
    pass,
  };
}

// ---------------------------------------------------------------------------
// T.2.7 – Span Test
// ---------------------------------------------------------------------------
/**
 * Span test evaluates accuracy at or near max capacity.
 * Same MPE lookup as weighing performance test.
 */
export function runSpanTest(obs: z.infer<typeof SpanObservationSchema>): SpanResult {
  const parsed = SpanObservationSchema.parse(obs);
  const error = parsed.indication - parsed.referenceLoad;
  const mpe = lookupMPE(
    parsed.accuracyClass,
    parsed.referenceLoad,
    parsed.verificationInterval,
  );
  const pass = Math.abs(error) <= mpe;
  return {
    referenceLoad: parsed.referenceLoad,
    indication: parsed.indication,
    error,
    mpe,
    pass,
  };
}

// ---------------------------------------------------------------------------
// T.2.4 – Discrimination Test
// ---------------------------------------------------------------------------
/**
 * A small additional weight (1.4d, where d = e for class I/II) is added.
 * The indication must change by at least one scale interval.
 * PASS: indicationAfter > indicationBefore (indication stepped up)
 */
export function runDiscriminationTest(
  obs: z.infer<typeof DiscriminationObservationSchema>,
): DiscriminationResult {
  const parsed = DiscriminationObservationSchema.parse(obs);
  const delta = parsed.indicationAfter - parsed.indicationBefore;
  const expectedStep = parsed.verificationInterval; // 1e expected
  const pass = delta > 0; // indication must increase
  return {
    appliedLoad: parsed.appliedLoad,
    indicationBefore: parsed.indicationBefore,
    indicationAfter: parsed.indicationAfter,
    addedWeight: parsed.addedWeight,
    delta,
    expectedStep,
    pass,
  };
}

// =============================================================================
// MASTER CALCULATOR – combines all test modules into a single audit payload
// =============================================================================

export interface OIMLTestInput {
  weighingRows: z.infer<typeof WeighingObservationSchema>[];
  repeatabilityGroups?: z.infer<typeof RepeatabilityObservationSchema>[];
  eccentricityTests?: z.infer<typeof EccentricityObservationSchema>[];
  zeroSetting?: z.infer<typeof ZeroSettingObservationSchema>;
  returnToZero?: z.infer<typeof ReturnToZeroObservationSchema>;
  spanTest?: z.infer<typeof SpanObservationSchema>;
  discriminationTest?: z.infer<typeof DiscriminationObservationSchema>;
}

/**
 * Master deterministic OIML R-76 calculation.
 * Every result is derived from inputs and the official MPE table.
 * No hardcoded results.
 */
export function calculateOIML(input: OIMLTestInput) {
  // 1. Weighing Performance Test (mandatory)
  const weighingResult = runWeighingPerformanceTest(input.weighingRows);

  // 2. Repeatability Test (mandatory if data provided)
  const repeatabilityResult = input.repeatabilityGroups?.length
    ? runRepeatabilityTest(input.repeatabilityGroups)
    : null;

  // 3. Eccentricity Test (mandatory if data provided)
  const eccentricityResult = input.eccentricityTests?.length
    ? runEccentricityTest(input.eccentricityTests)
    : null;

  // 4. Zero Setting Test (optional but recommended)
  const zeroSettingResult = input.zeroSetting
    ? runZeroSettingTest(input.zeroSetting)
    : null;

  // 5. Return to Zero Test
  const returnToZeroResult = input.returnToZero
    ? runReturnToZeroTest(input.returnToZero)
    : null;

  // 6. Span Test
  const spanResult = input.spanTest
    ? runSpanTest(input.spanTest)
    : null;

  // 7. Discrimination Test
  const discriminationResult = input.discriminationTest
    ? runDiscriminationTest(input.discriminationTest)
    : null;

  // Overall PASS: all executed modules must pass
  const moduleResults = [
    weighingResult.allPass,
    repeatabilityResult ? repeatabilityResult.allPass : null,
    eccentricityResult ? eccentricityResult.allPass : null,
    zeroSettingResult ? zeroSettingResult.pass : null,
    returnToZeroResult ? returnToZeroResult.pass : null,
    spanResult ? spanResult.pass : null,
    discriminationResult ? discriminationResult.pass : null,
  ].filter(r => r !== null) as boolean[];

  const overallPass = moduleResults.every(r => r === true);
  const overallDecision: 'PASS' | 'FAIL' = overallPass ? 'PASS' : 'FAIL';

  return {
    engineVersion: ENGINE_VERSION,
    overallDecision,
    overallPass,
    instrumentValidation: weighingResult.validation,
    tests: {
      weighingPerformance: weighingResult,
      repeatability: repeatabilityResult,
      eccentricity: eccentricityResult,
      zeroSetting: zeroSettingResult,
      returnToZero: returnToZeroResult,
      span: spanResult,
      discrimination: discriminationResult,
    },
  };
}
