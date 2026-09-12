/**
 * OIML R 76-1:2006 (E) Authoritative Deterministic Metrology Engine
 * Standard: Non-automatic weighing instruments - Metrological and technical requirements - Tests
 *
 * Implements strict, clause-by-clause mathematical rules and deterministic verification mappings.
 */

export type AccuracyClass = 'I' | 'II' | 'III' | 'IIII'

export type VerificationType = 'INITIAL' | 'SERVICE'

export interface ClauseReference {
  clause: string
  title: string
  description: string
}

export const OIML_CLAUSES = {
  CLASSIFICATION: {
    clause: 'OIML R 76-1 Cl. 3.2 (Table 3)',
    title: 'Classification of instruments',
    description: 'Verifies scale intervals (e), number of intervals (n = Max/e), and minimum capacity (Min).',
  },
  MPE_INITIAL: {
    clause: 'OIML R 76-1 Cl. 3.5.1 (Table 6)',
    title: 'Maximum permissible errors on initial verification',
    description: 'Step-function MPE thresholds (±0.5e, ±1.0e, ±1.5e) for test loads.',
  },
  MPE_SERVICE: {
    clause: 'OIML R 76-1 Cl. 3.5.2',
    title: 'Maximum permissible errors in service',
    description: 'In-service MPE equals twice the initial verification MPE (2 × MPE).',
  },
  ERROR_EVALUATION: {
    clause: 'OIML R 76-1 Cl. T.5.5.1 & Cl. A.4.4.3',
    title: 'Determination of weighing error and corrected error',
    description: 'Computes intrinsic error E = I - L and corrected error Ec = E - E0.',
  },
  REPEATABILITY: {
    clause: 'OIML R 76-1 Cl. 3.6.1 & Cl. A.4.10',
    title: 'Repeatability requirement',
    description: 'Difference between results of several weighings of the same load <= |MPE|.',
  },
  ECCENTRICITY: {
    clause: 'OIML R 76-1 Cl. 3.6.2 & Cl. A.4.7',
    title: 'Eccentric loading requirement',
    description: 'Indications for eccentric positions (1/3 Max) must meet MPE for applied load.',
  },
  ZERO_SETTING_ACCURACY: {
    clause: 'OIML R 76-1 Cl. 4.5.2 & Cl. A.4.2.3',
    title: 'Accuracy of zero-setting device',
    description: 'Effect of zero deviation on weighing results shall not exceed ±0.25e.',
  },
  TARE_ACCURACY: {
    clause: 'OIML R 76-1 Cl. 4.6.3 & Cl. A.4.6.2',
    title: 'Accuracy of tare setting device',
    description: 'Tare device setting to zero must be within ±0.25e for electronic instruments.',
  },
  DISCRIMINATION: {
    clause: 'OIML R 76-1 Cl. 3.8.2.2 & Cl. A.4.8.2',
    title: 'Discrimination for digital indication',
    description: 'Additional load equal to 1.4d shall unambiguously change the indication (d >= 5 mg).',
  },
  OVERLOAD_LIMIT: {
    clause: 'OIML R 76-1 Cl. 4.2.3',
    title: 'Limits of indication (Overload)',
    description: 'No indication above Max + 9e is permissible.',
  },
  DESCRIPTIVE_MARKINGS: {
    clause: 'OIML R 76-1 Cl. 7.1',
    title: 'Descriptive markings',
    description: 'Mandatory markings: Manufacturer, Class, Max, Min, e, Serial.',
  },
} as const

/**
 * Step-function region thresholds (in units of n = load / e)
 * Derived strictly from OIML R 76-1:2006 (E) Table 6 (Clause 3.5.1)
 */
export const MPE_TIER_THRESHOLDS: Record<AccuracyClass, [number, number]> = {
  I:    [50000, 200000],   // Class I:   0 <= n <= 50000 (0.5e), 50000 < n <= 200000 (1.0e), n > 200000 (1.5e)
  II:   [5000, 20000],     // Class II:  0 <= n <= 5000  (0.5e), 5000 < n <= 20000   (1.0e), 20000 < n <= 100000 (1.5e)
  III:  [500, 2000],       // Class III: 0 <= n <= 500   (0.5e), 500 < n <= 2000     (1.0e), 2000 < n <= 10000   (1.5e)
  IIII: [50, 200],         // Class IIII:0 <= n <= 50    (0.5e), 50 < n <= 200       (1.0e), 200 < n <= 1000     (1.5e)
}

/**
 * Verification scale interval and n limits per Table 3 (Clause 3.2)
 */
export const CLASSIFICATION_LIMITS: Record<
  AccuracyClass,
  { minN: number; maxN: number; minCapacityMultiplier: number }
> = {
  I:    { minN: 50000, maxN: Infinity, minCapacityMultiplier: 100 }, // Min = 100e
  II:   { minN: 100,   maxN: 100000,   minCapacityMultiplier: 20 },  // Min = 20e (or 50e if e >= 0.1g)
  III:  { minN: 100,   maxN: 10000,    minCapacityMultiplier: 20 },  // Min = 20e
  IIII: { minN: 100,   maxN: 1000,     minCapacityMultiplier: 10 },  // Min = 10e
}

/**
 * Calculates Maximum Permissible Error (MPE) for a given load.
 * Complies with OIML R 76-1:2006 (E) Clause 3.5.1 (Table 6) and Clause 3.5.2.
 */
