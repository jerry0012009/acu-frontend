import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const monitorSource = readFileSync(
  new URL('../acu-channel-monitor.tsx', import.meta.url),
  'utf8'
)
const usageApiSource = readFileSync(
  new URL('../../api.ts', import.meta.url),
  'utf8'
)
const timelineSource = readFileSync(
  new URL('../acu-work-timeline.tsx', import.meta.url),
  'utf8'
)
const profileManagerSource = readFileSync(
  new URL('../acu-execution-profile-manager.tsx', import.meta.url),
  'utf8'
)
const quickAddSource = readFileSync(
  new URL('../acu-provider-quick-add.tsx', import.meta.url),
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

test('authenticated users can open Supply Monitor while other diagnostic sections remain admin-only', () => {
  assert.doesNotMatch(
    sidebarSource,
    /title: t\('Supply Monitor'\)[\s\S]{0,160}requiredRole: ROLE\.ADMIN/
  )
  assert.match(
    sidebarSource,
    /title: t\('Async Tasks'\)[\s\S]{0,220}requiredRole: ROLE\.ADMIN/
  )
  assert.match(
    routeSource,
    /\['drawing', 'task'\][\s\S]{0,260}role[\s\S]{0,120}ROLE\.ADMIN/
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

test('overview Profile routing controls stay Root-only and reuse existing policy and Probe APIs', () => {
  assert.match(
    monitorSource,
    /const profileActions = isRoot[\s\S]{0,260}globalRoutingPolicyQuery/
  )
  assert.match(monitorSource, /probeACUExecutionProfileById/)
  assert.match(
    usageApiSource,
    /probeACUExecutionProfileById[\s\S]{0,360}executionProfileId,\s*protocol/
  )
  assert.match(
    usageApiSource,
    /api\.post\('\/api\/log\/acu-execution-profiles\/probe',\s*\{\s*executionProfileId,\s*protocol/
  )
  assert.match(
    monitorSource,
    /queryKey: \['acu-global-routing-policy'\][\s\S]{0,220}queryKey: \['acu-channel-monitor'\]/
  )
  assert.match(monitorSource, /overviewLayout === 'channel'/)
  assert.match(monitorSource, /overviewLayout === 'model'/)
  assert.match(
    monitorSource,
    /queryKey: \[[\s\S]{0,180}'acu-channel-monitor'[\s\S]{0,180}probeRange/
  )
  assert.match(
    usageApiSource,
    /getACUChannelMonitor[\s\S]{0,260}probeRange[\s\S]{0,180}URLSearchParams/
  )
  assert.match(monitorSource, /showDiagnostics=\{isAdmin\}/)
  assert.match(monitorSource, /const profileActions = isRoot/)
})

test('ordinary users get only the anonymous Model Overview presentation', () => {
  assert.match(monitorSource, /isAdmin \? 'channel' : 'model'/)
  assert.match(monitorSource, /t\('By channel'\)/)
  assert.match(monitorSource, /t\('By model'\)/)
  assert.match(monitorSource, /\{isAdmin && \(\s*<div className='grid gap-2/)
  assert.match(monitorSource, /<ACUModelHealthCard/)
  assert.match(
    readFileSync(
      new URL('../acu-model-health-card.tsx', import.meta.url),
      'utf8'
    ),
    /anonymousACULineId\(profile\.executionProfileId\)/
  )
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

test('saved profile scope summary includes the current profile inventory', () => {
  assert.match(
    monitorSource,
    /scopeSummary\([\s\S]{0,180}savedPolicy\.profilePolicy[\s\S]{0,180}savedPolicy\.allowedProfileIds[\s\S]{0,220}availableProfileIdList/
  )
})

test('root execution profile manager separates save, targeted probe, and apply', () => {
  assert.match(monitorSource, /<ACUExecutionProfileManager \/>/)
  assert.match(profileManagerSource, /createACUExecutionProfile/)
  assert.match(profileManagerSource, /updateACUExecutionProfile/)
  assert.match(
    profileManagerSource,
    /probeACUExecutionProfile\(draft, probeProtocol\)/
  )
  assert.match(profileManagerSource, /applyACUExecutionProfiles/)
  assert.match(
    profileManagerSource,
    /Saved configuration is waiting for Router apply/
  )
  assert.doesNotMatch(profileManagerSource, /recentSuccessRate/)
  assert.doesNotMatch(profileManagerSource, /observedLatency/)
  assert.doesNotMatch(profileManagerSource, /actualModelVerified/)
})

test('root execution profile manager exposes Quick Add without leaking advanced runtime fields', () => {
  assert.match(profileManagerSource, /<ACUProviderQuickAdd \/>/)
  assert.match(quickAddSource, /quickAddACUProviderDiscover/)
  assert.match(quickAddSource, /quickAddACUProviderProbe/)
  assert.match(quickAddSource, /quickAddACUProviderSave/)
  assert.match(quickAddSource, /models\.map/)
  assert.match(quickAddSource, /Actual platform debit/)
  assert.match(quickAddSource, /const defaultProtocols = PROTOCOLS\.filter/)
  assert.match(
    quickAddSource,
    /observedBillingMultiplier:\s*pair\.model\.observedBillingMultiplier/
  )
  assert.match(quickAddSource, /Cache creation tokens/)
  assert.match(profileManagerSource, /inputTokenAccountingMode/)
  assert.match(quickAddSource, /Input accounting/)
  assert.match(quickAddSource, /Estimated platform debit/)
  assert.match(quickAddSource, /estimatedPlatformDebit \/ props\.creditsPerCny/)
  assert.match(quickAddSource, /existingProviderEconomics/)
  assert.doesNotMatch(quickAddSource, /apiKeyEnv/)
  assert.doesNotMatch(quickAddSource, /recentSuccessRate/)
})
