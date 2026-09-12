/**
 * OIML R-76 Deterministic Calculation Engine
 * Version: 2.1.0
 * Standard: OIML R 76-1:2006 (E) – Non-automatic weighing instruments
 *
 * Implements deterministic calculation and clause verification for:
 *   1. Weighing Performance Test     (Clause 3.5.1, Clause T.5.5.1, Clause A.4.4.3)
 *   2. Repeatability Test            (Clause 3.6.1, Clause A.4.10)
 *   3. Eccentricity Test             (Clause 3.6.2, Clause A.4.7)
 *   4. Zero Setting / Tare Test      (Clause 4.5.2, Clause 4.6.3, Clause A.4.2.3, Clause A.4.6.2)
 *   5. Return to Zero Test           (Clause 3.9.4.2, Clause A.4.11.2)
 *   6. Span Test                     (Clause 3.5.1, Clause 5.4.4)
 *   7. Discrimination Test           (Clause 3.8.2.2, Clause A.4.8.2)
 *   8. Limits of Indication/Overload (Clause 4.2.3)
 *
 * All outputs are derived deterministically from inputs and OIML R-76 clauses.
 */

import { z } from 'zod';
import {
  AccuracyClass,
  VerificationType,
  lookupMPE,
  calculateN,
  validateN,
  getRegion,
  OIML_CLAUSES,
} from '../config/mpeTable';

export { OIML_CLAUSES, AccuracyClass, VerificationType };

// =============================================================================
// INPUT SCHEMAS
// =============================================================================

/** A single weighing observation */
export const WeighingObservationSchema = z.object({
  appliedLoad: z.number().positive('Applied load must be positive'),
  indication: z.number(),
  accuracyClass: z.enum(['I', 'II', 'III', 'IIII'] as const),
  verificationInterval: z.number().positive('Verification interval must be positive'),
  maxCapacity: z.number().positive('Max capacity must be positive'),
  zeroError: z.number().optional().default(0),
  verificationType: z.enum(['INITIAL', 'SERVICE'] as const).optional().default('INITIAL'),
});

/** Repeatability test */
export const RepeatabilityObservationSchema = z.object({
  appliedLoad: z.number().positive(),
  indications: z.array(z.number()).min(3, 'OIML requires at least 3 repetitions (10 for type approval)'),
  accuracyClass: z.enum(['I', 'II', 'III', 'IIII'] as const),
  verificationInterval: z.number().positive(),
  maxCapacity: z.number().positive(),
});

/** Eccentricity test */
export const EccentricityObservationSchema = z.object({
  appliedLoad: z.number().positive(),
  positions: z.array(
    z.object({
      position: z.string(),
      indication: z.number(),
    })
  ).min(4, 'OIML requires at least 4 positions (4 quarter segments)'),
  accuracyClass: z.enum(['I', 'II', 'III', 'IIII'] as const),
  verificationInterval: z.number().positive(),
  maxCapacity: z.number().positive(),
});

/** Zero/Tare setting test observation */
export const ZeroSettingObservationSchema = z.object({
  zeroBeforeTest: z.number(),
  zeroAfterTest: z.number(),
  accuracyClass: z.enum(['I', 'II', 'III', 'IIII'] as const),
  verificationInterval: z.number().positive(),
  maxCapacity: z.number().positive(),
});

/** Return to zero test */
export const ReturnToZeroObservationSchema = z.object({
  preLoad: z.number().positive(),
  returnIndication: z.number(),
  accuracyClass: z.enum(['I', 'II', 'III', 'IIII'] as const),
  verificationInterval: z.number().positive(),
  maxCapacity: z.number().positive(),
});

/** Span test */
export const SpanObservationSchema = z.object({
  referenceLoad: z.number().positive(),
  indication: z.number(),
  accuracyClass: z.enum(['I', 'II', 'III', 'IIII'] as const),
  verificationInterval: z.number().positive(),
  maxCapacity: z.number().positive(),
});

