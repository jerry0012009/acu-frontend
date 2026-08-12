import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const apiSource = readFileSync(new URL('../../api.ts', import.meta.url), 'utf8')
const timelineSource = readFileSync(
  new URL('../acu-work-timeline.tsx', import.meta.url),
  'utf8'
)
const traceSource = readFileSync(
  new URL('../dialogs/acu-session-trace.tsx', import.meta.url),
  'utf8'
)

test('ACU APIs add a numeric target user query only when selected', () => {
  assert.match(
    apiSource,
    /getACUWorkTimeline\([\s\S]*targetUserId\?: number[\s\S]*params\.set\('user_id', String\(targetUserId\)\)/
  )
  assert.match(
    apiSource,
    /getACUSessionTrace\([\s\S]*targetUserId\?: number[\s\S]*params\.set\('user_id', String\(targetUserId\)\)/
  )
})

test('administrator timeline user selection uses debounced server search and preserves role boundaries', () => {
  assert.match(timelineSource, /ROLE\.ADMIN/)
  assert.match(
    timelineSource,
    /searchUsers\(\{ keyword: debouncedUserSearch, page_size: 10 \}\)/
  )
  assert.match(timelineSource, /setTimeout\([\s\S]*300/)
  assert.match(timelineSource, /user\.role < \(currentUser\?\.role \?\? 0\)/)
  assert.match(timelineSource, /selectedUser\?\.id/)
})

test('timeline and trace cache keys are scoped by target user and selection resets trace state', () => {
  assert.match(
    timelineSource,
    /\['acu-work-timeline', targetUserScope, 'rolling', hours\]/
  )
  assert.match(
    timelineSource,
    /setTraceId\(''\)[\s\S]*setSelectedPointId\(''\)/
  )
  assert.match(
    traceSource,
    /queryKey:\s*\[[\s\S]*'acu-session-trace'[\s\S]*props\.targetUserId \?\? 'self',[\s\S]*props\.identifier/
  )
  assert.match(
    timelineSource,
    /<ACUSessionTracePanel[\s\S]*targetUserId=\{targetUserId\}/
  )
})
