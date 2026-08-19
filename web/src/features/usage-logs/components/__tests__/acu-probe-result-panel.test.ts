import assert from 'node:assert/strict'
import { test } from 'node:test'

import { recommendedProbeMultiplier } from '../acu-probe-reconciliation'

test('Quick Add and Profile Inspector use the same ledger reconciliation formula', () => {
  assert.equal(recommendedProbeMultiplier(1, '0.06'), 0.06)
  assert.equal(recommendedProbeMultiplier(0, '0.06'), undefined)
  assert.equal(recommendedProbeMultiplier(1, '-0.01'), undefined)
})
