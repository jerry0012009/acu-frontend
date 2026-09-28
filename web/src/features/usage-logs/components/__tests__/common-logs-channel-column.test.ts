import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  new URL('../columns/common-logs-columns.tsx', import.meta.url),
  'utf8'
)

test('shows the stable anonymous ACU route in the usage log list for all users', () => {
  assert.match(source, /if \(!isAdmin\) \{[\s\S]{0,120}columns\.push\(\{/)
  assert.match(source, /header: t\('ACU Route'\)/)
  assert.match(
    source,
    /const route = publicChannelAlias\([\s\S]{0,220}acuBreakdown\?\.channel_id/
  )
  assert.match(source, /<StatusBadge[\s\S]{0,80}label=\{route\}/)
})

test('keeps real channel details restricted to administrators', () => {
  assert.match(source, /if \(isAdmin\) \{[\s\S]{0,120}header: t\('Channel'\)/)
  assert.match(
    source,
    /const publicRoute = isAcuFinalized[\s\S]{0,120}publicChannelAlias\(acuProvider, acuChannelId\)/
  )
  assert.match(
    source,
    /\? \[acuProvider, channelName\]\.filter\(Boolean\)\.join\(' · '\)/
  )
})
