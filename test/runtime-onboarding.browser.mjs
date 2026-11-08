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
  for (const [width, theme] of [[1280, 'light'], [390, 'light'], [1280, 'dark'], [390, 'dark']]) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, locale: 'zh-CN', userAgent: 'Mozilla/5.0 Windows NT 10.0; Win64; x64' });
    await context.addCookies([{ name: 'vite-ui-theme', value: theme, url: base }]);
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
    await page.waitForURL(url => url.pathname === '/' && url.hash === '#start');
    await page.getByRole('button', { name: 'API Key 与终端', exact: true }).waitFor();
    const download = page.locator('a[href$="windows-amd64-Setup.exe"]');
    await download.waitFor();
    assert.match(await download.getAttribute('href'), /v0\.1\.47\/ACU-Runtime-0\.1\.47-windows-amd64-Setup.exe$/);
    await page.screenshot({ path: `${output}/runtime-${width}-${theme}.png`, fullPage: true });
    const controls = await page.locator('.acu-download-controls').boundingBox();
    const select = await page.locator('#runtime-platform').boundingBox();
    const downloadBox = await download.boundingBox();
    assert(controls && select && downloadBox);
    assert(downloadBox.y >= select.y + select.height, 'compact download follows platform selection');
    const setupDisclosure = page.locator('.acu-compact-steps');
    assert.equal(await setupDisclosure.getAttribute('open'), null);
    await setupDisclosure.locator('summary').click();
    const steps = await page.locator('.acu-setup-steps > li').all();
    assert.equal(steps.length, 3);
    const first = await steps[0].boundingBox();
    const second = await steps[1].boundingBox();
    assert(second.y > first.y, 'expanded steps follow vertical reading order');
    await setupDisclosure.locator('summary').click();
    assert.equal(await page.locator('.acu-connection-option[aria-pressed="true"]').innerText(), 'ACU Runtime');
    assert(downloadBox.height > 0, 'download action is available in the unified guide');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('.acu-runtime-mark').evaluate(img => img.complete && img.naturalWidth > 0), true);
    const contrast = await download.evaluate(element => {
      const style = getComputedStyle(element);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d');
      function luminance(color) {
        ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
        const channels = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => { const s = value / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
      }
      const a = luminance(style.color), b = luminance(style.backgroundColor);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    });
    assert(contrast >= 4.5, `download contrast ${contrast}`);
    await page.locator('#runtime-platform').focus();
    await page.keyboard.press('Tab');
    assert.equal(await download.evaluate(element => element === document.activeElement), true, 'download follows platform selection in keyboard order');
    await context.route('https://github.com/jerry0012009/acu-runtime/releases/download/**', route => route.fulfill({ headers: { 'Content-Disposition': 'attachment; filename=fixture.exe' }, body: 'fixture' }));
    const stepsBeforeDownload = await setupDisclosure.boundingBox();
    const downloadEvent = page.waitForEvent('download');
    await download.click();
    await downloadEvent;
    await page.getByRole('status').filter({ hasText: '下载后安装并打开' }).waitFor();
    assert(Math.abs((await setupDisclosure.boundingBox()).y - stepsBeforeDownload.y) < 2, 'download feedback does not shift the setup disclosure');
    assert.equal(await page.locator('input[aria-label="API Key"]').count(), 0);
    await page.getByRole('button', { name: 'API Key 与终端', exact: true }).click();
    await page.getByRole('button', { name: '查看 API Key', exact: true }).click();
    await page.waitForFunction(key => document.querySelector('input[aria-label="API Key"]')?.value === key, fixtureKey);
    await page.getByRole('button', { name: /隐藏 API/ }).click();
    assert.equal(await page.locator('input[aria-label="API Key"]').getAttribute('type'), 'password');
    await page.screenshot({ path: `${output}/direct-${width}-${theme}.png`, fullPage: true });
    assert.equal(await page.locator('.acu-connection-option[aria-pressed="true"]').innerText(), 'API Key 与终端');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await page.getByRole('button', { name: '下次登录不再显示', exact: true }).click();
    await page.waitForURL(url => url.pathname.startsWith('/dashboard'), { waitUntil: 'domcontentloaded' });
    await context.close();
  }
  assert.equal(completed, 4);
  assert.equal(revealed, 4);
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
  assert.match(await page.locator('a[href$="macos-amd64.dmg"]').getAttribute('href'), /v0\.1\.47/);
  await page.getByRole('button', { name: 'API Key 与终端', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '暂时无法读取 API Key' }).waitFor();
  failKeys = false;
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await page.getByRole('link', { name: '创建或启用 API Key', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '查看 API Key', exact: true }).isDisabled(), true);
  await context.close();
  console.log('PASS desktop/mobile Runtime-first, direct-key reveal, no auto-reveal, dismissal and no horizontal overflow');
} finally { await browser.close(); }
