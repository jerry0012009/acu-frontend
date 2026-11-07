import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bipolarRayGeometry } from '../bipolar-ray-geometry'

test('opposing positions reverse the vector without changing its length', () => {
  const a = bipolarRayGeometry('W01.1', 12, 192, 18)
  const b = bipolarRayGeometry('W01.1', 12, 192, 102)
  assert.equal(a.radius, b.radius)
  assert(Math.abs(a.angle - b.angle - Math.PI) < 0.00001)
  assert.equal(bipolarRayGeometry('W01.1', 12, 192, 60).radius, 0)
  assert.equal(bipolarRayGeometry('W01.1', 12, 192, 0).radius, 250)
  assert.equal(bipolarRayGeometry('W01.1', 12, 192, 120).radius, 250)
})
test('layout is stable between renders and axis lines remain distinct', () => {
  assert.deepEqual(
    bipolarRayGeometry('I01.1', 0, 192, 18),
    bipolarRayGeometry('I01.1', 0, 192, 18)
  )
  assert.notEqual(
    bipolarRayGeometry('I01.1', 0, 192, 18).angle,
    bipolarRayGeometry('I01.2', 1, 192, 18).angle
  )
})
