import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.RETAIL_TEST_URL || 'http://127.0.0.1:4317'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ['--no-sandbox'],
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') console.error(message.text())
})
let publications = 0
const model = {
  modelId: 'claude-opus-5-5',
  multiplier: '',
  referenceCurrency: 'USD',
  referenceSource: 'Fixture verified reference',
  referenceObservedAt: '2026-11-11',
  referenceVerified: true,
  referencePrices: { inputPricePerMillion: 5, outputPricePerMillion: 25 },
}
const economics = {
  models: [
    {
      model_id: model.modelId,
      calls: '5',
      totalRevenueCny: '1',
      totalRecordedCostCny: '0.8',
      suggestedMultiplier: null,
      observedCostMultiplier: 0.1,
      matchedCoverage: 1,
      replayRevenueCny: '1.2',
      replayCoverage: 1,
    },
  ],
  totals: { calls: 5, revenueCny: '1', recordedCostCny: '0.8' },
}
await page.route('**/api/**', async (route) => {
  const url = new URL(route.request().url())
  let data = {}
  if (url.pathname === '/api/user/auth/refresh') {
    const now = Math.floor(Date.now() / 1000)
    data = {
      access_token: 'fixture-not-a-production-token',
      token_type: 'Bearer',
      access_expires_at: now + 3600,
      user: { id: 1, username: 'fixture', role: 100, status: 1 },
      session: {
        sid: 'fixture-session',
        current: true,
        login_method: 'password',
        ip: '127.0.0.1',
        user_agent: 'fixture',
        created_at: now,
        last_active_at: now,
        expires_at: now + 3600,
      },
    }
  } else if (url.pathname === '/api/option/acu-retail-pricing') {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON()
      if (input.publish) publications++
      data = input.publish
        ? { status: 'scheduled' }
        : { status: 'preview', economics }
    } else
      data = { active: null, initialModels: [model], economics, versions: [] }
  } else if (['/api/option/', '/api/option'].includes(url.pathname)) data = []
  else if (url.pathname === '/api/notice') data = ''
  else if (url.pathname === '/api/setup') data = { status: true }
  else if (url.pathname === '/api/status')
    data = {
      setup: true,
      system_name: 'ACUindex',
      quota_per_unit: 500000,
      usd_exchange_rate: 6.74,
      quota_display_type: 'CNY',
    }
  await route.fulfill({ json: { success: true, message: '', data } })
})
await page.addInitScript(() => {
  localStorage.setItem('setup_status_checked', 'true')
  localStorage.setItem('i18nextLng', 'en')
})
try {
  await page.goto(`${base}/system-settings/billing/acu-model-pricing`)
  await page.getByRole('heading', { name: 'ACU Model Multipliers' }).waitFor()
  await page.getByRole('button', { name: 'Create price draft' }).click()
  await page
    .getByRole('textbox', { name: `${model.modelId} Price multiplier` })
    .fill('0.15')
  await page.getByLabel('Effective at (UTC)').fill('2099-01-01T00:00')
  await page.getByLabel('Change reason').fill('fixture review')
  const publish = page.getByRole('button', {
    name: 'Schedule price publication',
  })
  assert.equal(await publish.isDisabled(), true)
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await page
    .getByRole('checkbox', {
      name: 'Confirm all model multipliers and reference prices',
    })
    .check()
  assert.equal(await publish.isEnabled(), true)
  await page
    .getByRole('textbox', { name: `${model.modelId} Price multiplier` })
    .fill('0.2')
  assert.equal(await publish.isDisabled(), true)
  assert.equal(publications, 0)
  for (const [name, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    await page.screenshot({
      path: `/tmp/acu-retail-pricing-${name}.png`,
      fullPage: true,
    })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth
    )
    assert.equal(overflow, false, `${name} page must not overflow horizontally`)
  }
  assert.deepEqual(errors, [])
  console.log(
    'Retail pricing UI: draft, preview, confirmation invalidation, no publication, desktop/mobile passed'
  )
} catch (error) {
  console.error(errors)
  console.error(await page.locator('body').innerText())
  await page.screenshot({
    path: '/tmp/acu-retail-pricing-failure.png',
    fullPage: true,
  })
  throw error
} finally {
  await browser.close()
}
