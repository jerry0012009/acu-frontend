import assert from 'node:assert/strict'
import { readFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || 'playwright'
)
const base = process.env.PRICING_REVIEW_URL || 'http://127.0.0.1:14331'
const output =
  process.env.PRICING_REVIEW_OUTPUT || '/tmp/pricing-consistency-review'
mkdirSync(output, { recursive: true })
const catalog = JSON.parse(
  readFileSync(
    process.env.PRICING_REVIEW_FIXTURE ||
      '/tmp/pricing-consistency-public.json',
    'utf8'
  )
)
const model = catalog.data.find((m) => m.model_name === 'gpt-6-astra-fast')
assert(model)
const profile = {
  executionProfileId: 'fixture:astra-fast:responses',
  canonicalModel: model.model_name,
  provider: 'fixture',
  channel: 'fixture',
  protocol: ['responses'],
  routingEnabled: true,
  routingEligible: true,
  explicitRoutingEligible: true,
  routingEligibility: 'eligible',
  state: 'healthy',
  effectivePriceMultiplier: 0.04,
  supplierCostFactor: 0.014836795,
  priceVersion: model.payable.price_version,
  routingWeight: 100,
  profileUtility: 0.8,
  profileRank: 1,
  profileCandidateCount: 1,
  publicNote: '',
  requestCount: 1,
  successCount: 1,
  probeBuckets: [],
  profileLatencyMs: 1200,
  p50FirstModelEventLatencyMs: 1200,
  p95FirstModelEventLatencyMs: 1200,
  metricSource: 'first_event_p50',
  probeStatus: 'success',
  firstEventSampleCount: 1,
}
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox'],
})
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(message.text())
    })
    await page.addInitScript(() => {
      localStorage.setItem('setup_status_checked', 'true')
      localStorage.setItem('i18nextLng', 'en')
    })
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      let data = {}
      if (path === '/api/pricing')
        {return route.fulfill({ json: { ...catalog, data: [model] } })}
      if (path.includes('acu-selection-corridor'))
        {return route.fulfill({
          json: {
            success: true,
            data: {
              series: {},
              effective: [],
              pricing: {},
              executionPresetSeries: [],
            },
          },
        })}
      if (path === '/api/user/auth/refresh') {
        const now = Math.floor(Date.now() / 1000)
        data = {
          access_token: 'fixture-not-production',
          token_type: 'Bearer',
          access_expires_at: now + 3600,
          user: { id: 1, username: 'fixture', role: 100, status: 1 },
          session: {
            sid: 'fixture',
            current: true,
            login_method: 'password',
            ip: '127.0.0.1',
            user_agent: 'fixture',
            created_at: now,
            last_active_at: now,
            expires_at: now + 3600,
          },
        }
      } else if (path === '/api/status')
        {data = {
          setup: true,
          system_name: 'ACU',
          quota_per_unit: 500000,
          usd_exchange_rate: 6.74,
          quota_display_type: 'CNY',
        }}
      else if (path === '/api/setup') data = { status: true }
      else if (path === '/api/notice') data = ''
      else if (path === '/api/log/acu-channel-monitor')
        {data = {
          profiles: [profile],
          history: [],
          probeHistory: [],
          cooldownIntervals: [],
          supplyInventory: [],
          modelPool: [],
          generatedAt: new Date().toISOString(),
        }}
      else if (path === '/api/token/') data = { items: [], total: 0 }
      else if (path.includes('acu-routing-policy'))
        {data = {
          modelPolicy: 'all_routing_eligible',
          modelAccess: {},
          allowedModelIds: [],
        }}
      else if (path.includes('execution-profiles'))
        {data = { profiles: [], providerEconomics: [] }}
      await route.fulfill({ json: { success: true, message: '', data } })
    })
    await page.goto(`${base}/pricing?search=gpt-6-astra-fast`)
    await page
      .getByLabel('Price multiplier', { exact: true })
      .first()
      .waitFor({ timeout: 90000 })
    assert.equal(
      await page
        .getByLabel('Price multiplier', { exact: true })
        .first()
        .textContent(),
      '0.040x'
    )
    assert((await page.locator('body').innerText()).includes('¥26.96'))
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    )
    await page.screenshot({
      path: `${output}/pricing-${width}.png`,
      fullPage: true,
    })
    await page.goto(`${base}/usage-logs/channel-monitor`)
    await page.getByRole('button', { name: 'By channel', exact: true }).click()
    await page
      .getByRole('button', { name: /fixture/ })
      .first()
      .click()
    await page
      .getByText('0.040×', { exact: true })
      .first()
      .waitFor({ timeout: 90000 })
    assert(await page.getByText('0.015×', { exact: true }).first().isVisible())
    assert(
      await page
        .getByText('Relative to public reference', { exact: true })
        .first()
        .isVisible()
    )
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    )
    await page
      .getByText('0.040×', { exact: true })
      .first()
      .scrollIntoViewIfNeeded()
    await page.screenshot({
      path: `${output}/monitor-${width}.png`,
      fullPage: false,
    })
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log(
    'PASS: pricing uses 0.040x and exact CNY rates; monitor separates 0.040 retail / 0.015 supplier; desktop/mobile fit'
  )
} catch (error) {
  for (const page of browser.contexts().flatMap((c) => c.pages())) {
    console.error(page.url(), await page.locator('body').innerText())
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true })
  }
  throw error
} finally {
  await browser.close()
}
