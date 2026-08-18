import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveApiBaseUrl, resolveServerAddress } from '../server-address.ts'

test('uses the configured public address when it is not local', () => {
  assert.equal(
    resolveServerAddress('https://eu.example.test/acu/'),
    'https://eu.example.test/acu'
  )
})

test('builds a canonical API base URL from an origin or existing v1 URL', () => {
  assert.equal(
    resolveApiBaseUrl('https://console.acucompute.com'),
    'https://console.acucompute.com/v1'
  )
  assert.equal(
    resolveApiBaseUrl('https://console.acucompute.com/v1/'),
    'https://console.acucompute.com/v1'
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
    assert.equal(
      resolveApiBaseUrl('http://localhost:3000'),
      'https://eu.example.test/acu/v1'
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
