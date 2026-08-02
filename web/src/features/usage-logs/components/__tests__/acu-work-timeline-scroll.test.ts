import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Window } from 'happy-dom'
import { readFileSync } from 'node:fs'

const viewports = [
  [1366, 768],
  [1440, 900],
  [1920, 1080],
] as const

test('timeline flex children cannot shrink away the root overflow', () => {
  const source = readFileSync(
    new URL('../acu-work-timeline.tsx', import.meta.url),
    'utf8'
  )
  assert.match(source, /\[&>\*\]:shrink-0/)
})

for (const [width, height] of viewports) {
  test(`timeline root owns scrolling at ${width}x${height}`, () => {
    const window = new Window({ width, height })
    const root = window.document.createElement('div')
    root.dataset.testid = 'acu-work-timeline-root'
    root.style.height = `${height - 120}px`
    root.style.overflowY = 'auto'
    root.style.overscrollBehavior = 'contain'
    const chart = window.document.createElement('div')
    chart.style.height = '400px'
    const longList = window.document.createElement('div')
    longList.style.height = `${height * 3}px`
    root.append(chart, longList)
    window.document.body.append(root)

    Object.defineProperties(root, {
      clientHeight: { value: height - 120 },
      scrollHeight: { value: height * 3 + 400 },
    })
    let rootWheelEvents = 0
    root.addEventListener('wheel', () => {
      rootWheelEvents += 1
      root.scrollTop += 240
    })
    chart.dispatchEvent(new window.WheelEvent('wheel', { bubbles: true, deltaY: 240 }))
    assert.equal(rootWheelEvents, 1)
    assert.ok(root.scrollHeight > root.clientHeight)
    assert.ok(root.scrollTop > 0)

    root.scrollTop = root.scrollHeight - root.clientHeight
    assert.equal(root.scrollTop, root.scrollHeight - root.clientHeight)

    const drawer = window.document.createElement('div')
    drawer.style.overflowY = 'auto'
    Object.defineProperties(drawer, {
      clientHeight: { value: 500 },
      scrollHeight: { value: 1500 },
    })
    drawer.scrollTop = 600
    window.document.body.append(drawer)
    assert.equal(drawer.scrollTop, 600)
    assert.equal(root.scrollTop, root.scrollHeight - root.clientHeight)

    drawer.remove()
    chart.dispatchEvent(new window.WheelEvent('wheel', { bubbles: true, deltaY: 240 }))
    assert.equal(rootWheelEvents, 2)
    window.close()
  })
}
