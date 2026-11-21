import assert from 'node:assert/strict'
import { test } from 'node:test'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'

import { useAuthStore } from '@/stores/auth-store'

import { PreferenceControls } from '../preference-controls'

test('saved records expose edit and pause controls without presenting revisions as content', () => {
  const id = useAuthStore.getState().auth.user?.id
  const client = new QueryClient()
  client.setQueryData(
    ['private-acu', 'preference-controls', id],
    [
      {
        id: 'private-id',
        summary: 'Conclusions first',
        scope: 'Weekly reports',
        disabled: false,
        revision: 'private-revision',
      },
    ]
  )
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <PreferenceControls />
    </QueryClientProvider>
  )
  assert.match(html, /Conclusions first/)
  assert.match(html, /Edit preference/)
  assert.match(html, /Pause preference/)
  assert.doesNotMatch(html, /private-revision/)
  client.clear()
})
