import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mediaLocalURL } from '../api'

test('official signed media addresses become same-origin authenticated downloads', () => {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { origin: 'https://acu.best' },
  })
  assert.equal(
    mediaLocalURL(
      'https://console.acucompute.com/pg/assets/1/result-image.png?expires=10&signature=test'
    ),
    '/pg/assets/1/result-image.png?expires=10&signature=test'
  )
  assert.equal(
    mediaLocalURL('/v1/videos/task_owned/content'),
    '/v1/videos/task_owned/content'
  )
})

test('media downloads reject external hosts and non-media API paths', () => {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { origin: 'https://acu.best' },
  })
  assert.throws(() =>
    mediaLocalURL('https://evil.invalid/v1/videos/task/content')
  )
  assert.throws(() => mediaLocalURL('/api/token/1/key'))
})
