import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Window } from 'happy-dom'
import React from 'react'

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
;(globalThis as typeof globalThis & { React?: unknown }).React = React.default ?? React
const { createRoot } = await import('react-dom/client')
const i18next = (await import('i18next')).default
const { initReactI18next } = await import('react-i18next')
await i18next.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: {} } } })
const { ApiKeysProvider } = await import('../api-keys-provider')
const { ApiKeysMutateDrawer } = await import('../api-keys-mutate-drawer')

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

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
    queryClient.setQueryData(['acu-model-pool'], {
      data: {
        profiles: [],
        modelPool: [{
          modelId: 'gpt-5.6-sol',
          vendor: 'OpenAI',
          modelCategory: 'text_agent',
          capabilityTier: 'SOL',
          protocols: ['responses'],
          verificationStatus: 'verified',
          autoRouteEnabled: true,
          profiles: [],
        }],
      },
    })
  })

  assert.equal(container.isConnected, true)
  await act(async () => root.unmount())
  container.remove()
  queryClient.clear()
})

after(() => domWindow.close())
