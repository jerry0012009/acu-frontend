import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { formatExactDecimal, formatListDecimal } from '../decimal-format'

describe('billing decimal formatting', () => {
  for (const value of ['0.0000000004', '999999.0000000004', '0.0028740000']) {
    test(`preserves original decimal ${value} in details`, () => {
      assert.equal(formatExactDecimal(value), value)
    })
  }

  for (const [value, expected] of [
    ['0.0000000004', '0.0000000004'],
    ['4e-10', '0.0000000004'],
    ['0.0084818400', '0.00848184'],
    ['0', '0.00000000'],
    ['999999.0000000004', '999999.0000000004'],
  ]) {
    test(`formats list decimal ${value} without losing a positive charge`, () => {
      assert.equal(formatListDecimal(value), expected)
    })
  }

  for (const value of [null, undefined, '', 'NaN', 'Infinity', 'not-money']) {
    test(`does not turn invalid value ${value} into a charge`, () => {
      assert.equal(formatExactDecimal(value), undefined)
      assert.equal(formatListDecimal(value), undefined)
    })
  }
})
