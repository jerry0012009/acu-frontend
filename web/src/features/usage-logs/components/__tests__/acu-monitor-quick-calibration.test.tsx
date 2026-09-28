import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { Window } from 'happy-dom'
import React from 'react'

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
const { ACUMonitorQuickCalibration } =
  await import('../acu-monitor-quick-calibration')
const { ACUChannelMonitor } = await import('../acu-channel-monitor')
const { useAuthStore } = await import('@/stores/auth-store')
const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
after(() => domWindow.close())

const response = {
  success: true,
  data: {
    profiles: [
      {
        executionProfileId: 'fixture:first',
        modelId: 'luna',
        channel: 'primary',
        provider: 'fixture',
        economicsProviderId: 'shared',
        routingWeight: 100,
        observedBillingMultiplier: 1.2,
      },
      {
        executionProfileId: 'fixture:second',
        modelId: 'terra',
        channel: 'backup',
        provider: 'fixture',
        economicsProviderId: 'shared',
        routingWeight: 80,
        observedBillingMultiplier: 1.1,
      },
    ],
    providerEconomics: [
      { providerId: 'shared', creditsPerCny: 7, observedBillingMultiplier: 1 },
    ],
  },
}

test('selecting a Profile permits a weight-only save without running a Probe', async () => {
  const previous = api.defaults.adapter
  const confirmWindow = globalThis.window as unknown as {
    confirm: (message?: string) => boolean
  }
  const previousConfirm = confirmWindow.confirm
  const requests: Array<{ url?: string; data?: string }> = []
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['acu-execution-profiles'], response)
  client.setQueryData(['acu-token-profile-routing', 17], { success: true })
  confirmWindow.confirm = () => {
    throw new Error(
      'Single-Profile weight change must not ask for confirmation'
    )
  }
  api.defaults.adapter = async (config) => {
    requests.push({ url: config.url, data: config.data })
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: config.method === 'patch' ? { success: true, data: {} } : response,
    }
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <I18nextProvider i18n={i18n}>
            <ACUMonitorQuickCalibration />
          </I18nextProvider>
        </QueryClientProvider>
      )
    )
    const search = host.querySelector<HTMLInputElement>('input[type="search"]')
    assert.ok(search)
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )?.set?.call(search, 'fixture:first')
      search.dispatchEvent(new Event('input', { bubbles: true }))
      search.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const selectFiltered = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Select filtered'
    )
    assert.ok(selectFiltered)
    await act(async () => selectFiltered.click())
    const weight = [...host.querySelectorAll<HTMLInputElement>('input')].find(
      (input) => input.closest('label')?.textContent === 'Global Profile weight'
    )
    assert.ok(weight)
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )?.set
      setter?.call(weight, '0')
      weight.dispatchEvent(new Event('input', { bubbles: true }))
      weight.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const save = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Save configuration'
    )
    assert.ok(save)
    assert.equal(save.disabled, false)
    await act(async () => save.click())
    assert.match(
      host.querySelector('[role="status"]')?.textContent ?? '',
      /Profiles updated|Calibration saved/
    )
    assert.deepEqual(
      requests
        .filter((request) => request.url?.endsWith('/calibration'))
        .map((request) => JSON.parse(request.data ?? '')),
      [{ routingWeight: 0 }]
    )
    assert.equal(
      requests.some((request) => request.url?.endsWith('/probe')),
      false
    )
    assert.equal(
      client.getQueryState(['acu-token-profile-routing', 17])?.isInvalidated,
      true
    )
  } finally {
    await act(async () => root.unmount())
    api.defaults.adapter = previous
    confirmWindow.confirm = previousConfirm
    client.clear()
    host.remove()
  }
})

test('shared conversion requires confirmation and invalid input does not reach the API', async () => {
  const previous = api.defaults.adapter
  const confirmWindow = globalThis.window as unknown as {
    confirm: (message?: string) => boolean
  }
  const previousConfirm = confirmWindow.confirm
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['acu-execution-profiles'], response)
  let saved = 0
  confirmWindow.confirm = () => false
  api.defaults.adapter = async (config) => {
    if (config.method === 'patch') saved++
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: response,
    }
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <I18nextProvider i18n={i18n}>
            <ACUMonitorQuickCalibration />
          </I18nextProvider>
        </QueryClientProvider>
      )
    )
    const search = host.querySelector<HTMLInputElement>('input[type="search"]')
    assert.ok(search)
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )?.set?.call(search, 'fixture:first')
      search.dispatchEvent(new Event('input', { bubbles: true }))
      search.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const selectFiltered = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Select filtered'
    )
    assert.ok(selectFiltered)
    await act(async () => selectFiltered.click())
    const conversion = [
      ...host.querySelectorAll<HTMLInputElement>('input'),
    ].find(
      (input) =>
        input.closest('label')?.textContent ===
        'Recharge conversion (credits per RMB)'
    )
    assert.ok(conversion)
    const save = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Save configuration'
    )
    assert.ok(save)
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )?.set
      setter?.call(conversion, '-1')
      conversion.dispatchEvent(new Event('input', { bubbles: true }))
      conversion.dispatchEvent(new Event('change', { bubbles: true }))
      save.click()
    })
    assert.equal(saved, 0)
    assert.ok(host.querySelector('[role="alert"]'))
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )?.set
      setter?.call(conversion, '8')
      conversion.dispatchEvent(new Event('input', { bubbles: true }))
      conversion.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => save.click())
    assert.equal(saved, 0)
  } finally {
    await act(async () => root.unmount())
    api.defaults.adapter = previous
    confirmWindow.confirm = previousConfirm
    client.clear()
    host.remove()
  }
})

