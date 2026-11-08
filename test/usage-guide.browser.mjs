import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.GUIDE_BASE_URL || 'http://127.0.0.1:5178';
const output = '/tmp/acu-usage-guide-browser';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
  for (const [width, language, theme] of [
    [1440, 'zh-CN', 'dark'], [1440, 'zh-CN', 'light'],
    [390, 'zh-CN', 'dark'], [390, 'zh-CN', 'light'],
    [320, 'en-US', 'dark'], [768, 'en-US', 'light'], [1920, 'en-US', 'dark'],
  ]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: language, userAgent: 'Windows NT 10.0; Win64; x64' });
    await context.addCookies([{ name: 'vite-ui-theme', value: theme, url: base }]);
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data = '';
      if (path === '/api/setup') data = { status: true, root_init: true };
      else if (path === '/api/status') data = { setup: true, system_name: 'ACU', version: 'test' };
      else if (path.endsWith('/auth/refresh')) { await route.fulfill({ status: 401, json: { success: false, code: 'AUTH_UNAUTHORIZED' } }); return; }
      await route.fulfill({ json: { success: true, data } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.locator('.acu-guide-access #runtime-platform').waitFor();
    assert.equal((await page.locator('h1').innerText()).replaceAll('\n', ''), 'ACUindex');
    assert.equal(await page.locator('.acu-product-purpose').isVisible(), true);
    assert.equal(await page.locator('.acu-product-values > div').count(), 3);
    assert.equal(await page.locator('.acu-product-values svg').count(), 0, 'product value copy is not an icon grid');
    assert.equal(await page.locator('.acu-story-chapters article').count(), 3);
    assert.equal(await page.locator('.acu-process-inner ol > li').count(), 3);
    assert.equal(await page.locator('.acu-process-inner ol svg').count(), 0, 'process uses editorial steps, not repeated icon tiles');
    const detail = page.locator('.acu-story-details details').first();
    await detail.locator('summary').click();
    assert.equal(await detail.getAttribute('open'), '');
    assert.equal(await detail.locator('p').isVisible(), true);
    await detail.locator('summary').click();
    assert.equal(await detail.getAttribute('open'), null);
    await detail.locator('summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await detail.locator('p').isVisible(), true, 'capability details are keyboard accessible');
    await page.keyboard.press('Enter');
    const sections = await page.locator('.acu-usage-guide, .acu-product-story, .acu-process-story').evaluateAll(elements => elements.map(element => {
      const bounds = element.getBoundingClientRect();
      return { top: bounds.top + scrollY, bottom: bounds.bottom + scrollY, width: bounds.width };
    }));
    assert.equal(sections.length, 3);
    assert(sections[1].top >= sections[0].bottom && sections[2].top >= sections[1].bottom, 'page chapters never overlap');
    const lead = await page.locator('.acu-story-lead').boundingBox();
    const chapters = await page.locator('.acu-story-chapters').boundingBox();
    assert(width >= 768 ? lead.x + lead.width <= chapters.x : chapters.y >= lead.y + lead.height, 'capabilities keep their responsive reading hierarchy');
    const flow = await page.locator('.acu-process-inner ol > li').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().y));
    assert(flow[0] < flow[1] && flow[1] < flow[2], 'process remains a vertical sequence');
    const closing = page.getByText(language === 'zh-CN' ? '准备好简化' : 'Ready to simplify', { exact: false }).first();
    await closing.scrollIntoViewIfNeeded();
    assert.equal(await closing.isVisible(), true, 'the approved closing statement is retained');
    await page.locator('.acu-product-intro').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('.acu-product-demo').getAttribute('href'), 'https://demo.acucompute.com/');
    assert.equal(await page.locator('.acu-product-console').getAttribute('href'), '/sign-up');
    const intro = await page.locator('.acu-product-intro').boundingBox();
    const access = await page.locator('.acu-guide-access').boundingBox();
    const evidence = await page.locator('.acu-product-evidence').boundingBox();
    const download = await page.locator('.acu-guide-access .acu-download-button').boundingBox();
    assert(intro && access && evidence && download);
    const setupDisclosure = page.locator('.acu-compact-steps');
    assert.equal(await setupDisclosure.getAttribute('open'), null, 'secondary setup instructions are collapsed by default');
    assert.equal(await setupDisclosure.locator('.acu-setup-steps').isVisible(), false);
    if (width >= 1024) {
      assert(access.width <= 440 && access.width < intro.width, 'access panel stays subordinate to the product narrative');
      assert(access.height < 560, `default access panel is concise: ${access.height}`);
    }
    await setupDisclosure.locator('summary').click();
    assert.equal(await setupDisclosure.locator('.acu-setup-steps').isVisible(), true, 'all setup steps remain available');
    await setupDisclosure.locator('summary').click();
    const frame = await page.locator('.acu-guide-access').evaluate(element => {
      const style = getComputedStyle(element);
      return { border: parseFloat(style.borderTopWidth), radius: parseFloat(style.borderRadius), background: style.backgroundColor };
    });
    assert(frame.border >= 1 && frame.radius <= 8, 'access is a single restrained tool frame');
    assert.notEqual(frame.background, 'rgba(0, 0, 0, 0)', 'tool frame has its own theme surface');
    const purposeType = await page.locator('.acu-product-purpose').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    assert(purposeType >= (width >= 1024 ? 29 : 22), 'product purpose retains display hierarchy');
    await page.locator('.acu-product-console').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.acu-product-demo').evaluate(element => element === document.activeElement), true, 'demo follows the primary action in keyboard order');
    if (width >= 1024) {
      assert(intro.x + intro.width <= access.x, 'product narrative and access panel never overlap');
      assert(Math.abs(intro.y - access.y) < 2, 'desktop columns share a top alignment');
      assert(download.y + download.height < 900, 'download remains in the first desktop viewport');
    } else {
      assert(access.y >= intro.y + intro.height, 'mobile access follows the brief product introduction');
      assert(evidence.y >= access.y + access.height, 'detailed product values follow the mobile access panel');
      assert(download.y + download.height < 900, 'brief product introduction leaves the mobile download action visible');
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    for (const selector of ['.acu-runtime-mark', '.acu-workflow-apps img']) {
      assert.equal(await page.locator(selector).evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true);
    }
    const navigation = await page.locator('a[href="/"]').allTextContents();
    assert(navigation.some(text => /使用教程|Usage Guide/.test(text)), 'usage guide is reachable from navigation');
    assert.equal(await page.locator('a[href="/connect"]').count(), 0, 'there is no duplicate connection-page navigation');
    await page.screenshot({ path: `${output}/guide-${width}-${language}-${theme}.png`, fullPage: true });
    await page.locator('.acu-guide-access .acu-connection-option').nth(1).click();
    await page.locator('.acu-guide-access .acu-client-tool').waitFor();
    assert.equal(await page.locator('.acu-product-purpose').isVisible(), true, 'switching connection modes preserves the product narrative');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${output}/api-${width}-${language}-${theme}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    console.log(`PASS ${width} ${language} ${theme} intro=${Math.round(intro.y)} access=${Math.round(access.y)} download=${Math.round(download.y)}`);
    await context.close();
  }
} finally { await browser.close(); }