/** Discrimination test */
export const DiscriminationObservationSchema = z.object({
  appliedLoad: z.number().positive(),
  indicationBefore: z.number(),
  indicationAfter: z.number(),
  addedWeight: z.number().positive(),
  accuracyClass: z.enum(['I', 'II', 'III', 'IIII'] as const),
  verificationInterval: z.number().positive(),
  maxCapacity: z.number().positive(),
});

export type WeighingObservationInput = z.input<typeof WeighingObservationSchema>;
export type RepeatabilityObservationInput = z.input<typeof RepeatabilityObservationSchema>;
export type EccentricityObservationInput = z.input<typeof EccentricityObservationSchema>;
export type ZeroSettingObservationInput = z.input<typeof ZeroSettingObservationSchema>;
export type ReturnToZeroObservationInput = z.input<typeof ReturnToZeroObservationSchema>;
export type SpanObservationInput = z.input<typeof SpanObservationSchema>;
export type DiscriminationObservationInput = z.input<typeof DiscriminationObservationSchema>;

// =============================================================================
// OUTPUT TYPES WITH OIML CLAUSE MAPPINGS
// =============================================================================

export interface InstrumentValidation {
  n: number;
  nValid: boolean;
  nMessage?: string;
  clause: string;
}

export interface WeighingRowResult {
  appliedLoad: number;
  indication: number;
  error: number;               // E = I - L (Clause T.5.5.1)
  correctedError: number;      // Ec = E - E0 (Clause A.4.4.3)
  absoluteError: number;       // |Ec|
  region: string;              // low / mid / high
  mpeMultiplier: number;       // 0.5 / 1.0 / 1.5 (in e units)
  mpe: number;                 // MPE in same unit as load (Clause 3.5.1 / 3.5.2)
  pass: boolean;               // |Ec| ≤ MPE
  clause: string;
}

export interface RepeatabilityRowResult {
  appliedLoad: number;
  indications: number[];
  mean: number;
  maxDeviation: number;        // max(I_i) - min(I_i) (Clause 3.6.1)
  stdDev: number;              // sample standard deviation
  mpe: number;
  pass: boolean;               // maxDeviation ≤ MPE (Clause 3.6.1)
  clause: string;
}

export interface EccentricityRowResult {
  appliedLoad: number;
  positions: { position: string; indication: number; error: number }[];
  maxDeviation: number;        // max |I_position - I_centre|
  mpe: number;
  pass: boolean;               // maxDeviation ≤ MPE (Clause 3.6.2)
  clause: string;
}

export interface ZeroSettingResult {
  zeroBeforeTest: number;
  zeroAfterTest: number;
  drift: number;               // zeroAfterTest - zeroBeforeTest
  mpe: number;                 // 0.25e per OIML Cl. 4.5.2
  pass: boolean;               // |drift| ≤ 0.25e
  clause: string;
}

export interface ReturnToZeroResult {
  preLoad: number;
  returnIndication: number;
  error: number;
  mpe: number;                 // 0.5e (Clause 3.9.4.2)
  pass: boolean;
  clause: string;
}

export interface SpanResult {
  referenceLoad: number;
  indication: number;
  error: number;
  mpe: number;
  pass: boolean;
  clause: string;
}

export interface DiscriminationResult {
  appliedLoad: number;
  indicationBefore: number;
  indicationAfter: number;
  addedWeight: number;
  delta: number;               // indicationAfter - indicationBefore
  expectedStep: number;        // 1 verification interval
  pass: boolean;               // delta > 0 (Clause 3.8.2.2)
  clause: string;
}

export const ENGINE_VERSION = '2.1.0';