test('selecting multiple Profiles deduplicates shared recharge conversion', async () => {
  const previous = api.defaults.adapter
  const previousConfirm = (
    globalThis.window as unknown as { confirm: (message?: string) => boolean }
  ).confirm
  const requests: Array<{ url?: string; data?: string }> = []
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['acu-execution-profiles'], response)
  ;(
    globalThis.window as unknown as { confirm: (message?: string) => boolean }
  ).confirm = () => true
  api.defaults.adapter = async (config) => {
    requests.push({ url: config.url, data: config.data })
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: { success: true, data: {} },
    }
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <I18nextProvider i18n={i18n}>
            <ACUMonitorQuickCalibration />
          </I18nextProvider>
        </QueryClientProvider>
      )
    )
    const selectFiltered = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Select filtered'
    )
    assert.ok(selectFiltered)
    await act(async () => selectFiltered.click())
    const conversion = [
      ...host.querySelectorAll<HTMLInputElement>('input'),
    ].find(
      (input) =>
        input.closest('label')?.textContent ===
        'Recharge conversion (credits per RMB)'
    )
    assert.ok(conversion)
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )?.set
    await act(async () => {
      setter?.call(conversion, '8')
      conversion.dispatchEvent(new Event('input', { bubbles: true }))
      conversion.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const save = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Save configuration'
    )
    assert.ok(save)
    await act(async () => save.click())
    assert.deepEqual(
      requests
        .filter((request) => request.url?.endsWith('/calibration'))
        .map((request) => JSON.parse(request.data ?? '')),
      [{ creditsPerCny: 8 }]
    )
  } finally {
    await act(async () => root.unmount())
    api.defaults.adapter = previous
    ;(
      globalThis.window as unknown as {
        confirm: (message?: string) => boolean
      }
    ).confirm = previousConfirm
    client.clear()
    host.remove()
  }
})

test('batch weight updates submit once per selected Profile', async () => {
  const previous = api.defaults.adapter
  const previousConfirm = (
    globalThis.window as unknown as { confirm: (message?: string) => boolean }
  ).confirm
  const requests: string[] = []
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['acu-execution-profiles'], response)
  ;(
    globalThis.window as unknown as { confirm: (message?: string) => boolean }
  ).confirm = () => true
  api.defaults.adapter = async (config) => {
    if (config.url?.endsWith('/calibration')) requests.push(config.data ?? '')
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: response,
    }
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <I18nextProvider i18n={i18n}>
            <ACUMonitorQuickCalibration />
          </I18nextProvider>
        </QueryClientProvider>
      )
    )
    const selectFiltered = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Select filtered'
    )
    assert.ok(selectFiltered)
    await act(async () => selectFiltered.click())
    const weight = [...host.querySelectorAll<HTMLInputElement>('input')].find(
      (input) => input.closest('label')?.textContent === 'Global Profile weight'
    )
    assert.ok(weight)
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )?.set?.call(weight, '125')
    await act(async () => {
      weight.dispatchEvent(new Event('input', { bubbles: true }))
      weight.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const save = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Save configuration'
    )
    assert.ok(save)
    await act(async () => save.click())
    assert.deepEqual(
      requests.map((value) => JSON.parse(value)),
      [{ routingWeight: 125 }, { routingWeight: 125 }]
    )
  } finally {
    await act(async () => root.unmount())
    api.defaults.adapter = previous
    ;(
      globalThis.window as unknown as {
        confirm: (message?: string) => boolean
      }
    ).confirm = previousConfirm
    client.clear()
    host.remove()
  }
})

test('non-root administrators do not see or request the global quick configuration', async () => {
  const previousUser = useAuthStore.getState().auth.user
  const previous = api.defaults.adapter
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(
    ['acu-channel-monitor', '24h', 'balanced', 'standard', '48h', 'responses'],
    {
      success: true,
      data: { profiles: [], history: [], probeHistory: [], modelPool: [] },
    }
  )
  client.setQueryData(['channel-monitor-api-keys'], { data: { items: [] } })
  let requested = false
  api.defaults.adapter = async (config) => {
    if (config.url?.includes('/acu-execution-profiles')) requested = true
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: { success: true, data: {} },
    }
  }
  useAuthStore.getState().auth.setUser({ id: 12, username: 'admin', role: 10 })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <I18nextProvider i18n={i18n}>
            <ACUChannelMonitor />
          </I18nextProvider>
        </QueryClientProvider>
      )
    )
    assert.equal(
      host.querySelector('[aria-label="Quick Profile configuration"]'),
      null
    )
    assert.equal(requested, false)
  } finally {
    await act(async () => root.unmount())
    api.defaults.adapter = previous
    client.clear()
    useAuthStore.getState().auth.setUser(previousUser)
    host.remove()
  }
})
