import assert from 'node:assert/strict'
import { after, afterEach, test } from 'node:test'

import { Window } from 'happy-dom'

import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'

const domWindow = new Window()
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
  'CustomEvent',
  'MutationObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { api } = await import('@/lib/api')
const { ACURetailPricing } = await import('../acu-retail-pricing')

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en, zh },
  interpolation: { escapeValue: false },
})

const costWarning =
  'Recorded cost excludes fixed infrastructure and payment fees.'
const historyWarning =
  'Missing historical reporting summaries do not mean zero cost. Recorded revenue and cost totals are retained; matched and replay coverage may be incomplete.'
const replayWarning =
  'Replay revenue covers only replayable requests, not the full period total.'

function fixture() {
  return {
    active: null,
    initialModels: [
      {
        modelId: 'reporting-model',
        multiplier: '0.2',
        referenceCurrency: 'USD',
        referenceSource: 'Test reference',
        referenceObservedAt: '2026-11-12',
        referencePrices: {},
      },
    ],
    economics: {
      models: [
        {
          model_id: 'reporting-model',
          calls: '4',
          totalRevenueCny: '12.50',
          totalRecordedCostCny: '7.25',
          matchedCoverage: 0.25,
          reportingCoverage: 0.5 as number | undefined,
          replayCoverage: 0.75 as number | undefined,
          replayRevenueCny: '9.50' as string | null,
          observedCostMultiplier: null,
          suggestedMultiplier: null,
        },
      ],
      totals: { calls: 4, revenueCny: '12.50', recordedCostCny: '7.25' },
      costScope: 'recorded_cost_excludes_fixed_infrastructure_and_payment_fees',
    },
    versions: [],
  }
}

let root: ReturnType<typeof createRoot> | undefined
let client: InstanceType<typeof QueryClient> | undefined
let container: HTMLDivElement
let requests = 0
const originalAdapter = api.defaults.adapter
api.defaults.adapter = async () => {
  requests++
  throw new Error('Network requests are forbidden in reporting UI tests')
}

async function render(data = fixture(), language = 'en') {
  await i18n.changeLanguage(language)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client = queryClient
  queryClient.setQueryData(['acu-retail-pricing', 30], data)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ACURetailPricing />
        </I18nextProvider>
      </QueryClientProvider>
    )
  })
}

function cell(column: string): string | null {
  const table = container.querySelector('table')
  assert.ok(table)
  const headers = [...table.querySelectorAll('thead th')]
  const index = headers.findIndex((header) => header.textContent === column)
  assert.notEqual(index, -1, `Expected report column: ${column}`)
  const value = table.querySelector('tbody tr')?.children[index]
  assert.ok(value)
  return value.textContent
}

afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  container?.remove()
  client?.clear()
  assert.equal(requests, 0, 'Reporting display must not send network requests')
})

after(() => {
  api.defaults.adapter = originalAdapter
  domWindow.close()
})

test('partial summaries show reporting coverage separately from matched and replay coverage', async () => {
  await render()
  assert.equal(cell('Reporting coverage'), '50%')
  assert.equal(cell('Matched coverage'), '25%')
  assert.equal(cell('Replay coverage'), '75%')
  assert.equal(cell('Replay revenue'), '9.50')
})

test('missing historical summaries warn without discarding recorded revenue or cost', async () => {
  const data = fixture()
  data.economics.models[0].reportingCoverage = 0
  await render(data)
  const warnings = new Set(
    [...container.querySelectorAll('[role="note"]')].map(
      (note) => note.textContent
    )
  )
  assert.ok(warnings.has(historyWarning))
  assert.ok(warnings.has(replayWarning))
  assert.ok(warnings.has(costWarning))
  assert.equal(cell('Revenue'), '12.50')
  assert.equal(cell('Recorded cost'), '7.25')
  assert.match(container.querySelector('dl')?.textContent ?? '', /CNY 12\.50/)
  assert.match(container.querySelector('dl')?.textContent ?? '', /CNY 7\.25/)
})

test('zero replay coverage shows unavailable revenue rather than a zero period total', async () => {
  const data = fixture()
  data.economics.models[0].replayCoverage = 0
  data.economics.models[0].replayRevenueCny = '0'
  await render(data)
  assert.equal(cell('Replay revenue'), '-')
  assert.equal(cell('Replay coverage'), '0%')
})

test('older responses with absent coverage show unavailable rather than claiming zero coverage', async () => {
  const data = fixture()
  data.economics.models[0].reportingCoverage = undefined
  data.economics.models[0].replayCoverage = undefined
  await render(data)
  assert.equal(cell('Reporting coverage'), '-')
  assert.equal(cell('Replay coverage'), '-')
  assert.ok(container.textContent?.includes(historyWarning))
  assert.ok(container.textContent?.includes(replayWarning))
})

test('a model absent from economics does not display invented zero revenue or cost', async () => {
  const data = fixture()
  data.economics.models = []
  await render(data)
  assert.equal(cell('Requests'), '-')
  assert.equal(cell('Revenue'), '-')
  assert.equal(cell('Recorded cost'), '-')
  assert.equal(cell('Reporting coverage'), '-')
  assert.equal(cell('Matched coverage'), '-')
})

test('fully covered zero revenue remains a genuine zero without incomplete coverage warnings', async () => {
  const data = fixture()
  Object.assign(data.economics.models[0], {
    reportingCoverage: 1,
    matchedCoverage: 1,
    replayCoverage: 1,
    replayRevenueCny: '0',
  })
  await render(data)
  assert.equal(cell('Replay revenue'), '0.00')
  assert.equal(cell('Reporting coverage'), '100%')
  assert.ok(!container.textContent?.includes(historyWarning))
  assert.ok(!container.textContent?.includes(replayWarning))
  assert.ok(container.textContent?.includes(costWarning))
})

test('Chinese report localizes coverage and accounting warnings', async () => {
  await render(fixture(), 'zh')
  assert.equal(cell('报表摘要覆盖率'), '50%')
  assert.equal(cell('回放覆盖率'), '75%')
  assert.ok(
    container.textContent?.includes(
      '已记录成本不包含固定基础设施成本和支付手续费。'
    )
  )
  assert.ok(!container.textContent?.includes(costWarning))
  assert.ok(!container.textContent?.includes(historyWarning))
  assert.ok(!container.textContent?.includes(replayWarning))
})
