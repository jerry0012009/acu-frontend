import assert from 'node:assert/strict'
import test from 'node:test'

import { formatMultiplier } from '../format'

test('all multiplier magnitudes display exactly three decimal places', () => {
  for (const [value, expected] of [
    [0.07, '0.070x'],
    [0.05, '0.050x'],
    [1, '1.000x'],
    [0.014836795, '0.015x'],
    [0.003, '0.003x'],
    [0, '0.000x'],
  ] as const) {
    assert.equal(formatMultiplier(value), expected)
  }
  assert.equal(formatMultiplier(0.04, '×'), '0.040×')
  assert.equal(formatMultiplier(undefined), undefined)
  assert.equal(formatMultiplier(null), undefined)
})