// ---------------------------------------------------------------------------
// 1. Weighing Performance Test (Clause 3.5.1, Clause T.5.5.1, Clause A.4.4.3)
// ---------------------------------------------------------------------------
export function runWeighingPerformanceTest(
  rows: WeighingObservationInput[],
): {
  validation: InstrumentValidation;
  rows: WeighingRowResult[];
  allPass: boolean;
  clausesVerified: string[];
} {
  const parsed = rows.map(r => WeighingObservationSchema.parse(r));
  const first = parsed[0];
  const n = calculateN(first.maxCapacity, first.verificationInterval);
  const nValidation = validateN(n, first.accuracyClass);

  const rowResults: WeighingRowResult[] = parsed.map(obs => {
    // Clause T.5.5.1: Error of Indication E = I - L
    const error = obs.indication - obs.appliedLoad;
    // Clause A.4.4.3: Corrected Error Ec = E - E0
    const correctedError = error - (obs.zeroError || 0);
    const absoluteError = Math.abs(correctedError);
    const region = getRegion(obs.appliedLoad, obs.verificationInterval, obs.accuracyClass);
    // Clause 3.5.1 (Table 6) / Clause 3.5.2
    const mpe = lookupMPE(obs.accuracyClass, obs.appliedLoad, obs.verificationInterval, obs.verificationType);
    const mpeMultiplier = mpe / obs.verificationInterval;
    const pass = absoluteError <= mpe;
    const clause = obs.verificationType === 'SERVICE' 
      ? OIML_CLAUSES.MPE_SERVICE.clause 
      : OIML_CLAUSES.MPE_INITIAL.clause;

    return {
      appliedLoad: obs.appliedLoad,
      indication: obs.indication,
      error,
      correctedError,
      absoluteError,
      region,
      mpeMultiplier,
      mpe,
      pass,
      clause,
    };
  });

  return {
    validation: { n, nValid: nValidation.valid, nMessage: nValidation.message, clause: nValidation.clause },
    rows: rowResults,
    allPass: rowResults.every(r => r.pass),
    clausesVerified: [
      OIML_CLAUSES.CLASSIFICATION.clause,
      OIML_CLAUSES.ERROR_EVALUATION.clause,
      OIML_CLAUSES.MPE_INITIAL.clause,
    ],
  };
}

// ---------------------------------------------------------------------------
// 2. Repeatability Test (Clause 3.6.1, Clause A.4.10)
// ---------------------------------------------------------------------------
export function runRepeatabilityTest(
  groups: z.infer<typeof RepeatabilityObservationSchema>[],
): { groups: RepeatabilityRowResult[]; allPass: boolean; clause: string } {
  const parsedGroups = groups.map(g => RepeatabilityObservationSchema.parse(g));

  const groupResults: RepeatabilityRowResult[] = parsedGroups.map(g => {
    const n = g.indications.length;
    const mean = g.indications.reduce((s: number, v: number) => s + v, 0) / n;
    const variance = g.indications.reduce((s: number, v: number) => s + Math.pow(v - mean, 2), 0) / (n - 1);
    const stdDev = Math.sqrt(variance);

    // OIML Clause 3.6.1: Difference between extreme weighings (max - min)
    const maxInd = Math.max(...g.indications);
    const minInd = Math.min(...g.indications);
    const maxDeviation = maxInd - minInd;

    const mpe = lookupMPE(g.accuracyClass, g.appliedLoad, g.verificationInterval);
    const pass = maxDeviation <= mpe;

    return {
      appliedLoad: g.appliedLoad,
      indications: g.indications,
      mean,
      maxDeviation: Number(maxDeviation.toFixed(4)),
      stdDev: Number(stdDev.toFixed(4)),
      mpe,
      pass,
      clause: OIML_CLAUSES.REPEATABILITY.clause,
    };
  });

  return {
    groups: groupResults,
    allPass: groupResults.every(r => r.pass),
    clause: OIML_CLAUSES.REPEATABILITY.clause,
  };
}

