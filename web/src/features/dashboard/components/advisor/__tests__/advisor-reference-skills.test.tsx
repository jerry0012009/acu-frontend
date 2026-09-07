import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Window } from 'happy-dom'

const domWindow = new Window({ url: 'http://localhost/' })
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'SVGElement',
  'Node',
  'Element',
  'Event',
  'MouseEvent',
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
;(globalThis as typeof globalThis & { React?: unknown }).React =
  React.default ?? React
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { PrivateACUAdvisor } = await import('../private-acu-advisor')

const i18n = createInstance()
await i18n
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} } } })
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

after(() => domWindow.close())

test('shows referenced Skill names and Markdown without exposing call counts', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queryClient.setQueryData(
    ['dashboard', 'private-acu-advisor'],
    [
      {
        advisorId: 'advisor-1',
        newapiUserId: '3',
        logicalRequestId: 'request-1',
        triggerCallCount: 14500,
        needAdvisor: true,
        status: 'risk',
        problem: 'The result needs production evidence.',
        advice: 'The user prefers conclusions backed by real evidence.',
        learn: 'none',
        relevantSkillIds: ['skill-production-evidence'],
        observerResult: {
          problem: 'Observer saw a possible gap in production verification.',
        },
        createdAt: '2026-09-07T00:00:00.000Z',
        referenceStatus: 'injected',
      },
    ]
  )
  queryClient.setQueryData(['dashboard', 'private-acu-memory'], {
    enabled: true,
    userId: '3',
    skills: [
      {
        id: 'skill-production-evidence',
        name: 'Production conclusions need real evidence',
        description: 'Prefer live verification before declaring completion.',
        files: [
          {
            path: 'SKILL.md',
            mime: 'text/markdown',
            content: '# Production evidence\nVerify the real user path.',
          },
        ],
      },
      {
        id: 'skill-unrelated',
        name: 'Unrelated preference',
        description: '',
        files: [],
      },
    ],
  })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <PrivateACUAdvisor />
        </QueryClientProvider>
      </I18nextProvider>
    )
  })

  const text = container.textContent ?? ''
  assert.match(text, /Observer observation/)
  assert.match(text, /Observer saw a possible gap/)
  assert.match(text, /Production conclusions need real evidence/)
  assert.doesNotMatch(text, /skill-production-evidence/)
  assert.doesNotMatch(text, /Unrelated preference/)
  assert.doesNotMatch(text, /14500|model calls/)

  const skillDetails = container.querySelector('details')
  const skillSummary = skillDetails?.querySelector('summary')
  assert.ok(skillDetails)
  assert.ok(skillSummary)
  assert.equal(skillDetails.open, false)

  await act(async () => skillSummary.click())

  assert.equal(skillDetails.open, true)
  assert.match(container.textContent ?? '', /SKILL\.md/)
  assert.match(container.textContent ?? '', /Verify the real user path/)

  await act(async () => root.unmount())
  container.remove()
})
