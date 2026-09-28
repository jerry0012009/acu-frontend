import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { Window } from 'happy-dom'

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
  'KeyboardEvent',
  'MouseEvent',
  'PointerEvent',
  'CustomEvent',
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

const React = await import('react')
const { act } = React
Object.defineProperty(globalThis, 'React', {
  configurable: true,
  writable: true,
  value: React.default ?? React,
})
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { ACUExecutionProfileManager } =
  await import('../acu-execution-profile-manager')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { api } = await import('@/lib/api')

const i18n = createInstance()
await i18n
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} } } })
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

after(() => domWindow.close())

test('editing provider conversion retains channel controls and saves through DB calibration', async () => {
  const previous = api.defaults.adapter
  const requests: Array<{ url?: string; data: unknown }> = []
  let finish: () => void = () => undefined
  const calibrated = new Promise<void>((resolve) => {
    finish = resolve
  })
  api.defaults.adapter = async (config) => {
    requests.push({
      url: config.url,
      data:
        typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
    })
    if (config.url?.endsWith('/calibration')) finish()
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: {
        success: true,
        data: { profile: { executionProfileId: 'fixture:responses' } },
      },
    }
  }
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
  queryClient.setQueryData(['acu-execution-profiles'], {
    success: true,
    data: {
      profiles: [
        {
          executionProfileId: 'fixture:responses',
          modelId: 'gpt-6-luna',
          provider: 'fixture',
          channel: 'fixture',
          protocols: ['responses'],
          authMode: 'bearer',
          billingPrice: { inputPricePerMillion: 2, outputPricePerMillion: 10 },
          observedBillingMultiplier: 0.5,
          routingWeight: 175,
        },
      ],
      channels: {
        fixture: {
          baseUrl: 'https://fixture.invalid',
          fallbackBaseUrls: [],
          apiKeyConfigured: true,
        },
      },
      providerEconomics: [
        {
          providerId: 'fixture',
          creditsPerCny: 2,
          observedBillingMultiplier: 0.5,
        },
      ],
      retailMarkupMultiplier: 1.25,
    },
  })
  const tokenRoutingKey = ['acu-token-profile-routing', 42]
  queryClient.setQueryData(tokenRoutingKey, {
    success: true,
    data: { globalWeights: { 'fixture:responses': 100 } },
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <ACUExecutionProfileManager />
          </I18nextProvider>
        </QueryClientProvider>
      )
    )
    const edit = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Edit')
    )
    assert.ok(edit)
    await act(async () => edit.click())
    const dialog = document.querySelector('[role="dialog"]')
    assert.ok(dialog)
    assert.match(dialog.textContent ?? '', /Cost calculator/)
    assert.match(dialog.textContent ?? '', /Channel connection/)
    const conversion = [...dialog.querySelectorAll('label')]
      .find((label) => label.textContent?.includes('USD credits per RMB'))
      ?.querySelector('input')
    assert.ok(conversion)
    assert.equal(conversion.value, '2')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )?.set
      assert.ok(setter)
      setter.call(conversion, '4')
      conversion.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const save = [...dialog.querySelectorAll('button')].find(
      (button) => button.textContent === 'Save configuration'
    )
    assert.ok(save)
    await act(async () => {
      save.click()
      await calibrated
    })
    const writes = requests.filter((request) =>
      request.url?.includes('fixture%3Aresponses')
    )
    assert.equal(writes.length, 2)
    assert.equal(
      writes[1].url,
      '/api/log/acu-execution-profiles/fixture%3Aresponses/calibration'
    )
    assert.deepEqual(writes[1].data, { creditsPerCny: 4 })
    assert.equal(
      queryClient.getQueryState(tokenRoutingKey)?.isInvalidated,
      true
    )
  } finally {
    await act(async () => root.unmount())
    queryClient.clear()
    api.defaults.adapter = previous
    host.remove()
  }
})
