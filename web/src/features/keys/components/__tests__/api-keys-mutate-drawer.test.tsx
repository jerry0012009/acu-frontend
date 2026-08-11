import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Window } from 'happy-dom'

const domWindow = new Window()
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
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

const React = await import('react')
const { act } = React
;(globalThis as typeof globalThis & { React?: unknown }).React =
  React.default ?? React
const { createRoot } = await import('react-dom/client')
const i18next = (await import('i18next')).default
const { initReactI18next } = await import('react-i18next')
await i18next
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} } } })
const { ApiKeysProvider } = await import('../api-keys-provider')
const { ApiKeysMutateDrawer } = await import('../api-keys-mutate-drawer')

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

test('renders when the ACU model pool arrives asynchronously', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queryClient.setQueryData(['status'], {})
  queryClient.setQueryData(['user-groups'], { data: {} })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ApiKeysProvider>
          <ApiKeysMutateDrawer open onOpenChange={() => undefined} />
        </ApiKeysProvider>
      </QueryClientProvider>
    )
  })

  await act(async () => {
    queryClient.setQueryData(['acu-routing-catalog'], {
      data: {
        profiles: [
          {
            executionProfileId: 'wawapii-gpt-018:gpt-5.6-sol:responses',
            canonicalModel: 'gpt-5.6-sol',
            protocol: ['responses'],
            supportedReasoningEfforts: ['default', 'high'],
          },
        ],
        models: [
          {
            modelId: 'gpt-5.6-sol',
            vendor: 'OpenAI',
            modelCategory: 'text_agent',
            capabilityTier: 'SOL',
            protocols: ['responses'],
            verificationStatus: 'verified',
            autoRouteEnabled: true,
            routingCandidates: [
              {
                candidateId: 'gpt-5.6-sol',
                modelId: 'gpt-5.6-sol',
                displayName: 'GPT-5.6 Sol',
                kind: 'base',
              },
              {
                candidateId: 'gpt-5.6-sol@high',
                modelId: 'gpt-5.6-sol',
                displayName: 'GPT-5.6 Sol · High',
                kind: 'preset',
                reasoningEffort: 'high',
              },
            ],
          },
        ],
      },
    })
  })

  const advancedButton = [...document.body.querySelectorAll('button')].find(
    (button) => button.textContent?.includes('Advanced Settings')
  )
  assert.ok(advancedButton)
  await act(async () => advancedButton.click())
  const candidateScopeSwitch = [
    ...document.body.querySelectorAll('[role="switch"]'),
  ].find((element) =>
    element.parentElement?.textContent?.includes(
      'All verified routing candidates'
    )
  ) as HTMLElement | undefined
  assert.ok(candidateScopeSwitch)
  await act(async () => candidateScopeSwitch.click())

  const presetCheckbox = document.body.querySelector(
    '[id="acu-candidate-gpt-5.6-sol@high"]'
  ) as HTMLElement | null
  assert.ok(presetCheckbox)
  await act(async () => presetCheckbox.click())
  const preferenceInput = document.body.querySelector(
    '[aria-label="gpt-5.6-sol@high Candidate preference"]'
  ) as HTMLInputElement | null
  assert.ok(preferenceInput)
  assert.equal(preferenceInput.step, '0.1')
  await act(async () => {
    preferenceInput.value = '99.9'
    preferenceInput.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => presetCheckbox.click())
  await act(async () => presetCheckbox.click())
  const resetPreferenceInput = document.body.querySelector(
    '[aria-label="gpt-5.6-sol@high Candidate preference"]'
  ) as HTMLInputElement | null
  assert.equal(resetPreferenceInput?.value, '100')

  await act(async () => candidateScopeSwitch.click())
  const profileScopeSwitch = [
    ...document.body.querySelectorAll('[role="switch"]'),
  ].find((element) => {
    const text = element.parentElement?.textContent ?? ''
    return text.includes('执行线路') || text.includes('execution routes')
  }) as HTMLElement | undefined
  assert.ok(profileScopeSwitch)
  await act(async () => profileScopeSwitch.click())

  const profileLabel = [...document.body.querySelectorAll('label')].find(
    (label) => label.textContent?.includes('ACU 线路')
  )
  assert.ok(profileLabel)
  assert.doesNotMatch(
    profileLabel.textContent ?? '',
    /wawapii-gpt-018:gpt-5\.6-sol:responses/
  )
  assert.match(profileLabel.textContent ?? '', /ACU 线路 \d{4}/)

  assert.equal(container.isConnected, true)
  await act(async () => root.unmount())
  container.remove()
  queryClient.clear()
})

after(() => domWindow.close())