export function getOIMLMPE(
  load: number,
  verificationInterval: number,
  accuracyClass: string | AccuracyClass,
  verificationType: VerificationType = 'INITIAL'
): { mpeAbsolute: number; mpeMultiplier: number; tier: 'T1' | 'T2' | 'T3'; clause: string } {
  const normClass = (accuracyClass.toUpperCase() as AccuracyClass) || 'III'
  const e = verificationInterval > 0 ? verificationInterval : 0.001
  const n = e > 0 ? load / e : 0
  const thresholds = MPE_TIER_THRESHOLDS[normClass] || MPE_TIER_THRESHOLDS['III']

  let baseMultiplier = 1.5
  let tier: 'T1' | 'T2' | 'T3' = 'T3'

  if (n <= thresholds[0]) {
    baseMultiplier = 0.5
    tier = 'T1'
  } else if (n <= thresholds[1]) {
    baseMultiplier = 1.0
    tier = 'T2'
  } else {
    baseMultiplier = 1.5
    tier = 'T3'
  }

  // Clause 3.5.2: In-service MPE is 2x initial MPE
  const multiplier = verificationType === 'SERVICE' ? baseMultiplier * 2 : baseMultiplier
  const mpeAbsolute = multiplier * e
  const clause = verificationType === 'SERVICE' ? OIML_CLAUSES.MPE_SERVICE.clause : OIML_CLAUSES.MPE_INITIAL.clause

  return {
    mpeAbsolute,
    mpeMultiplier: multiplier,
    tier,
    clause,
  }
}

/**
 * Evaluates single weighing reading with complete OIML Clause breakdown
 */
export function evaluateWeighingReading(
  load: number,
  indication: number,
  verificationInterval: number,
  accuracyClass: string | AccuracyClass,
  zeroError: number = 0,
  verificationType: VerificationType = 'INITIAL'
) {
  if (!Number.isFinite(load) || !Number.isFinite(indication)) {
    return {
      error: '—',
      correctedError: '—',
      mpe: '—',
      result: 'Review' as const,
      pass: false,
      clause: OIML_CLAUSES.MPE_INITIAL.clause,
      deviationRatio: 0,
    }
  }

  // Clause T.5.5.1: Error of Indication E = I - L
  const rawError = indication - load

  // Clause A.4.4.3: Corrected Error Ec = E - E0
  const correctedError = rawError - zeroError

  const { mpeAbsolute, clause } = getOIMLMPE(load, verificationInterval, accuracyClass, verificationType)
  const absError = Math.abs(correctedError)
  const pass = absError <= mpeAbsolute
  const deviationRatio = mpeAbsolute > 0 ? (absError / mpeAbsolute) * 100 : 0

  return {
    error: `${rawError >= 0 ? '+' : ''}${rawError.toFixed(3)}`,
    correctedError: `${correctedError >= 0 ? '+' : ''}${correctedError.toFixed(3)}`,
    mpe: `±${mpeAbsolute.toFixed(3)}`,
    result: pass ? ('Pass' as const) : ('Review' as const),
    pass,
    clause,
    deviationRatio: Number(deviationRatio.toFixed(1)),
  }
}

/**
 * Evaluates Instrument Classification under Clause 3.2 (Table 3)
 */
export function validateInstrumentClassification(
  maxCapacity: number,
  verificationInterval: number,
  accuracyClass: string | AccuracyClass
) {
  const normClass = (accuracyClass.toUpperCase() as AccuracyClass) || 'III'
  const limits = CLASSIFICATION_LIMITS[normClass] || CLASSIFICATION_LIMITS['III']
  const n = verificationInterval > 0 ? maxCapacity / verificationInterval : 0
  const minCapacity = limits.minCapacityMultiplier * verificationInterval

  const nValid = n >= limits.minN && n <= limits.maxN
  return {
    n,
    minCapacity,
    nValid,
    limits,
    clause: OIML_CLAUSES.CLASSIFICATION.clause,
    message: nValid
      ? `Valid Class ${normClass} instrument (n = ${n.toLocaleString()}, Min = ${minCapacity} kg)`
      : `n = ${n.toLocaleString()} is outside allowed range [${limits.minN.toLocaleString()}, ${limits.maxN.toLocaleString()}] for Class ${normClass}`,
  }
}

/**
 * Evaluates Repeatability under Clause 3.6.1 & Clause A.4.10
 */
export function evaluateRepeatability(
  indications: number[],
  load: number,
  verificationInterval: number,
  accuracyClass: string | AccuracyClass
) {
  if (indications.length === 0) return { pass: false, range: 0, mpe: 0, clause: OIML_CLAUSES.REPEATABILITY.clause }
  const maxInd = Math.max(...indications)
  const minInd = Math.min(...indications)
  const range = maxInd - minInd
  const { mpeAbsolute } = getOIMLMPE(load, verificationInterval, accuracyClass)
  const pass = range <= mpeAbsolute

  return {
    pass,
    range: Number(range.toFixed(4)),
    mpe: mpeAbsolute,
    clause: OIML_CLAUSES.REPEATABILITY.clause,
  }
}

/**
 * Evaluates Eccentricity under Clause 3.6.2 & Clause A.4.7
 */
export function evaluateEccentricity(
  cornerIndications: number[],
  centerIndication: number,
  testLoad: number,
  verificationInterval: number,
  accuracyClass: string | AccuracyClass
) {
  const deviations = cornerIndications.map((ind) => Math.abs(ind - centerIndication))
  const maxDeviation = Math.max(...deviations, 0)
  const { mpeAbsolute } = getOIMLMPE(testLoad, verificationInterval, accuracyClass)
  const pass = maxDeviation <= mpeAbsolute

  return {
    pass,
    maxDeviation: Number(maxDeviation.toFixed(4)),
    mpe: mpeAbsolute,
    clause: OIML_CLAUSES.ECCENTRICITY.clause,
  }
}
