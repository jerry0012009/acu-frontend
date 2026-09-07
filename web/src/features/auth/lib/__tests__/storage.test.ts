import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { Window } from 'happy-dom'

import {
  clearPendingRedemptionCode,
  clearRedemptionCode,
  getPendingRedemptionCode,
  savePendingRedemptionCode,
} from '../storage'

const domWindow = new Window({
  url: 'https://example.test/sign-up?redeem=old-code&aff=partner#form',
})
const previousWindow = globalThis.window
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: domWindow,
})

before(() => {
  clearPendingRedemptionCode()
})

test('clearing a redemption code preserves unrelated URL state and hash', () => {
  clearRedemptionCode()

  assert.equal(
    window.location.href,
    'https://example.test/sign-up?aff=partner#form'
  )
})

test('pending OAuth redemption state can be saved and cleared', () => {
  savePendingRedemptionCode('oauth-code')
  assert.equal(getPendingRedemptionCode(), 'oauth-code')

  clearPendingRedemptionCode()
  assert.equal(getPendingRedemptionCode(), '')
})

after(() => {
  if (previousWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window')
  } else {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow,
    })
  }
  domWindow.close()
})