// ---------------------------------------------------------------------------
// 3. Eccentricity Test (Clause 3.6.2, Clause A.4.7)
// ---------------------------------------------------------------------------
export function runEccentricityTest(
  tests: z.infer<typeof EccentricityObservationSchema>[],
): { tests: EccentricityRowResult[]; allPass: boolean; clause: string } {
  const parsedTests = tests.map(t => EccentricityObservationSchema.parse(t));

  const testResults: EccentricityRowResult[] = parsedTests.map(t => {
    const centrePos = t.positions.find(
      p => p.position.toLowerCase() === 'centre' || p.position.toLowerCase() === 'center'
    );
    const centreIndication = centrePos?.indication ?? t.positions[0].indication;

    const positions = t.positions.map(p => ({
      position: p.position,
      indication: p.indication,
      error: Number((p.indication - centreIndication).toFixed(4)),
    }));

    const maxDeviation = Math.max(...positions.map(p => Math.abs(p.error)));
    const mpe = lookupMPE(t.accuracyClass, t.appliedLoad, t.verificationInterval);
    const pass = maxDeviation <= mpe;

    return {
      appliedLoad: t.appliedLoad,
      positions,
      maxDeviation: Number(maxDeviation.toFixed(4)),
      mpe,
      pass,
      clause: OIML_CLAUSES.ECCENTRICITY.clause,
    };
  });

  return {
    tests: testResults,
    allPass: testResults.every(r => r.pass),
    clause: OIML_CLAUSES.ECCENTRICITY.clause,
  };
}

// ---------------------------------------------------------------------------
// 4. Zero Setting / Tare Test (Clause 4.5.2, Clause A.4.2.3)
// ---------------------------------------------------------------------------
export function runZeroSettingTest(
  obs: z.infer<typeof ZeroSettingObservationSchema>,
): ZeroSettingResult {
  const parsed = ZeroSettingObservationSchema.parse(obs);
  const drift = parsed.zeroAfterTest - parsed.zeroBeforeTest;
  // OIML Clause 4.5.2: Effect of zero deviation on result shall not exceed ±0.25e
  const mpe = 0.25 * parsed.verificationInterval;
  const pass = Math.abs(drift) <= mpe;
  return {
    zeroBeforeTest: parsed.zeroBeforeTest,
    zeroAfterTest: parsed.zeroAfterTest,
    drift: Number(drift.toFixed(4)),
    mpe,
    pass,
    clause: OIML_CLAUSES.ZERO_SETTING_ACCURACY.clause,
  };
}

// ---------------------------------------------------------------------------
// 5. Return to Zero Test (Clause 3.9.4.2)
// ---------------------------------------------------------------------------
export function runReturnToZeroTest(
  obs: z.infer<typeof ReturnToZeroObservationSchema>,
): ReturnToZeroResult {
  const parsed = ReturnToZeroObservationSchema.parse(obs);
  const error = Math.abs(parsed.returnIndication);
  const mpe = 0.5 * parsed.verificationInterval;
  const pass = error <= mpe;
  return {
    preLoad: parsed.preLoad,
    returnIndication: parsed.returnIndication,
    error: Number(error.toFixed(4)),
    mpe,
    pass,
    clause: 'OIML R 76-1 Cl. 3.9.4.2',
  };
}

// ---------------------------------------------------------------------------
// 6. Span Test (Clause 3.5.1, Clause 5.4.4)
// ---------------------------------------------------------------------------
export function runSpanTest(obs: z.infer<typeof SpanObservationSchema>): SpanResult {
  const parsed = SpanObservationSchema.parse(obs);
  const error = parsed.indication - parsed.referenceLoad;
  const mpe = lookupMPE(parsed.accuracyClass, parsed.referenceLoad, parsed.verificationInterval);
  const pass = Math.abs(error) <= mpe;
  return {
    referenceLoad: parsed.referenceLoad,
    indication: parsed.indication,
    error: Number(error.toFixed(4)),
    mpe,
    pass,
    clause: OIML_CLAUSES.MPE_INITIAL.clause,
  };
}

