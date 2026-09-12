/**
 * OIML R 76-1:2006 (E) Authoritative Test Suite
 * Validates deterministic metrology engine across all standard boundary conditions,
 * accuracy classes, step-function MPE transitions, and edge cases.
 */

import {
  getRegion,
  lookupMPE,
  calculateN,
  validateN,
  REGION_THRESHOLDS,
  OIML_CLAUSES,
  AccuracyClass,
} from '../config/mpeTable';

import {
  calculateOIML,
  runWeighingPerformanceTest,
  runRepeatabilityTest,
  runEccentricityTest,
  runZeroSettingTest,
  runDiscriminationTest,
} from '../services/formulaEngine';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`FAIL: ${msg}`);
  }
}

console.log('================================================================');
console.log('🔬 RUNNING OIML R 76-1:2006 (E) CLAUSE-BY-CLAUSE TEST SUITE');
console.log('================================================================\n');

// ---------------------------------------------------------------------------
// TEST 1: Clause 3.5.1 (Table 6) - Class I Boundary Conditions
// ---------------------------------------------------------------------------
console.log('Test 1: Class I MPE Step-Function Transitions');
{
  const e = 0.001; // 1 mg (in g or kg unit system, e = 0.001)
  
  // Tier 1: 0 <= n <= 50,000 -> MPE = 0.5e (0.0005)
  assert(lookupMPE('I', 0, e) === 0.5 * e, 'Class I at n = 0 must be 0.5e');
  assert(lookupMPE('I', 50000 * e, e) === 0.5 * e, 'Class I at boundary n = 50,000 must be 0.5e');

  // Tier 2: 50,000 < n <= 200,000 -> MPE = 1.0e (0.001)
  assert(lookupMPE('I', 50001 * e, e) === 1.0 * e, 'Class I at n = 50,001 must step up to 1.0e');
  assert(lookupMPE('I', 200000 * e, e) === 1.0 * e, 'Class I at boundary n = 200,000 must be 1.0e');

  // Tier 3: n > 200,000 -> MPE = 1.5e (0.0015)
  assert(lookupMPE('I', 200001 * e, e) === 1.5 * e, 'Class I at n = 200,001 must step up to 1.5e');
  console.log('  ✓ Class I boundaries [50k, 200k] verified (Clause 3.5.1 Table 6)');
}

// ---------------------------------------------------------------------------
// TEST 2: Clause 3.5.1 (Table 6) - Class II Boundary Conditions
// ---------------------------------------------------------------------------
console.log('Test 2: Class II MPE Step-Function Transitions');
{
  const e = 0.01;
  assert(lookupMPE('II', 0, e) === 0.5 * e, 'Class II at n = 0 must be 0.5e');
  assert(lookupMPE('II', 5000 * e, e) === 0.5 * e, 'Class II at boundary n = 5,000 must be 0.5e');
  assert(lookupMPE('II', 5001 * e, e) === 1.0 * e, 'Class II at n = 5,001 must step up to 1.0e');
  assert(lookupMPE('II', 20000 * e, e) === 1.0 * e, 'Class II at boundary n = 20,000 must be 1.0e');
  assert(lookupMPE('II', 20001 * e, e) === 1.5 * e, 'Class II at n = 20,001 must step up to 1.5e');
  console.log('  ✓ Class II boundaries [5k, 20k] verified (Clause 3.5.1 Table 6)');
}

// ---------------------------------------------------------------------------
// TEST 3: Clause 3.5.1 (Table 6) - Class III Boundary Conditions
// ---------------------------------------------------------------------------
console.log('Test 3: Class III MPE Step-Function Transitions');
{
  const e = 0.01;
  assert(lookupMPE('III', 0, e) === 0.5 * e, 'Class III at n = 0 must be 0.5e');
  assert(lookupMPE('III', 500 * e, e) === 0.5 * e, 'Class III at boundary n = 500 must be 0.5e');
  assert(lookupMPE('III', 501 * e, e) === 1.0 * e, 'Class III at n = 501 must step up to 1.0e');
  assert(lookupMPE('III', 2000 * e, e) === 1.0 * e, 'Class III at boundary n = 2000 must be 1.0e');
  assert(lookupMPE('III', 2001 * e, e) === 1.5 * e, 'Class III at n = 2001 must step up to 1.5e');
  console.log('  ✓ Class III boundaries [500, 2000] verified (Clause 3.5.1 Table 6)');
}

