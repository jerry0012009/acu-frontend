import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { Window } from 'happy-dom'
import React from 'react'

import type { ACUChannelMonitorProfile } from '../../api'

Object.defineProperty(globalThis, 'React', { configurable: true, value: React })
const domWindow = new Window({ url: 'http://localhost/' })
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'SVGElement',
  'Node',
  'Element',
  'Event',
  'MouseEvent',
  'MutationObserver',
  'ResizeObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}
Object.defineProperty(globalThis, 'matchMedia', {
  configurable: true,
  value: domWindow.matchMedia.bind(domWindow),
})
const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { api } = await import('@/lib/api')
const { useAuthStore } = await import('@/stores/auth-store')
const { ACUChannelMonitor, MonitorTable } =
  await import('../acu-channel-monitor')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
after(() => domWindow.close())

const profile = {
  executionProfileId: 'fixture:luna:responses',
  canonicalModel: 'gpt-luna',
  protocol: ['responses'],
  provider: 'fixture',
  channel: 'fixture',
  routingWeight: 175,
  routingEnabled: true,
  routingEligible: true,
  state: 'healthy',
  requestCount: 0,
  successCount: 0,
  profileUtility: 0.812,
  profileRank: 2,
  profileCandidateCount: 4,
  profileCost: null,
  multiplier: 1,
} as ACUChannelMonitorProfile

test('Current Profiles shows global weight and routing score without a selected API key', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <I18nextProvider i18n={i18n}>
          <MonitorTable
            profiles={[profile]}
            canPause={false}
            onPause={() => undefined}
          />
        </I18nextProvider>
      )
    )
    const row = host.querySelector('tbody tr')
    assert.ok(row)
    assert.match(row.textContent ?? '', /Global weight:\s*175/)
    assert.match(row.textContent ?? '', /Routing score:\s*0\.812/)
    assert.match(row.textContent ?? '', /#2\/4/)
    assert.equal(row.querySelector('details')?.open, false)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})

test('Current Profiles keeps zero global weight and shows unscored profiles honestly', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <I18nextProvider i18n={i18n}>
          <MonitorTable
            profiles={[
              {
                ...profile,
                routingWeight: 0,
                profileUtility: null,
                profileRank: null,
              },
            ]}
            canPause={false}
            onPause={() => undefined}
          />
        </I18nextProvider>
      )
    )
    const row = host.querySelector('tbody tr')
    assert.ok(row)
    assert.match(row.textContent ?? '', /Global weight:\s*0/)
    assert.match(row.textContent ?? '', /Routing score:\s*Not scored/)
    assert.doesNotMatch(row.textContent ?? '', /#null/)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})

test('switching from Current Profiles resets model-local routing rank and hides it in Overview', async () => {
  const originalUser = useAuthStore.getState().auth.user
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queryClient.setQueryData(
    ['acu-channel-monitor', '24h', 'balanced', 'standard', '48h', 'responses'],
    {
      success: true,
      data: {
        profiles: [profile],
        history: [],
        probeHistory: [],
        modelPool: [],
        generatedAt: '2026-09-28T12:00:00Z',
      },
    }
  )
  queryClient.setQueryData(['channel-monitor-api-keys'], {
    data: { items: [] },
  })
  queryClient.setQueryData(['acu-global-routing-policy'], {
    allowedProfileIds: [profile.executionProfileId],
  })
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'root',
    role: 100,
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <ACUChannelMonitor />
          </I18nextProvider>
        </QueryClientProvider>
      )
    )
    const sort = host.querySelector<HTMLSelectElement>(
      'select[aria-label="Sort"]'
    )
    assert.ok(sort)
    assert.equal(sort.querySelector('option[value="routing_rank"]'), null)
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    const current = tabs.find((tab) => tab.textContent === 'Profiles')
    const overview = tabs.find((tab) => tab.textContent === 'Overview')
    assert.ok(current)
    assert.ok(overview)
    await act(async () => current.click())
    assert.equal(
      sort.querySelector('option[value="routing_rank"]')?.textContent,
      'Model-local routing rank'
    )
    await act(async () => {
      sort.value = 'routing_rank'
      sort.dispatchEvent(new Event('change', { bubbles: true }))
    })
    assert.equal(sort.value, 'routing_rank')
    await act(async () => overview.click())
    assert.equal(sort.value, 'recommended')
    assert.equal(sort.querySelector('option[value="routing_rank"]'), null)
    await act(async () => current.click())
    assert.equal(sort.value, 'recommended')
  } finally {
    await act(async () => root.unmount())
    queryClient.clear()
    useAuthStore.getState().auth.setUser(originalUser)
    host.remove()
  }
})

test('saving a global Profile weight invalidates cached token routing for other keys', async () => {
  const originalAdapter = api.defaults.adapter
  const originalUser = useAuthStore.getState().auth.user
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  const monitorKey = [
    'acu-channel-monitor',
    '24h',
    'balanced',
    'standard',
    '48h',
    'responses',
  ]
  queryClient.setQueryData(monitorKey, {
    success: true,
    data: {
      profiles: [profile],
      history: [],
      probeHistory: [],
      modelPool: [],
      generatedAt: '2026-09-28T12:00:00Z',
    },
  })
  queryClient.setQueryData(['channel-monitor-api-keys'], {
    data: { items: [] },
  })
  queryClient.setQueryData(['acu-global-routing-policy'], {
    allowedProfileIds: [profile.executionProfileId],
  })
  const tokenKey = ['acu-token-profile-routing', 42]
  queryClient.setQueryData(tokenKey, {
    success: true,
    data: { globalWeights: { [profile.executionProfileId]: 100 } },
  })
  let saved = false
  api.defaults.adapter = async (config) => {
    if (config.url?.endsWith('/calibration')) {
      saved = true
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        data: { success: true, data: { changed: { routingWeight: true } } },
      }
    }
    if (config.url?.includes('/probe')) {
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        data: {
          success: true,
          data: {
            success: false,
            startedAt: '2026-09-28T12:00:00Z',
            completedAt: '2026-09-28T12:00:01Z',
            costBreakdown: {},
            inputTokens: '0',
            outputTokens: '0',
            cachedInputTokens: '0',
            cacheCreationInputTokens: '0',
            reasoningTokens: '0',
            costCny: 0,
          },
        },
      }
    }
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: { success: true, data: {} },
    }
  }
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'root',
    role: 100,
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <ACUChannelMonitor />
          </I18nextProvider>
        </QueryClientProvider>
      )
    )
    const channel = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('fixture')
    )
    assert.ok(channel)
    await act(async () => channel.click())
    const details = host.querySelector('details')
    assert.ok(details)
    await act(async () => {
      details.open = true
    })
    const probe = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Probe test')
    )
    assert.ok(probe)
    await act(async () => probe.click())
    const save = [...document.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Save cost and global weight')
    )
    assert.ok(save)
    await act(async () => save.click())
    assert.equal(saved, true)
    assert.equal(queryClient.getQueryState(tokenKey)?.isInvalidated, true)
  } finally {
    await act(async () => root.unmount())
    queryClient.clear()
    api.defaults.adapter = originalAdapter
    useAuthStore.getState().auth.setUser(originalUser)
    host.remove()
  }
})
