import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { Window } from 'happy-dom'
import React from 'react'

Object.defineProperty(globalThis, 'React', {
  configurable: true,
  value: React,
})

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
  'WheelEvent',
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

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { Dialog, DialogContent, DialogTitle } =
  await import('@/components/ui/dialog')

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

after(() => domWindow.close())

test('non-modal trace inspector leaves the chart interaction surface unlocked', async () => {
  const chartSurface = document.createElement('div')
  chartSurface.dataset.testid = 'chart-surface'
  document.body.append(chartSurface)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)

  await act(async () => {
    root.render(
      <Dialog modal={false} open>
        <DialogContent showBackdrop={false}>
          <DialogTitle>Session Trace</DialogTitle>
        </DialogContent>
      </Dialog>
    )
  })

  assert.equal(document.querySelector('[data-slot="dialog-overlay"]'), null)
  assert.notEqual(document.body.style.overflow, 'hidden')
  assert.notEqual(document.documentElement.style.overflow, 'hidden')

  let wheelEvents = 0
  chartSurface.addEventListener('wheel', () => wheelEvents++)
  chartSurface.dispatchEvent(
    new WheelEvent('wheel', { bubbles: true, deltaY: -120 })
  )
  assert.equal(wheelEvents, 1)

  await act(async () => root.unmount())
  chartSurface.remove()
  host.remove()
})
