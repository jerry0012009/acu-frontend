import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 850 } })
  await page.clock.install()
  page.on('pageerror',error=>console.log('pageerror',error.message))
  page.on('console',message=>{if(message.type()==='error')console.log('console',message.text())})
  const user = { id: 42, role: 100, username: 'notice-browser', status: 1, language: 'zh', setting: '{}' }
  const first = { id: 1, advisorId: 'old', title: 'Private ACU | 扩展加载仍未完成', summary: '浏览器加载插件多次超时。', preference: '使用受支持的安装方式。', correction: '建议核对加载过程。', status: 'risk', referenceStatus: 'injected', targetPath: '/private-acu/advisor?advisor=old', problemSummary: '', adviceSummary: '', createdAt: '2026-11-12T08:00:00Z', sourceCreatedAt: '2026-11-12T08:00:00Z' }
  const next = { ...first, id: 2, advisorId: 'new', title: 'Private ACU | 插件试用包可能暴露密钥', summary: '安装者可以提取内置密钥，默认发送的图片也需核对范围。', preference: '让用户直接试用。', correction: '建议核对密钥限额、撤销安排和发送范围。' }
  let notices = [first]
  let calls = 0
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    let data = ''
    if (path.endsWith('/auth/refresh')) data = { access_token: 'local-fixture', token_type: 'Bearer', access_expires_at: 9999999999, user, session: { sid: 'local', current: true, login_method: 'test',ip:'',user_agent:'',last_active_at:1, created_at: 1, expires_at: 9999999999 } }
    else if (path.endsWith('/self')) data = user
    else if (path.endsWith('/notifications')) { data = { notifications: notices, unreadCount: notices.length }; calls++ }
    else if (path.endsWith('/notification-preferences')) data = { inAppEnabled: true, browserEnabled: false }
    else if (path.endsWith('/acu-advisor')) data = { advisors: [] }
    else if (path.endsWith('/acu-advisor/settings')) data = { globalEnabled: true, observerEnabled: true, advisorEnabled: true, learningEnabled: true, globalObserverInterval: 20,effectiveObserverInterval:20,usesGlobalObserverInterval:true }
    else if (path.endsWith('/acu-memory')) data = { skills: [], enabled: true }
    else if (path.endsWith('/status')) data = { setup: true, system_name: 'ACU', announcements_enabled: false }
    else if (path.endsWith('/setup')) data = { status: true, root_init: true }
    await route.fulfill({ json: { success: true, data } })
  })
  await Promise.all([
    page.waitForResponse(response => response.url().includes('/acu-advisor/notification-preferences')),
    page.goto(process.env.ADVISOR_BROWSER_URL || 'http://127.0.0.1:4347/private-acu/advisor'),
  ])
  await page.waitForFunction(() => document.body.innerText.includes('Advisor') || document.body.innerText.includes('参考建议'),null,{timeout:10000}).catch(async error=>{console.log(page.url(),(await page.locator('body').innerText()).slice(0,1500),{calls});throw error})
  assert(calls > 0)
  assert.equal(await page.locator('[data-sonner-toast]').count(), 0, 'initial history must not toast')
  await page.addStyleTag({content:'[data-sonner-toast] { transition: none !important; animation: none !important; }'})
  notices = [next, first]
  await page.clock.fastForward(31_000)
  await page.getByText(next.title, { exact: true }).waitFor()
  assert.equal(await page.locator('[data-sonner-toast]').count(), 1)
  assert((await page.locator('[data-sonner-toast]').innerText()).includes('密钥限额'))
  assert(!(await page.locator('body').innerText()).includes('本次还没有可靠'))
  assert(await page.getByRole('button', { name: /审计详情|audit details/i }).count() > 0)
  await page.clock.runFor(100)
  const box=await page.locator('[data-sonner-toast]').boundingBox()
  assert(box && box.y>=0 && box.x>=0 && box.y+box.height<=850 && box.x+box.width<=390,'toast must fit mobile viewport')
  assert(box.y>100,'Advisor toast must not cover header')
  await page.screenshot({ path: '/tmp/acu-notice-value/toast-390.png', fullPage: true })
  const toast=await page.locator('[data-sonner-toast]').elementHandle()
  await page.clock.fastForward(31_000)
  assert.equal(await page.locator('[data-sonner-toast]').count(), 1, 'same id must not create another toast')
  assert(await toast.evaluate(node=>node===document.querySelector('[data-sonner-toast]')),'same toast remains rather than a new duplicate')
  console.log('Passed: history is quiet; new risk has concrete content/action; same id does not repeat.')
} finally {
  await browser.close()
}
