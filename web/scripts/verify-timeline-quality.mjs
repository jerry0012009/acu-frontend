import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { get } from 'node:http'
import path from 'node:path'

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ||
    '/tmp/acu-playwright-verify/node_modules/playwright/index.mjs'
)
const base = process.env.ACU_VISUAL_URL || 'http://127.0.0.1:4179'
const directory = process.env.ACU_VISUAL_DATA_DIR
if (!directory) throw new Error('Set ACU_VISUAL_DATA_DIR')
const artifacts = path.join(directory, 'screenshots')
mkdirSync(artifacts, { recursive: true })
const meta = await new Promise((resolve, reject) => {
  get('http://127.0.0.1:4190/__visual/timeline', (response) => {
    let body = ''
    response.on('data', (chunk) => {
      body += chunk
    })
    response.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch (error) {
        reject(error)
      }
    })
  }).on('error', reject)
})
const browser = await chromium.launch({
  headless: true,
  executablePath: chromium.executablePath(),
  args: ['--disable-dev-shm-usage'],
})
const report = {
  requests: meta.requests,
  from: meta.from,
  to: meta.to,
  checks: [],
  pageErrors: [],
}

function datetime(timestamp) {
  return new Date(timestamp * 1000).toISOString().slice(0, 16)
}

try {
  for (const [name, viewport, colorScheme] of [
    ['desktop', { width: 1440, height: 1000 }, 'light'],
    ['mobile', { width: 390, height: 844 }, 'light'],
    ['desktop-dark', { width: 1440, height: 1000 }, 'dark'],
  ]) {
    const context = await browser.newContext({
      viewport,
      locale: 'zh-CN',
      timezoneId: 'UTC',
      colorScheme,
    })
    await context.addCookies([
      { name: 'vite-ui-theme', value: colorScheme, url: base },
    ])
    await context.addInitScript(() => {
      localStorage.setItem('i18nextLng', 'zhCN')
    })
    const page = await context.newPage()
    page.on('pageerror', (error) =>
      report.pageErrors.push({ name, message: error.message })
    )
    await page.goto(`${base}/usage-logs/timeline`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    })
    const root = page.getByTestId('acu-work-timeline-root')
    await root.waitFor()
    const actualTheme = await page.locator('html').getAttribute('class')
    assert.ok(
      actualTheme.split(' ').includes(colorScheme),
      `${name} must render in ${colorScheme} theme`
    )
    const quality = root.getByRole('tab', { name: '质量', exact: true })
    const difficulty = root
      .getByRole('tab', { name: 'Difficulty', exact: true })
      .or(root.getByRole('tab', { name: '难度', exact: true }))
    assert.equal(await quality.getAttribute('aria-selected'), 'true')
    const dates = root.locator('input[type="datetime-local"]')
    await dates.nth(0).fill(datetime(meta.from - 60))
    await dates.nth(1).fill(datetime(meta.to + 60))
    await root.getByRole('button', { name: /应用|Apply/, exact: true }).click()
    const chart = page.getByTestId('acu-timeline-chart')
    await chart.scrollIntoViewIfNeeded()
    await page.waitForFunction(() => {
      const canvas = document.querySelector(
        '[data-testid="acu-timeline-chart"] canvas'
      )
      return canvas && canvas.width > 0 && canvas.height > 0
    })
    const pixels = await chart
      .locator('canvas')
      .first()
      .evaluate((canvas) => {
        const data = canvas
          .getContext('2d')
          .getImageData(0, 0, canvas.width, canvas.height).data
        let colored = 0
        for (let index = 0; index < data.length; index += 4) {
          if (
            data[index + 3] > 0 &&
            Math.max(data[index], data[index + 1], data[index + 2]) -
              Math.min(data[index], data[index + 1], data[index + 2]) >
              40
          ) {
            colored++
          }
        }
        return colored
      })
    assert.ok(
      pixels > 500,
      `${name} chart must contain rendered quality curves and bars`
    )
    const bounds = await root.evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    assert.ok(
      bounds.scrollWidth <= bounds.width + 1,
      `${name} must not overflow horizontally`
    )
    await root.evaluate((element) => {
      const tabs = element.querySelector('[role="tablist"]')
      if (tabs) {
        element.scrollTop +=
          tabs.getBoundingClientRect().top -
          element.getBoundingClientRect().top -
          12
      }
    })
    await page.screenshot({ path: path.join(artifacts, `${name}-page.png`) })
    await root.screenshot({ path: path.join(artifacts, `${name}-quality.png`) })
    await chart.screenshot({ path: path.join(artifacts, `${name}-chart.png`) })
    await difficulty.click()
    assert.equal(await difficulty.getAttribute('aria-selected'), 'true')
    await page.waitForFunction(() =>
      /难度|Difficulty/.test(
        document
          .querySelector('[data-testid="acu-timeline-chart"]')
          ?.getAttribute('aria-label') || ''
      )
    )
    await chart.screenshot({
      path: path.join(artifacts, `${name}-difficulty.png`),
    })
    await quality.click()
    assert.equal(await quality.getAttribute('aria-selected'), 'true')
    await quality.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    assert.equal(await difficulty.getAttribute('aria-selected'), 'true')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Enter')
    assert.equal(await quality.getAttribute('aria-selected'), 'true')
    await chart.scrollIntoViewIfNeeded()
    const box = await chart.boundingBox()
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.25)
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('div')].some(
          (element) =>
            element.style.position === 'absolute' &&
            /官方 API 价格|官方直连等价费用|Official API price/.test(
              element.innerText
            ) &&
            element.style.visibility !== 'hidden'
        ),
      null,
      { timeout: 10000 }
    )
    await chart.screenshot({
      path: path.join(artifacts, `${name}-tooltip.png`),
    })
    await page.mouse.move(0, 0)
    const countCell = root.getByText('执行请求', { exact: true }).locator('..')
    const initialCount = (await countCell.innerText()).replaceAll(/\D/g, '')
    await page.mouse.move(box.x + box.width - 22, box.y + box.height - 29)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height - 29, {
      steps: 10,
    })
    await page.mouse.up()
    await page.waitForFunction((before) => {
      const label = [
        ...document.querySelectorAll(
          '[data-testid="acu-work-timeline-root"] div'
        ),
      ].find((element) => element.textContent === '执行请求')
      return label?.parentElement?.innerText.replaceAll(/\D/g, '') !== before
    }, initialCount)
    const zoomedCount = Number(
      (await countCell.innerText()).replaceAll(/\D/g, '')
    )
    assert.ok(zoomedCount > 0 && zoomedCount < Number(initialCount))
    await page.mouse.dblclick(box.x + box.width - 7, box.y + box.height * 0.55)
    await page.waitForFunction((before) => {
      const label = [
        ...document.querySelectorAll(
          '[data-testid="acu-work-timeline-root"] div'
        ),
      ].find((element) => element.textContent === '执行请求')
      return label?.parentElement?.innerText.replaceAll(/\D/g, '') === before
    }, initialCount)
    report.checks.push({
      name,
      actualTheme,
      pixels,
      horizontalOverflow: bounds.scrollWidth - bounds.width,
      tabs: true,
      tooltip: true,
      zoomAndReset: true,
    })
    await context.close()
  }
  assert.deepEqual(report.pageErrors, [])
} finally {
  await browser.close()
  writeFileSync(
    path.join(directory, 'visual-report.json'),
    JSON.stringify(report, null, 2)
  )
}
console.log(JSON.stringify(report, null, 2))
