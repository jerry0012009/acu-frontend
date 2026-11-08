import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.ONBOARDING_BASE_URL || 'http://127.0.0.1:5178';
const output = '/tmp/acu-runtime-onboarding-browser';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const fixtureKey = 'sk-onboarding-fixture';
let revealed = 0;
let completed = 0;
const user = { id: 42, username: 'new-user', role: 1, quota: 0, setting: '{"acu_onboarding_pending":true}', language: 'zh' };
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, locale: 'zh-CN', userAgent: 'Mozilla/5.0 Windows NT 10.0; Win64; x64' });
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data = '';
      if (path.endsWith('/setup')) data = { status: true, root_init: true };
      else if (path.endsWith('/auth/refresh')) data = { access_token: 'fixture', token_type: 'Bearer', access_expires_at: 9999999999, user, session: { sid: 'fixture', current: true, login_method: 'test', ip: '', user_agent: '', created_at: 1, last_active_at: 1, expires_at: 9999999999 } };
      else if (path.endsWith('/self')) {
        if (route.request().method() === 'PUT') { completed++; assert.deepEqual(route.request().postDataJSON(), { acu_onboarding_complete: true }); }
        else data = user;
      } else if (path === '/api/status') data = { system_name: 'ACU', setup: true, version: 'test', quota_display_type: 'CNY', uptime_kuma_enabled: false };
      else if (path === '/api/uptime/status') data = [];
      else if (path.startsWith('/api/data')) data = [];
      else if (path === '/api/token/') data = { items: [{ id: 8, name: 'Default API Key', key: 'masked', status: 1, expired_time: -1, unlimited_quota: true }], total: 1 };
      else if (path === '/api/token/8/key') { revealed++; data = { key: fixtureKey }; }
      else if (path.endsWith('/notifications')) data = { notifications: [], unreadCount: 0 };
      await route.fulfill({ json: { success: true, data } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('console', message => { if (message.type() === 'error') console.log(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/connect`);
    await page.getByRole('button', { name: 'API Key 与终端', exact: true }).waitFor();
    const download = page.locator('a[href$="windows-amd64-Setup.exe"]');
    await download.waitFor();
    assert.match(await download.getAttribute('href'), /v0\.1\.45\/ACU-Runtime-0\.1\.45-windows-amd64-Setup.exe$/);
    await page.screenshot({ path: `${output}/runtime-${width}.png`, fullPage: true });
    assert.equal(await page.locator('input[aria-label="API Key"]').count(), 0);
    assert.equal(revealed, width === 1280 ? 0 : 1);
    await page.getByRole('button', { name: 'API Key 与终端', exact: true }).click();
    await page.getByRole('button', { name: '查看 API Key', exact: true }).click();
    await page.waitForFunction(key => document.querySelector('input[aria-label="API Key"]')?.value === key, fixtureKey);
    await page.getByRole('button', { name: /隐藏 API/ }).click();
    assert.equal(await page.locator('input[aria-label="API Key"]').getAttribute('type'), 'password');
    await page.screenshot({ path: `${output}/direct-${width}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await page.getByRole('button', { name: '下次登录不再显示', exact: true }).click();
    await page.waitForURL(url => url.pathname.startsWith('/dashboard'), { waitUntil: 'domcontentloaded' });
    await context.close();
  }
  assert.equal(completed, 2);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', userAgent: 'Mozilla/5.0 Linux x86_64' });
  let failKeys = true;
  await context.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = '';
    if (path.endsWith('/setup')) data = { status: true };
    else if (path.endsWith('/auth/refresh')) data = { access_token: 'fixture', token_type: 'Bearer', access_expires_at: 9999999999, user, session: { sid: 'fixture', current: true, login_method: 'test', ip: '', user_agent: '', created_at: 1, last_active_at: 1, expires_at: 9999999999 } };
    else if (path === '/api/status') data = { system_name: 'ACU', setup: true };
    else if (path === '/api/token/') {
      if (failKeys) { await route.fulfill({ status: 503, json: { success: false } }); return; }
      data = { items: [], total: 0 };
    }
    await route.fulfill({ json: { success: true, data } });
  });
  const page = await context.newPage();
  await page.goto(`${base}/connect`);
  await page.getByText('Linux、服务器及暂不支持的设备，可以使用终端安装或 API Key 接入。').waitFor();
  assert.equal(await page.locator('a[href$="windows-amd64-Setup.exe"]').count(), 0);
  await page.locator('#runtime-platform').selectOption('mac-intel');
  assert.match(await page.locator('a[href$="macos-amd64.dmg"]').getAttribute('href'), /v0\.1\.45/);
  await page.getByRole('button', { name: 'API Key 与终端', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '暂时无法读取 API Key' }).waitFor();
  failKeys = false;
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await page.getByRole('link', { name: '创建或启用 API Key', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '查看 API Key', exact: true }).isDisabled(), true);
  await context.close();
  console.log('PASS desktop/mobile Runtime-first, direct-key reveal, no auto-reveal, dismissal and no horizontal overflow');
} finally { await browser.close(); }
