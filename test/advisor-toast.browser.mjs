import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.ADVISOR_CHROMIUM_PATH,
})
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 850 },
    locale: 'zh-CN',
  })
  page.setDefaultTimeout(10_000)
  await page.clock.install()
  page.on('pageerror', (error) => console.log('pageerror', error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') console.log('console', message.text())
  })
  const user = {
    id: 42,
    role: 100,
    username: 'notice-browser',
    status: 1,
    language: 'zh',
    setting: '{}',
  }
  const first = {
    id: 1,
    advisorId: 'old',
    title: 'Private ACU | 扩展加载仍未完成',
    summary: '浏览器加载插件多次超时。',
    preference: '使用受支持的安装方式。',
    correction: '建议核对加载过程。',
    status: 'risk',
    referenceStatus: 'injected',
    targetPath: '/private-acu/advisor?advisor=old',
    problemSummary: '',
    adviceSummary: '',
    createdAt: '2026-11-12T08:00:00Z',
    sourceCreatedAt: '2026-11-12T08:00:00Z',
  }
  const next = {
    ...first,
    id: 2,
    advisorId: 'new',
    title: 'Private ACU | 清理重构后恢复命令缺失',
    summary: '不再输出已恢复会话的 resume 命令。'.repeat(20),
    correction: '核对恢复会话的输出调用。',
  }
  const third = { ...next, id: 3, advisorId: 'another' }
  const advisor = {
    advisorId: 'new',
    status: 'risk',
    problem: '恢复命令缺失',
    advice: '核对恢复会话的输出调用。',
    needAdvisor: true,
    relevantSkillIds: [],
    createdAt: next.createdAt,
  }
  let notices = [first]
  let calls = 0
  let bulkCalls = 0
  let individualCalls = 0
  let persistedRead = false
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let data = ''
    if (path.endsWith('/auth/refresh'))
      data = {
        access_token: 'local-fixture',
        token_type: 'Bearer',
        access_expires_at: 9999999999,
        user,
        session: {
          sid: 'local',
          current: true,
          login_method: 'test',
          ip: '',
          user_agent: '',
          last_active_at: 1,
          created_at: 1,
          expires_at: 9999999999,
        },
      }
    else if (path.endsWith('/self')) data = user
    else if (path.endsWith('/notifications')) {
      data = {
        notifications: notices,
        unreadCount: persistedRead ? 0 : 43,
      }
      calls++
    } else if (path.endsWith('/notifications/read-all')) {
      bulkCalls++
      if (bulkCalls === 1)
        return route.fulfill({
          json: { success: false, message: 'fixture failure' },
        })
      persistedRead = true
      notices = notices.map((notice) => ({
        ...notice,
        readAt: notice.createdAt,
      }))
      data = { updated: true }
    } else if (path.endsWith('/read')) individualCalls++
    else if (path.endsWith('/notification-preferences'))
      data = { inAppEnabled: true, browserEnabled: false }
    else if (path.endsWith('/acu-advisor')) data = { advisors: [advisor] }
    else if (path.endsWith('/acu-advisor/settings'))
      data = {
        globalEnabled: true,
        observerEnabled: true,
        advisorEnabled: true,
        learningEnabled: true,
        globalObserverInterval: 20,
        effectiveObserverInterval: 20,
        usesGlobalObserverInterval: true,
      }
    else if (path.endsWith('/acu-memory')) data = { skills: [], enabled: true }
    else if (path.endsWith('/status'))
      data = { setup: true, system_name: 'ACU', announcements_enabled: false }
    else if (path.endsWith('/pricing')) data = []
    else if (path.endsWith('/pricing/acu-selection-corridor'))
      data = { series: {}, effective: [], executionPresetSeries: [] }
    else if (path.endsWith('/setup')) data = { status: true, root_init: true }
    await route.fulfill({ json: { success: true, data } })
  })
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/acu-advisor/notification-preferences')
    ),
    page.goto(
      process.env.ADVISOR_BROWSER_URL ||
        'http://127.0.0.1:4347/private-acu/advisor'
    ),
  ])
  await page
    .waitForFunction(
      () =>
        document.body.innerText.includes('Advisor') ||
        document.body.innerText.includes('参考建议'),
      null,
      { timeout: 10000 }
    )
    .catch(async (error) => {
      console.log(
        page.url(),
        (await page.locator('body').innerText()).slice(0, 1500),
        { calls }
      )
      throw error
    })
  assert(calls > 0)
  assert.equal(
    await page.locator('[data-sonner-toast]').count(),
    0,
    'initial history must not toast'
  )
  await page.addStyleTag({
    content:
      '[data-sonner-toast] { transition: none !important; animation: none !important; }',
  })
  const context = page.context()
  await context.setOffline(true)
  await page.getByRole('status').filter({ hasText: '网络已断开' }).waitFor()
  await context.setOffline(false)
  await page
    .getByText('网络已断开', { exact: true })
    .waitFor({ state: 'hidden' })
  notices = [third, next, first]
  await page.clock.fastForward(31_000)
  const card = page
    .locator('[data-sonner-toast]')
    .filter({ hasText: '参考建议' })
  await card.waitFor()
  assert.equal(await page.locator('[data-sonner-toast]').count(), 1)
  assert.match(await card.innerText(), /2 条新建议/)
  assert.doesNotMatch(
    await card.innerText(),
    /Private ACU|resume 命令|核对恢复/
  )
  await page.clock.runFor(100)
  const box = await page.locator('[data-sonner-toast]').boundingBox()
  assert(
    box &&
      box.y >= 0 &&
      box.x >= 0 &&
      box.y + box.height <= 850 &&
      box.x + box.width <= 390,
    'toast must fit mobile viewport'
  )
  assert(box.y > 100, 'Advisor toast must not cover header')
  if (process.env.ADVISOR_SCREENSHOT_PATH)
    await page.screenshot({ path: process.env.ADVISOR_SCREENSHOT_PATH })
  await card.getByRole('button', { name: '查看建议' }).click()
  await page.waitForURL(
    (url) => url.pathname.endsWith('/private-acu/advisor') && !url.search
  )
  const markAll = page.getByRole('button', {
    name: /43.*全部已读|全部已读.*43/,
  })
  await markAll.click()
  await page
    .getByRole('alert')
    .filter({ hasText: '未能标记全部已读' })
    .waitFor()
  await markAll.click()
  await markAll.waitFor({ state: 'hidden' })
  assert.equal(bulkCalls, 2)
  assert.equal(individualCalls, 0)
  assert(
    await page.getByText(advisor.advice, { exact: true }).isVisible(),
    'existing advisor card remains readable after bulk read'
  )
  await page.clock.fastForward(31_000)
  await page.locator('[data-sonner-toast]').waitFor({ state: 'hidden' })
  const pricingUrl = new URL(page.url())
  pricingUrl.pathname = pricingUrl.pathname.replace(
    /\/private-acu\/advisor$/,
    '/pricing'
  )
  await page.goto(pricingUrl.href)
  const bell = page.getByRole('button', { name: '通知', exact: true })
  await bell.click()
  await page.getByRole('tab', { name: '参考建议' }).click()
  await page
    .getByText('清理重构后恢复命令缺失', { exact: true })
    .first()
    .waitFor()
  assert(
    await page
      .getByRole('button', { name: '全部已读', exact: true })
      .isDisabled()
  )
  console.log(
    'Passed: offline recovery, one mobile summary, existing Advisor page, retryable bulk read, preserved history, and mobile notification center.'
  )
} finally {
  await browser.close()
}
