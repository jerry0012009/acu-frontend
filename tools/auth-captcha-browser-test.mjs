import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/root/jerry/tapnow/node_modules/playwright');
const base = process.env.AUTH_BROWSER_BASE || 'http://127.0.0.1:5189';
const output = process.env.AUTH_BROWSER_OUTPUT || '/tmp/acu-local-auth-captcha';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
    const context = await browser.newContext({ viewport, locale: 'zh-CN' });
    const page = await context.newPage();
    const thirdParty = [];
    page.on('request', (request) => { if (request.url().includes('challenges.cloudflare.com')) thirdParty.push(request.url()); });
    let generation = 0;
    const fixture = readFileSync(new URL('./fixtures/auth-captcha.png', import.meta.url)).toString('base64');
    await page.route('**/api/auth/captcha?*', (route) => route.fulfill({ json: { success: true, data: { id: `fixture-${++generation}`, image: `data:image/png;base64,${fixture}` } } }));
    await page.goto(`${base}/sign-in`);
    await page.getByRole('button', { name: '登录', exact: true }).waitFor();
    assert.equal(await page.locator('iframe, script[src*="challenges.cloudflare.com"]').count(), 0);
    assert.equal(await page.getByAltText('验证码图片').count(), 0);
    await page.screenshot({ path: `${output}/login-${viewport.width}.png`, fullPage: true });
    await page.route('**/api/user/login', (route) => route.fulfill({ json: { success: false, code: 'CAPTCHA_REQUIRED', message: 'Please enter a new image verification code.' } }));
    await page.locator('input[name="username"]').fill('fixture-user');
    await page.locator('input[name="password"]').fill('fixture-password');
    const legal = page.getByRole('checkbox');
    if (await legal.count()) await legal.first().check();
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByAltText('验证码图片').waitFor();
    await page.screenshot({ path: `${output}/login-challenge-${viewport.width}.png`, fullPage: true });
    await page.goto(`${base}/sign-up`);
    await page.getByAltText('验证码图片').waitFor();
    await page.getByLabel('图形验证码', { exact: true }).fill('12345');
    assert.equal(await page.getByLabel('图形验证码', { exact: true }).inputValue(), '12345');
    await page.getByRole('button', { name: '刷新验证码' }).click();
    await page.waitForFunction(() => document.querySelector('input[inputmode="numeric"]')?.value === '' && !document.querySelector('input[inputmode="numeric"]')?.disabled);
    await page.screenshot({ path: `${output}/register-${viewport.width}.png`, fullPage: true });
    assert.ok(await page.getByAltText('验证码图片').evaluate((image) => image.complete && image.naturalWidth > 0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
    await page.goto(`${base}/forgot-password`);
    await page.getByAltText('验证码图片').waitFor();
    await page.screenshot({ path: `${output}/reset-${viewport.width}.png`, fullPage: true });
    assert.equal(thirdParty.length, 0);
    console.log(JSON.stringify({ viewport, loginDefaultNoChallenge: true, loginEscalation: true, registrationRefresh: true, resetImage: true, cloudflareRequests: 0, mode: 'browser with mocked authentication/challenge responses' }));
    await context.close();
  }
} finally { await browser.close(); }
