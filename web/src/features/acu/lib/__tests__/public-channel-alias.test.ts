import assert from 'node:assert/strict'
import { test } from 'node:test'

import { publicChannelAlias } from '../public-channel-alias.ts'

test('public channel aliases are deterministic and anonymous', () => {
  const alias = publicChannelAlias('wawapii', 'wawapii-gpt-018')

  assert.equal(alias, publicChannelAlias('wawapii', 'wawapii-gpt-018'))
  assert.match(alias, /^ACU 线路 \d{4}$/)
  assert.doesNotMatch(alias, /wawapii|gpt-018/)
})

test('public channel aliases support channel-only identities', () => {
  assert.match(publicChannelAlias(undefined, 'profile-a'), /^ACU 线路 \d{4}$/)
  assert.equal(publicChannelAlias(), 'ACU 线路')
})
