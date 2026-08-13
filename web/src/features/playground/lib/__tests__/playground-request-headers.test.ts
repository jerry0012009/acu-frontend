import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  PLAYGROUND_TOKEN_HEADER,
  withPlaygroundTokenHeader,
} from '../streaming/playground-request-headers'

test('adds the selected API key ID to Playground request headers', () => {
  const headers = withPlaygroundTokenHeader(
    { Authorization: 'Bearer session' },
    42
  )

  assert.equal(headers[PLAYGROUND_TOKEN_HEADER], '42')
  assert.equal(headers.Authorization, 'Bearer session')
})

test('does not add a token header without a selected API key', () => {
  const headers = withPlaygroundTokenHeader({}, null)

  assert.equal(PLAYGROUND_TOKEN_HEADER in headers, false)
})
