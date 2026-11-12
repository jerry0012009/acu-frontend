import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const directory = process.env.ADVISOR_PREVIEW_DIR || '/tmp/acu-advisor-notice-preview'
await mkdir(directory, { recursive: true, mode: 0o700 })
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH })
try {
  const page = await browser.newPage()
  // Email preview is entirely offline, including fonts and links.
  await page.route(/^https?:/, (route) => route.abort())
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 850 })
    for (const sample of ['statistics', 'statistics-amount', 'authorization', 'sequence']) {
      await page.goto(pathToFileURL(`${directory}/${sample}.html`).href)
      assert.equal(await page.locator('h1').count(), 1)
      const checks = await page.evaluate(() => {
        const headings = [...document.querySelectorAll('strong')]
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          headings: headings.map((node) => node.textContent),
          bottom: headings.at(-1).parentElement.getBoundingClientRect().bottom,
          status: document.querySelector('main > p[style]').getBoundingClientRect().top,
        }
      })
      assert.equal(checks.overflow, false, `${sample} overflows at ${width}`)
      assert.deepEqual(checks.headings, ['发现偏差', '偏好 / 约束摘要', '纠偏提醒内容'])
      assert(checks.bottom < 850, `${sample} corrective reference must fit in first viewport at ${width}`)
      assert(checks.status >= checks.bottom, 'Status must follow the three value statements')
      await page.screenshot({ path: `${directory}/${sample}-${width}.png`, fullPage: true })
    }
  }
  console.log('Passed 12 offline desktop/mobile email previews: no horizontal overflow, three statements visible before status.')
} finally {
  await browser.close()
}
