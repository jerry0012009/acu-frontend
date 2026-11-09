import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.CLARITY_BASE_URL || 'http://127.0.0.1:5179'
const output = process.env.CLARITY_OUTPUT || '/tmp/acu-product-clarity'
mkdirSync(output, { recursive: true })
const browser = await chromium.launch()

try {
  for (const scenario of [
    { name: 'admin-light', width: 1440, theme: 'light', role: 10 },
    { name: 'admin-dark', width: 1440, theme: 'dark', role: 10 },
    { name: 'super-admin', width: 1440, theme: 'light', role: 100 },
    { name: 'configured-monitoring', width: 390, theme: 'dark', role: 10, monitoring: true },
    { name: 'user-mobile', width: 390, theme: 'light', role: 1 },
    { name: 'new-user', width: 390, theme: 'dark', role: 1, fresh: true },
    { name: 'error', width: 1440, theme: 'light', role: 10, error: true },
  ]) {
    const context = await browser.newContext({ viewport: { width: scenario.width, height: 1000 }, locale: 'zh-CN' })
    await context.addCookies([{ name: 'vite-ui-theme', value: scenario.theme, url: base }])
    const user = { id: 42, username: 'design-review', display_name: 'Design Review', role: scenario.role, quota: scenario.fresh ? 0 : 25000000, used_quota: scenario.fresh ? 0 : 4200000, request_count: scenario.fresh ? 0 : 1284, setting: '{}' }
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (scenario.error && ['/api/perf-metrics/summary', '/api/uptime/status', '/api/data/self'].includes(path)) {
        await route.fulfill({ status: 503, json: { success: false, message: 'Fixture unavailable' } })
        return
      }
      let data = ''
      if (path === '/api/setup') data = { status: true, root_init: true }
      else if (path.endsWith('/auth/refresh')) data = { access_token: 'fixture', token_type: 'Bearer', access_expires_at: 9999999999, user, session: { sid: 'fixture', current: true, login_method: 'test', ip: '', user_agent: '', created_at: 1, last_active_at: 1, expires_at: 9999999999 } }
      else if (path === '/api/status') data = { system_name: 'ACU', setup: true, version: 'fixture', display_in_currency: true, quota_display_type: 'USD', quota_per_unit: 500000, usd_exchange_rate: 1, api_info: [{ name: 'ACU API', url: 'https://api.acucompute.com', description: 'OpenAI / Anthropic' }], announcements: [], faq: [] }
      else if (path === '/api/user/self') data = user
      else if (path === '/api/token/') data = { items: scenario.fresh ? [] : [{ id: 8, name: 'Default API Key', key: 'masked', status: 1, expired_time: -1, unlimited_quota: true }], total: scenario.fresh ? 0 : 1 }
      else if (path === '/api/data/self') data = scenario.fresh ? [] : [9000, 18000, 12000, 27000, 21000, 33000, 24000, 36000].map((quota, index) => ({ created_at: Math.floor(Date.now() / 1000) - (8 - index) * 3600, quota, count: 12 }))
      else if (path === '/api/uptime/status') data = scenario.monitoring ? [{ categoryName: 'API', monitors: [{ name: 'ACU API', status: 1, uptime: 0.9998 }] }] : []
      else if (path === '/api/perf-metrics/summary') data = { models: [{ model_name: 'gpt6-astra', success_rate: 98.5, avg_latency_ms: 1240, avg_tps: 72, request_count: 142 }, { model_name: 'deepseek-v4.1-flash-1017', success_rate: 75, avg_latency_ms: 850, avg_tps: 98, request_count: 4 }] }
      else if (path.endsWith('/notifications')) data = { notifications: [], unreadCount: 0 }
      await route.fulfill({ json: { success: true, data } })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}/dashboard/overview`)
    await page.getByText('Credit remaining', { exact: true }).or(page.getByText('剩余额度', { exact: true })).first().waitFor()
    await page.screenshot({ path: `${output}/${scenario.name}.png`, fullPage: true })
    if (!process.env.CLARITY_BASELINE) {
      assert.deepEqual(errors, [])
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, scenario.name)
      assert.equal(await page.locator('header a[href="/pricing"]').count(), 0, 'app header does not duplicate public navigation')
      assert.equal(await page.getByText('Setup guide complete', { exact: true }).count(), 0, 'completed onboarding does not occupy overview')
      const metrics = page.locator('[data-summary-metric]')
      assert.equal(await metrics.count(), 4, 'four single-layer account metrics')
      assert(await metrics.first().evaluate(el => Number.parseFloat(getComputedStyle(el.querySelector('dd')).fontSize)) >= 28)
      const uptime = page.getByRole('region', { name: /Uptime|运行时间/ })
      if (!scenario.monitoring) assert((await uptime.boundingBox()).height < 160, 'unconfigured monitoring remains compact')
      else await uptime.getByText('99.98%', { exact: true }).waitFor()
      if (scenario.error) {
        await page.getByRole('alert').filter({ hasText: /monitoring|监控/ }).waitFor()
        assert.equal(await page.getByText('0.00%', { exact: true }).count(), 0, 'fetch errors are not zero success')
      }
      assert.equal(await page.getByRole('link', { name: /Configure monitoring|配置监控/ }).count(), scenario.role === 100 ? 1 : 0, 'monitoring configuration follows the existing super-admin route permission')
      if (!scenario.fresh && !scenario.error) {
        await page.getByRole('region', { name: /Resources and updates|接入资料与动态/ }).locator('summary').first().click()
        await page.getByRole('region', { name: /Resources and updates|接入资料与动态/ }).getByText('https://api.acucompute.com', { exact: true }).waitFor()
      }
      if (scenario.fresh) await page.locator('a[href="/#start"]').filter({ hasText: /Connect my tools|连接我的工具/ }).waitFor()
    }
    await context.close()
  }
  console.log('PASS overview hierarchy, permissions, compact empty monitoring, responsive layout and error states')
} finally {
  await browser.close()
}
