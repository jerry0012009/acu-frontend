import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  new URL('../use-update-option.ts', import.meta.url),
  'utf8'
)
const announcementsSource = readFileSync(
  new URL('../../content/announcements-section.tsx', import.meta.url),
  'utf8'
)

test('announcement settings invalidate the status cache', () => {
  assert.match(source, /'console_setting\.announcements'/)
  assert.match(source, /'console_setting\.announcements_enabled'/)
  assert.match(
    source,
    /STATUS_RELATED_KEYS\.includes\(variables\.key\)[\s\S]*queryClient\.invalidateQueries\(\{ queryKey: \['status'\] \}\)/
  )
})

test('announcement controls only clear local state after a successful save', () => {
  assert.match(
    announcementsSource,
    /const result = await updateOption\.mutateAsync\(\{[\s\S]*console_setting\.announcements_enabled[\s\S]*if \(result\.success\) \{[\s\S]*setIsEnabled\(checked\)/
  )
  assert.match(
    announcementsSource,
    /const result = await updateOption\.mutateAsync\(\{[\s\S]*console_setting\.announcements'[\s\S]*if \(result\.success\) \{[\s\S]*setHasChanges\(false\)/
  )
})
