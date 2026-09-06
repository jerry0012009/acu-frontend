import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  getChunkAssetUrl,
  isChunkLoadError,
  shouldAttemptChunkRecovery,
} from '../chunk-load-recovery'

describe('chunk load recovery', () => {
  test('recognizes the router chunk failure reported by the browser', () => {
    assert.equal(
      isChunkLoadError({
        name: 'ChunkLoadError',
        message:
          'Loading chunk 7435 failed. (missing: https://console.acucompute.com/static/js/async/7435.hash.js)',
      }),
      true
    )
  })

  test('extracts only same-origin static asset URLs', () => {
    const origin = 'https://console.acucompute.com'
    assert.equal(
      getChunkAssetUrl(
        {
          request:
            'https://console.acucompute.com/static/js/async/7435.hash.js',
        },
        origin
      ),
      'https://console.acucompute.com/static/js/async/7435.hash.js'
    )
    assert.equal(
      getChunkAssetUrl(
        {
          request: 'https://example.test/static/js/async/7435.hash.js',
        },
        origin
      ),
      null
    )
  })

  test('prevents reload loops for one minute', () => {
    assert.equal(shouldAttemptChunkRecovery(null, 100_000), true)
    assert.equal(shouldAttemptChunkRecovery(90_000, 100_000), false)
    assert.equal(shouldAttemptChunkRecovery(40_000, 100_000), true)
  })
})