// ---------------------------------------------------------------------------
// TEST 4: Clause 3.5.1 (Table 6) - Class IIII Boundary Conditions
// ---------------------------------------------------------------------------
console.log('Test 4: Class IIII MPE Step-Function Transitions');
{
  const e = 0.1;
  assert(lookupMPE('IIII', 0, e) === 0.5 * e, 'Class IIII at n = 0 must be 0.5e');
  assert(lookupMPE('IIII', 50 * e, e) === 0.5 * e, 'Class IIII at boundary n = 50 must be 0.5e');
  assert(lookupMPE('IIII', 51 * e, e) === 1.0 * e, 'Class IIII at n = 51 must step up to 1.0e');
  assert(lookupMPE('IIII', 200 * e, e) === 1.0 * e, 'Class IIII at boundary n = 200 must be 1.0e');
  assert(lookupMPE('IIII', 201 * e, e) === 1.5 * e, 'Class IIII at n = 201 must step up to 1.5e');
  console.log('  ✓ Class IIII boundaries [50, 200] verified (Clause 3.5.1 Table 6)');
}

// ---------------------------------------------------------------------------
// TEST 5: Clause 3.5.2 - In-Service MPE Multiplier (2x)
// ---------------------------------------------------------------------------
console.log('Test 5: In-Service MPE Evaluation (Clause 3.5.2)');
{
  const e = 0.01;
  const initialMPE = lookupMPE('III', 10, e, 'INITIAL');
  const serviceMPE = lookupMPE('III', 10, e, 'SERVICE');
  assert(serviceMPE === initialMPE * 2, 'In-service MPE must be exactly 2x initial MPE');
  console.log('  ✓ In-service MPE = 2 × Initial MPE verified (Clause 3.5.2)');
}

// ---------------------------------------------------------------------------
// TEST 6: Clause 3.2 (Table 3) - Verification Scale Intervals (n = Max/e)
// ---------------------------------------------------------------------------
console.log('Test 6: Instrument Classification & Scale Intervals (Clause 3.2 Table 3)');
{
  assert(validateN(3000, 'III').valid === true, 'Class III with n=3000 is valid');
  assert(validateN(50, 'III').valid === false, 'Class III with n=50 is below minimum 100');
  assert(validateN(15000, 'III').valid === false, 'Class III with n=15000 exceeds maximum 10000');
  assert(validateN(60000, 'I').valid === true, 'Class I with n=60000 is valid (min 50000)');
  console.log('  ✓ Classification limits & validation verified (Clause 3.2 Table 3)');
}

// ---------------------------------------------------------------------------
// TEST 7: Clause 3.6.1 & A.4.10 - Repeatability Test
// ---------------------------------------------------------------------------
console.log('Test 7: Repeatability Test (Clause 3.6.1 & Clause A.4.10)');
{
  const repResult = runRepeatabilityTest([
    {
      appliedLoad: 10,
      indications: [10.000, 10.002, 10.001, 10.003, 10.001],
      accuracyClass: 'III',
      verificationInterval: 0.01,
      maxCapacity: 30,
    },
  ]);
  assert(repResult.allPass === true, 'Repeatability range 0.003 <= MPE 0.01 must PASS');
  assert(repResult.groups[0].clause === OIML_CLAUSES.REPEATABILITY.clause, 'Repeatability clause mapped');
  console.log('  ✓ Repeatability criterion (max - min <= MPE) verified (Clause 3.6.1)');
}

