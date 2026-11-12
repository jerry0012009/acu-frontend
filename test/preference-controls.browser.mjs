import assert from 'node:assert/strict'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH})
try {
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000}})
  await context.addInitScript(()=>localStorage.setItem('i18nextLng','zhCN'))
  const page=await context.newPage()
  let saved
  await page.route('**/acu-preference-controls/*',async route=>{
   saved=route.request().postDataJSON()
   await route.fulfill({json:{success:true,data:{updated:true}}})
  })
  await page.goto(`${process.env.PREFERENCE_BASE_URL || 'http://127.0.0.1:5193'}/private-acu/account`)
  const region=page.getByRole('region',{name:'偏好记录',exact:true})
  await region.getByRole('button',{name:'修正理解'}).first().click()
  const scope=region.getByRole('textbox',{name:'适用场景',exact:true})
  assert.equal(await scope.inputValue(),'面向用户的交付')
  const exceptions=region.getByRole('textbox',{name:'例外情况',exact:true})
  assert.equal(await exceptions.inputValue(),'用户明确要求改版时除外')
  await region.getByRole('textbox',{name:'可复用偏好',exact:true}).fill('先保留用户认可部分，再修改问题部分。')
  await region.getByRole('button',{name:'Save',exact:true}).or(region.getByRole('button',{name:'保存',exact:true})).click()
  await region.getByRole('button',{name:'修正理解'}).first().waitFor()
  assert.equal(saved.scope,undefined)
  assert.equal(saved.exceptions,undefined)
  assert.equal(saved.rule,'先保留用户认可部分，再修改问题部分。')
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await context.close()
 }
 console.log('Preference edit reads current rule/scope/exception and preserves untouched fields on desktop/mobile')
}finally{await browser.close()}
