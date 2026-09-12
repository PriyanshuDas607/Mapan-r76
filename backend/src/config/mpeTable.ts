/**
 * OIML R 76-1:2006 (E) Authoritative Deterministic Calculation & Clause Mapping Engine
 * Standard: Non-automatic weighing instruments - Metrological and technical requirements - Tests
 */

export type AccuracyClass = 'I' | 'II' | 'III' | 'IIII';
export type VerificationType = 'INITIAL' | 'SERVICE';
export type Region = 'low' | 'mid' | 'high';

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
} as const;

export const MPE_MULTIPLIER: Record<Region, number> = {
  low: 0.5,
  mid: 1.0,
  high: 1.5,
};

export const REGION_THRESHOLDS: Record<AccuracyClass, [number, number]> = {
  I:    [50000, 200000],
  II:   [5000,  20000],
  III:  [500,   2000],
  IIII: [50,    200],
};

export const VERIFICATION_SCALE_INTERVAL_LIMITS: Record<AccuracyClass, [number, number]> = {
  I:    [50000, Infinity],
  II:   [100,   100000],
  III:  [100,   10000],
  IIII: [100,   1000],
};

export function getRegion(
  appliedLoad: number,
  verificationInterval: number,
  accuracyClass: AccuracyClass,
): Region {
  const n = verificationInterval > 0 ? appliedLoad / verificationInterval : 0;
  const [lowUpper, midUpper] = REGION_THRESHOLDS[accuracyClass] || REGION_THRESHOLDS['III'];
  if (n <= lowUpper) return 'low';
  if (n <= midUpper) return 'mid';
  return 'high';
}

export function calculateN(maxCapacity: number, verificationInterval: number): number {
  return verificationInterval > 0 ? maxCapacity / verificationInterval : 0;
}

export function validateN(
  n: number,
  accuracyClass: AccuracyClass,
): { valid: boolean; message?: string; clause: string } {
  const [minN, maxN] = VERIFICATION_SCALE_INTERVAL_LIMITS[accuracyClass] || VERIFICATION_SCALE_INTERVAL_LIMITS['III'];
  if (n < minN) {
    return {
      valid: false,
      message: `n (${n}) is below minimum (${minN}) for Class ${accuracyClass}`,
      clause: OIML_CLAUSES.CLASSIFICATION.clause,
    };
  }
  if (n > maxN) {
    return {
      valid: false,
      message: `n (${n}) exceeds maximum (${maxN}) for Class ${accuracyClass}`,
      clause: OIML_CLAUSES.CLASSIFICATION.clause,
    };
  }
  return { valid: true, clause: OIML_CLAUSES.CLASSIFICATION.clause };
}

export function lookupMPE(
  accuracyClass: AccuracyClass,
  appliedLoad: number,
  verificationInterval: number,
  verificationType: VerificationType = 'INITIAL'
): number {
  const region = getRegion(appliedLoad, verificationInterval, accuracyClass);
  const baseMultiplier = MPE_MULTIPLIER[region];
  const multiplier = verificationType === 'SERVICE' ? baseMultiplier * 2 : baseMultiplier;
  return multiplier * verificationInterval;
}