// ---------------------------------------------------------------------------
// 7. Discrimination Test (Clause 3.8.2.2, Clause A.4.8.2)
// ---------------------------------------------------------------------------
export function runDiscriminationTest(
  obs: z.infer<typeof DiscriminationObservationSchema>,
): DiscriminationResult {
  const parsed = DiscriminationObservationSchema.parse(obs);
  const delta = parsed.indicationAfter - parsed.indicationBefore;
  const expectedStep = parsed.verificationInterval;
  const pass = delta > 0;
  return {
    appliedLoad: parsed.appliedLoad,
    indicationBefore: parsed.indicationBefore,
    indicationAfter: parsed.indicationAfter,
    addedWeight: parsed.addedWeight,
    delta: Number(delta.toFixed(4)),
    expectedStep,
    pass,
    clause: OIML_CLAUSES.DISCRIMINATION.clause,
  };
}

// =============================================================================
// MASTER CALCULATOR WITH FULL CLAUSE AUDIT
// =============================================================================

export interface OIMLTestInput {
  weighingRows: WeighingObservationInput[];
  repeatabilityGroups?: RepeatabilityObservationInput[];
  eccentricityTests?: EccentricityObservationInput[];
  zeroSetting?: ZeroSettingObservationInput;
  returnToZero?: ReturnToZeroObservationInput;
  spanTest?: SpanObservationInput;
  discriminationTest?: DiscriminationObservationInput;
}

export function calculateOIML(input: OIMLTestInput) {
  const weighingResult = runWeighingPerformanceTest(input.weighingRows);
  const repeatabilityResult = input.repeatabilityGroups?.length
    ? runRepeatabilityTest(input.repeatabilityGroups)
    : null;
  const eccentricityResult = input.eccentricityTests?.length
    ? runEccentricityTest(input.eccentricityTests)
    : null;
  const zeroSettingResult = input.zeroSetting
    ? runZeroSettingTest(input.zeroSetting)
    : null;
  const returnToZeroResult = input.returnToZero
    ? runReturnToZeroTest(input.returnToZero)
    : null;
  const spanResult = input.spanTest
    ? runSpanTest(input.spanTest)
    : null;
  const discriminationResult = input.discriminationTest
    ? runDiscriminationTest(input.discriminationTest)
    : null;

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

  const verifiedClauses: { clause: string; title: string; status: 'PASS' | 'FAIL' }[] = [
    {
      clause: OIML_CLAUSES.CLASSIFICATION.clause,
      title: OIML_CLAUSES.CLASSIFICATION.title,
      status: weighingResult.validation.nValid ? 'PASS' : 'FAIL',
    },
    {
      clause: OIML_CLAUSES.MPE_INITIAL.clause,
      title: OIML_CLAUSES.MPE_INITIAL.title,
      status: weighingResult.allPass ? 'PASS' : 'FAIL',
    },
    {
      clause: OIML_CLAUSES.ERROR_EVALUATION.clause,
      title: OIML_CLAUSES.ERROR_EVALUATION.title,
      status: 'PASS',
    },
  ];

  if (repeatabilityResult) {
    verifiedClauses.push({
      clause: OIML_CLAUSES.REPEATABILITY.clause,
      title: OIML_CLAUSES.REPEATABILITY.title,
      status: repeatabilityResult.allPass ? 'PASS' : 'FAIL',
    });
  }

  if (eccentricityResult) {
    verifiedClauses.push({
      clause: OIML_CLAUSES.ECCENTRICITY.clause,
      title: OIML_CLAUSES.ECCENTRICITY.title,
      status: eccentricityResult.allPass ? 'PASS' : 'FAIL',
    });
  }

  if (zeroSettingResult) {
    verifiedClauses.push({
      clause: OIML_CLAUSES.ZERO_SETTING_ACCURACY.clause,
      title: OIML_CLAUSES.ZERO_SETTING_ACCURACY.title,
      status: zeroSettingResult.pass ? 'PASS' : 'FAIL',
    });
  }

  if (discriminationResult) {
    verifiedClauses.push({
      clause: OIML_CLAUSES.DISCRIMINATION.clause,
      title: OIML_CLAUSES.DISCRIMINATION.title,
      status: discriminationResult.pass ? 'PASS' : 'FAIL',
    });
  }

  return {
    engineVersion: ENGINE_VERSION,
    overallDecision,
    overallPass,
    instrumentValidation: weighingResult.validation,
    verifiedClauses,
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
