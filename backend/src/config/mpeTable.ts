/**
 * OIML R-76 Official MPE Table Configuration
 * Source: OIML R 76-1 (2006) – Non-automatic weighing instruments
 *
 * Classes: I, II, III, IIII
 * Regions: load-based on verification scale intervals (n = L / e)
 *
 * MPE values are expressed in multiples of verification interval (e).
 * E.g., 0.5e = half a verification interval.
 */

export type AccuracyClass = 'I' | 'II' | 'III' | 'IIII';
export type Region = 'low' | 'mid' | 'high';

/**
 * OIML R-76 Table 1 – Maximum Permissible Errors (MPE)
 * Values are in multiples of verification interval (e)
 *
 * Region thresholds by class (in number of verification intervals n = L/e):
 *
 * Class I   : low = 0–50000, mid = 50000–200000, high = >200000
 * Class II  : low = 0–5000,  mid = 5000–20000,   high = >20000
 * Class III : low = 0–500,   mid = 500–2000,      high = >2000
 * Class IIII: low = 0–50,    mid = 50–200,        high = >200
 *
 * MPE:
 *   low  → ±0.5e
 *   mid  → ±1.0e
 *   high → ±1.5e
 *
 * (Same MPE multiplier across all classes; differs in region thresholds)
 */
export const MPE_MULTIPLIER: Record<Region, number> = {
  low: 0.5,   // ±0.5e
  mid: 1.0,   // ±1.0e
  high: 1.5,  // ±1.5e
};

/**
 * Region thresholds in terms of number of verification scale intervals (n = L / e)
 * Where L = Applied Load, e = Verification Interval
 *
 * Returns [lowUpperBound, midUpperBound] in n units.
 * If n < lowUpper → low region
 * If n < midUpper → mid region
 * Else → high region
 */
export const REGION_THRESHOLDS: Record<AccuracyClass, [number, number]> = {
  I:    [50000,  200000],
  II:   [5000,   20000],
  III:  [500,    2000],
  IIII: [50,     200],
};

/**
 * Minimum verification intervals (e) per class per OIML R-76 Table 2
 * Class I   : e ≥ 1 mg
 * Class II  : e ≥ 1 mg (if Max ≤ 100g) else e ≥ 0.1 g
 * Class III : e ≥ 0.1 g
 * Class IIII: e ≥ 5 g
 */
export const MIN_VERIFICATION_INTERVAL: Record<AccuracyClass, number> = {
  I:    0.000001, // 1 µg (in kg)
  II:   0.000001, // 1 mg
  III:  0.0001,   // 0.1 g
  IIII: 0.005,    // 5 g
};

/**
 * Minimum/Maximum number of verification scale intervals per class
 * Source: OIML R-76-1 Table 2
 *
 * [minN, maxN]
 */
export const VERIFICATION_SCALE_INTERVAL_LIMITS: Record<AccuracyClass, [number, number]> = {
  I:    [50000,   Infinity],
  II:   [100,     100000],
  III:  [100,     10000],
  IIII: [100,     1000],
};

/**
 * Determine the load region based on n = L / e (number of verification intervals).
 */
export function getRegion(
  appliedLoad: number,
  verificationInterval: number,
  accuracyClass: AccuracyClass,
): Region {
  const n = appliedLoad / verificationInterval;
  const [lowUpper, midUpper] = REGION_THRESHOLDS[accuracyClass];
  if (n <= lowUpper) return 'low';
  if (n <= midUpper) return 'mid';
  return 'high';
}

/**
 * Calculate n (number of verification scale intervals).
 * n = Max Capacity / e
 */
export function calculateN(maxCapacity: number, verificationInterval: number): number {
  return maxCapacity / verificationInterval;
}

/**
 * Validate that n is within the permissible range for the given class.
 */
export function validateN(
  n: number,
  accuracyClass: AccuracyClass,
): { valid: boolean; message?: string } {
  const [minN, maxN] = VERIFICATION_SCALE_INTERVAL_LIMITS[accuracyClass];
  if (n < minN) {
    return {
      valid: false,
      message: `n (${n}) is below minimum (${minN}) for Class ${accuracyClass}`,
    };
  }
  if (n > maxN) {
    return {
      valid: false,
      message: `n (${n}) exceeds maximum (${maxN}) for Class ${accuracyClass}`,
    };
  }
  return { valid: true };
}

/**
 * Lookup MPE in absolute units (kg or gram – same unit as e).
 *
 * Formula: MPE = multiplier × e
 *   where multiplier ∈ {0.5, 1.0, 1.5} based on region
 */
export function lookupMPE(
  accuracyClass: AccuracyClass,
  appliedLoad: number,
  verificationInterval: number,
): number {
  const region = getRegion(appliedLoad, verificationInterval, accuracyClass);
  const multiplier = MPE_MULTIPLIER[region];
  return multiplier * verificationInterval;
}
