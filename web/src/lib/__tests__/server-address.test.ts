import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveServerAddress } from '../server-address.ts'

test('uses the configured public address when it is not local', () => {
  assert.equal(
    resolveServerAddress('https://eu.example.test/acu/'),
    'https://eu.example.test/acu'
  )
})

test('falls back to the browser origin and ACU prefix for localhost config', () => {
  const previousWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        origin: 'https://eu.example.test',
        pathname: '/acu/keys',
      },
    },
  })

  try {
    assert.equal(
      resolveServerAddress('http://localhost:3000'),
      'https://eu.example.test/acu'
    )
  } finally {
    if (previousWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window')
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: previousWindow,
      })
    }
  }
})
