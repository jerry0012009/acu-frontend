import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildProbeCalibrationInput,
  recommendedProbeMultiplier,
} from '../acu-probe-reconciliation'

test('Quick Add and Profile Inspector use the same ledger reconciliation formula', () => {
  assert.equal(recommendedProbeMultiplier(1, '0.06'), 0.06)
  assert.equal(recommendedProbeMultiplier(0, '0.06'), undefined)
  assert.equal(recommendedProbeMultiplier(1, '-0.01'), undefined)
})

test('Profile-only calibration omits the displayed Provider conversion', () => {
  assert.deepEqual(buildProbeCalibrationInput(0.06, '1.25', false), {
    observedBillingMultiplier: 0.06,
  })
})

test('Provider conversion calibration is included only after editing it', () => {
  assert.deepEqual(buildProbeCalibrationInput(0.06, '1.25', true), {
    observedBillingMultiplier: 0.06,
    creditsPerCny: 1.25,
  })
})
