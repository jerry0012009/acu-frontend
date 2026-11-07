import assert from 'node:assert/strict'
import { test } from 'node:test'

import { preferenceRayLengths } from '../preference-ray-lengths'

test('clustered real-world strengths have visibly different lengths without changing their order', () => {
  const lengths = preferenceRayLengths([76, 81, 85, 89, 90])
  assert(lengths[4] / lengths[0] > 2)
  assert(lengths[4] - lengths[0] > 120)
  assert.deepEqual(
    lengths,
    [...lengths].sort((a, b) => a - b)
  )
})

test('equal strengths remain equal regardless of document order or domain', () => {
  const lengths = preferenceRayLengths([90, 76, 90, 85])
  assert.equal(lengths[0], lengths[2])
  assert.deepEqual(preferenceRayLengths([85, 90, 76, 90]), [
    lengths[3],
    lengths[0],
    lengths[1],
    lengths[2],
  ])
})

test('tiny strength differences are not stretched to the full chart', () => {
  const lengths = preferenceRayLengths([88, 89, 90])
  assert(lengths[2] - lengths[0] < 20)
})

test('empty, single and identical strengths produce bounded finite lengths', () => {
  assert.deepEqual(preferenceRayLengths([]), [])
  for (const scores of [[88], [88, 88, 88], [0, 1], [99, 100], [0, 50, 100]]) {
    const lengths = preferenceRayLengths(scores)
    assert(
      lengths.every(
        (length) => Number.isFinite(length) && length >= 64 && length <= 250
      )
    )
    if (new Set(scores).size === 1) assert.equal(new Set(lengths).size, 1)
  }
})