// ---------------------------------------------------------------------------
// TEST 8: Clause 3.6.2 & A.4.7 - Eccentricity Loading Test
// ---------------------------------------------------------------------------
console.log('Test 8: Eccentric Loading Test (Clause 3.6.2 & Clause A.4.7)');
{
  const eccResult = runEccentricityTest([
    {
      appliedLoad: 10,
      positions: [
        { position: 'centre', indication: 10.000 },
        { position: 'front-left', indication: 10.002 },
        { position: 'front-right', indication: 10.001 },
        { position: 'back-left', indication: 10.003 },
        { position: 'back-right', indication: 10.002 },
      ],
      accuracyClass: 'III',
      verificationInterval: 0.01,
      maxCapacity: 30,
    },
  ]);
  assert(eccResult.allPass === true, 'Eccentricity max deviation 0.003 <= MPE 0.01 must PASS');
  console.log('  ✓ Eccentricity evaluation verified (Clause 3.6.2 & A.4.7)');
}

// ---------------------------------------------------------------------------
// TEST 9: Clause 4.5.2 & A.4.2.3 - Zero Setting Accuracy (0.25e)
// ---------------------------------------------------------------------------
console.log('Test 9: Accuracy of Zero Setting (Clause 4.5.2 & A.4.2.3)');
{
  const zeroResult = runZeroSettingTest({
    zeroBeforeTest: 0.000,
    zeroAfterTest: 0.002, // 0.002 <= 0.25 * 0.01 = 0.0025 -> Pass
    accuracyClass: 'III',
    verificationInterval: 0.01,
    maxCapacity: 30,
  });
  assert(zeroResult.pass === true, 'Zero drift 0.002 <= 0.25e (0.0025) must PASS');

  const zeroFail = runZeroSettingTest({
    zeroBeforeTest: 0.000,
    zeroAfterTest: 0.004, // 0.004 > 0.0025 -> Fail
    accuracyClass: 'III',
    verificationInterval: 0.01,
    maxCapacity: 30,
  });
  assert(zeroFail.pass === false, 'Zero drift 0.004 > 0.25e must FAIL');
  console.log('  ✓ Zero setting tolerance (+/-0.25e) verified (Clause 4.5.2 & A.4.2.3)');
}

// ---------------------------------------------------------------------------
// TEST 10: Clause 3.8.2.2 & A.4.8.2 - Discrimination Test
// ---------------------------------------------------------------------------
console.log('Test 10: Discrimination Test (Clause 3.8.2.2 & A.4.8.2)');
{
  const discResult = runDiscriminationTest({
    appliedLoad: 10,
    indicationBefore: 10.000,
    indicationAfter: 10.010,
    addedWeight: 0.014, // 1.4d
    accuracyClass: 'III',
    verificationInterval: 0.01,
    maxCapacity: 30,
  });
  assert(discResult.pass === true, 'Discrimination step must PASS');
  console.log('  ✓ Discrimination 1.4d step verified (Clause 3.8.2.2 & A.4.8.2)');
}

// ---------------------------------------------------------------------------
// TEST 11: Master Multi-Module Evaluation with Verified Clause Audit
// ---------------------------------------------------------------------------
console.log('Test 11: Master OIML R-76 Audit Execution');
{
  const master = calculateOIML({
    weighingRows: [
      { appliedLoad: 5, indication: 5.002, accuracyClass: 'III', verificationInterval: 0.01, maxCapacity: 30 },
      { appliedLoad: 15, indication: 15.004, accuracyClass: 'III', verificationInterval: 0.01, maxCapacity: 30 },
      { appliedLoad: 30, indication: 30.008, accuracyClass: 'III', verificationInterval: 0.01, maxCapacity: 30 },
    ],
    repeatabilityGroups: [
      { appliedLoad: 15, indications: [15.000, 15.002, 15.001], accuracyClass: 'III', verificationInterval: 0.01, maxCapacity: 30 }
    ],
    zeroSetting: {
      zeroBeforeTest: 0.000,
      zeroAfterTest: 0.001,
      accuracyClass: 'III',
      verificationInterval: 0.01,
      maxCapacity: 30,
    },
  });

  assert(master.overallPass === true, 'Master OIML calculation must PASS');
  assert(master.verifiedClauses.length >= 3, 'Verified clauses array must include all tested modules');
  console.log('  ✓ Master OIML R-76 calculation & verified clause audit trail verified');
}

console.log('\n================================================================');
console.log('🎉 ALL OIML R 76-1:2006 (E) CLAUSE TESTS PASSED SUCCESSFULLY! (11/11)');
console.log('================================================================\n');
