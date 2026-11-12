import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { preferenceActivity, preferenceRecords } from './preference-reader.fixture.mjs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.PREFERENCE_BASE_URL || 'http://127.0.0.1:5189'
const output = '/tmp/acu-preference-reader-20261112'
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH })
try {
  for (const [width, theme] of [[1440, 'light'], [390, 'light'], [1440, 'dark'], [320, 'dark']]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: 'zh-CN' })
    await context.addCookies([{ name: 'vite-ui-theme', value: theme, url: base }])
    await context.addInitScript((theme) => { localStorage.setItem('theme', theme); localStorage.setItem('i18nextLng', 'zhCN') }, theme)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${base}/private-acu/account`)
    const activity = page.getByRole('region', { name: '近期偏好变化' })
    await activity.getByText(preferenceRecords[0].summary, { exact: true }).waitFor()
    const previous = activity.getByText('更新前', { exact: true }).first()
    await previous.focus()
    await page.keyboard.press('Enter')
    await activity.getByText(preferenceActivity.events[0].changes[0].before, { exact: true }).waitFor()
    await page.keyboard.press('Enter')
    assert.equal(await activity.locator('details[open]').count(), 0)
    const records = page.getByRole('region', { name: '偏好记录' })
    const search = records.getByRole('searchbox', { name: '搜索偏好' })
    await search.fill('人可读')
    assert.equal(await records.getByRole('listitem').count(), 1)
    await search.fill('no-match')
    await records.getByText('没有匹配的偏好', { exact: true }).waitFor()
    await search.fill('')
    assert.equal(await records.getByRole('listitem').count(), 3)
    assert.equal(await page.locator('html').evaluate((element) => element.classList.contains('dark')), theme === 'dark')
    assert(await activity.evaluate((element) => element.scrollWidth <= element.clientWidth))
    assert(await records.evaluate((element) => element.scrollWidth <= element.clientWidth))
    if (width >= 390) assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `${output}/account-${width}-${theme}.png`, fullPage: true })
    await page.goto(`${base}/private-acu/overview`)
    await page.getByText('偏好记录 (1)', { exact: true }).click()
    await page.getByText('已保存的偏好理解，非用户原话', { exact: true }).waitFor()
    await page.getByText(preferenceRecords[0].summary, { exact: true }).last().waitFor()
    if (width >= 390) assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `${output}/sources-${width}-${theme}.png`, fullPage: true })
    await page.route('**/acu-preference-activity', (route) => route.fulfill({ json: { success: true, data: { version: 1, events: [], inspectedRuns: 1, moreAvailable: false, partial: true } } }))
    await page.goto(`${base}/private-acu/account`)
    await page.getByText('近期学习中暂无可展示的摘要变化', { exact: true }).waitFor()
    await page.getByText('部分近期记录暂时无法读取', { exact: true }).waitFor()
    await page.unroute('**/acu-preference-activity')
    await page.route('**/acu-preference-activity', (route) => route.fulfill({ status: 503, json: { success: false } }))
    await page.reload()
    await page.getByText('近期偏好变化暂时无法读取', { exact: true }).waitFor()
    assert.deepEqual(errors, [])
    await context.close()
  }
  console.log('Passed preference reading, search, keyboard comparison, graph sources, partial/error, 320/390/1440px light/dark. Existing global header overflows at 320px; preference sections do not.')
} finally { await browser.close() }
