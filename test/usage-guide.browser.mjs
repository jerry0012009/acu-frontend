import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.GUIDE_BASE_URL || 'http://127.0.0.1:5179'
const output = '/tmp/acu-original-runtime-guide'
mkdirSync(output, { recursive: true })
const browser = await chromium.launch()
try {
  for (const [width, language, theme] of [[1440,'zh-CN','light'],[1440,'zh-CN','dark'],[390,'zh-CN','light'],[390,'zh-CN','dark'],[320,'en-US','dark'],[768,'en-US','light'],[1920,'en-US','dark']]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: language, userAgent: 'Windows NT 10.0; Win64; x64', reducedMotion: 'reduce' })
    await context.addCookies([{name:'vite-ui-theme',value:theme,url:base}])
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/auth/refresh')) { await route.fulfill({status:401,json:{success:false,code:'AUTH_UNAUTHORIZED'}}); return }
      let data = ''
      if(path==='/api/setup') data={status:true,root_init:true}
      if(path==='/api/status') data={setup:true,system_name:'ACU'}
      await route.fulfill({json:{success:true,data}})
    })
    const page = await context.newPage()
    const errors=[]
    page.on('pageerror',error=>errors.push(error.message))
    await page.goto(base)
    const runtime=page.getByRole('tab',{name:'ACU Runtime',exact:true})
    await runtime.waitFor()
    assert.equal(await runtime.getAttribute('aria-selected'),'true')
    assert.match(await page.locator('h1').innerText(),/动态产能调度|dynamic capacity orchestration/)
    assert.equal(await page.locator('.acu-console-preview').count(),0)
    assert.equal(await page.locator('.acu-product-values').count(),0)
    assert.equal(await page.getByRole('tab').count(),6,'Runtime is added alongside all five original tutorials')
    const download=page.locator('.acu-download-button')
    assert.match(await download.getAttribute('href'),/v0\.1\.47\/ACU-Runtime-0\.1\.47-windows-amd64-Setup.exe$/)
    const frame=await page.locator('.acu-original-terminal').boundingBox()
    const intro=await page.locator('h1').boundingBox()
    if(width>=1024) {
      assert(frame.x>=intro.x+intro.width,'original left-right composition is retained')
      assert(frame.width<=580,'six tabs cannot expand the original right column')
    }
    const style=await page.locator('.acu-original-terminal').evaluate(el=>({background:getComputedStyle(el).backgroundColor,radius:Number.parseFloat(getComputedStyle(el).borderRadius)}))
    assert.equal(style.background,'rgb(11, 15, 23)','original dark terminal surface is retained in both themes')
    assert.equal(style.radius,width<=560?20:24)
    await page.evaluate(()=>document.fonts.ready)
    await page.evaluate(()=>scrollTo(0,0))
    await page.screenshot({path:`${output}/${width}-${language}-${theme}.png`})
    await page.locator('.acu-compact-steps summary').focus()
    await page.keyboard.press('Enter')
    assert.equal(await page.locator('.acu-setup-steps').isVisible(),true)
    await page.keyboard.press('Enter')
    await page.getByRole('tab',{name:'Codex CLI',exact:true}).click()
    await page.getByText('codex-acu',{exact:true}).waitFor()
    await page.getByRole('tab',{name:'Claude Code',exact:true}).click()
    await page.getByText('claude-acu',{exact:true}).waitFor()
    await page.getByRole('tab',{name:'API / SDK',exact:true}).click()
    await page.locator('.acu-client-tool').waitFor()
    assert.equal(await page.locator('.acu-download-button').count(),0)
    await runtime.click()
    await download.waitFor()
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    assert.deepEqual(errors,[])
    console.log(`PASS original style + Runtime ${width} ${language} ${theme}`)
    await context.close()
  }
} finally { await browser.close() }
