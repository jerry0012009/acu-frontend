import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const monitorSource = readFileSync(
  new URL('../acu-channel-monitor.tsx', import.meta.url),
  'utf8'
)
const timelineSource = readFileSync(
  new URL('../acu-work-timeline.tsx', import.meta.url),
  'utf8'
)
const sidebarSource = readFileSync(
  new URL('../../../../hooks/use-sidebar-data.ts', import.meta.url),
  'utf8'
)
const routeSource = readFileSync(
  new URL(
    '../../../../routes/_authenticated/usage-logs/$section.tsx',
    import.meta.url
  ),
  'utf8'
)

test('admin-only navigation and direct route guards cover supply monitor and async tasks', () => {
  assert.match(
    sidebarSource,
    /title: t\('Supply Monitor'\)[\s\S]{0,160}requiredRole: ROLE\.ADMIN/
  )
  assert.match(
    sidebarSource,
    /title: t\('Async Tasks'\)[\s\S]{0,220}requiredRole: ROLE\.ADMIN/
  )
  assert.match(
    routeSource,
    /\['channel-monitor', 'drawing', 'task'\][\s\S]{0,260}role[\s\S]{0,120}ROLE\.ADMIN/
  )
})

test('timeline does not call the admin-only supply monitor endpoint', () => {
  assert.doesNotMatch(timelineSource, /getACUChannelMonitor/)
  assert.match(timelineSource, /getACUWorkTimeline/)
})

test('root Router configuration is lazy and keeps saved state separate from drafts', () => {
  assert.match(
    monitorSource,
    /const \[activeTab, setActiveTab\] = useState\('overview'\)/
  )
  assert.match(monitorSource, /\{isRoot && \([\s\S]{0,160}value='routing'/)
  assert.match(monitorSource, /activeTab === 'routing'/)
  assert.match(monitorSource, /const savedPolicy = policyQuery\.data/)
  assert.match(monitorSource, /const savedUtilityConfig = utilityQuery\.data/)
  assert.match(monitorSource, /const \[policyDraft, setPolicyDraft\]/)
  assert.match(monitorSource, /const \[utilityDraft, setUtilityDraft\]/)
  assert.match(monitorSource, /structuredClone\(savedPolicy\)/)
  assert.match(monitorSource, /structuredClone\(savedUtilityConfig\)/)
  assert.match(monitorSource, /currently unavailable/)
})

test('router configuration refetches saved state after success or partial failure', () => {
  assert.match(monitorSource, /const refetchSavedConfiguration = async \(\) =>/)
  assert.match(
    monitorSource,
    /onSuccess: async \(\) => \{[\s\S]{0,180}await refetchSavedConfiguration\(\)/
  )
  assert.match(
    monitorSource,
    /onError: async \(error\) => \{[\s\S]{0,220}await refetchSavedConfiguration\(\)/
  )
  assert.match(
    monitorSource,
    /ACU Router configuration partially updated; current server configuration reloaded/
  )
})

test('custom routing scopes start from current inventory and keep profiles aligned to models', () => {
  assert.match(monitorSource, /const availableModelIdList = useMemo/)
  assert.match(monitorSource, /const availableProfileIdList = useMemo/)
  assert.match(
    monitorSource,
    /const beginModelCustomPolicy = \(custom: boolean\) =>/
  )
  assert.match(
    monitorSource,
    /custom && policyDraft\.allowedModelIds\.length === 0[\s\S]{0,160}availableModelIdList/
  )
  assert.match(
    monitorSource,
    /const beginProfileCustomPolicy = \(custom: boolean\) =>/
  )
  assert.match(
    monitorSource,
    /const changeAllowedModels = \(values: string\[\]\) =>[\s\S]{0,420}allowedProfileIds/
  )
  assert.match(
    monitorSource,
    /Custom mode starts with all currently routing-eligible entries selected/
  )
  assert.match(monitorSource, /scopeSummary[\s\S]{0,520}Excluded/)
  assert.match(monitorSource, /outside current model allowlist/)
})
