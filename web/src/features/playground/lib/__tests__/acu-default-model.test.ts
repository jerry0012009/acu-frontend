import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import {
  DEFAULT_CONFIG,
  DEFAULT_PARAMETER_ENABLED,
  STORAGE_KEYS,
} from '../../constants'
import { getInitialPlaygroundConfig } from '../state/playground-state-utils'
import { buildChatCompletionPayload } from '../streaming/payload-builder'

const originalLocalStorage = globalThis.localStorage

function installLocalStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  })
}

afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  })
})

test('defaults a new ACU conversation to acu-auto', () => {
  installLocalStorage()

  assert.equal(getInitialPlaygroundConfig().model, 'acu-auto')
})

test('respects an explicitly saved model selection', () => {
  installLocalStorage({
    [STORAGE_KEYS.CONFIG]: JSON.stringify({
      version: 1,
      data: { model: 'claude-sonnet-5' },
    }),
  })

  assert.equal(getInitialPlaygroundConfig().model, 'claude-sonnet-5')
})

test('sends acu-auto as the actual chat completion model', () => {
  const payload = buildChatCompletionPayload(
    [],
    DEFAULT_CONFIG,
    DEFAULT_PARAMETER_ENABLED
  )

  assert.equal(payload.model, 'acu-auto')
})
