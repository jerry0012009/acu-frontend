import assert from 'node:assert/strict'
import {mkdirSync, readFileSync} from 'node:fs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base=process.env.TEAM_BASE_URL || 'http://127.0.0.1:4329'
const output=process.env.TEAM_OUTPUT || '/tmp/acu-team-frontend'
mkdirSync(output,{recursive:true})
const fixture={status:'ready',profile:{summary:'团队取舍',sourceCount:1,excluded:[],rays:[{id:'team-ray',label:'夜景光源主次',category:'光影组织',score:80,confidence:70,summary:'保留暗区与局部光池',scope:'低照度夜景',sourceIds:['team-source'],evidence:[{sourceId:'team-source',quote:'夜景保留暗区'}]}]},generatedAt:null,error:null}
const view=process.env.ACU_TEAM_PROFILE_FILE?JSON.parse(readFileSync(process.env.ACU_TEAM_PROFILE_FILE,'utf8')):fixture
const user={id:42,role:1,username:'member',display_name:'GYZ member',status:1,language:'zh',setting:'{}'}
let spaces=[{key:'GYZ',view,records:[{id:'team-source',summary:'团队经验'}]}]
const browser=await chromium.launch({headless:true})
try{
const context=await browser.newContext()
await context.route('**/api/**',async route=>{
 const path=new URL(route.request().url()).pathname
 let data=''
 if(path.endsWith('/setup'))data={status:true,root_init:true}
 else if(path.endsWith('/auth/refresh'))data={access_token:'fixture',token_type:'Bearer',access_expires_at:9999999999,user,session:{sid:'fixture',current:true,login_method:'test',ip:'',user_agent:'',created_at:1,last_active_at:1,expires_at:9999999999}}
 else if(path.endsWith('/self'))data=user
 else if(path.endsWith('/acu-team-preferences'))data={version:1,spaces}
 else if(path.endsWith('/acu-film'))data={enabled:true,spaces:[]}
 else if(path.endsWith('/notifications'))data={notifications:[],unreadCount:0}
 else if(path.endsWith('/status'))data={system_name:'ACU',setup:true,version:'test'}
 await route.fulfill({json:{success:true,data}})
})
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
page.on('console',message=>{if(message.type()==='error')console.log(message.text().slice(0,1500))})
for(const theme of ['light','dark'])for(const width of [390,1440]){
 await page.emulateMedia({colorScheme:theme});await page.addInitScript(theme=>{localStorage.setItem('theme',theme);localStorage.setItem('i18nextLng','zh')},theme)
 await page.setViewportSize({width,height:1000});await page.goto(base+'/private-acu/film')
 const graph=page.locator('svg[aria-label="Preference starfish"], svg[aria-label="偏好海星图"]')
 await page.locator('[data-testid="preference-chart-viewport"] svg').waitFor().catch(async error=>{console.log(page.url(),await page.locator('body').innerText(),errors);throw error})
 const svg=page.locator('[data-testid="preference-chart-viewport"] svg')
 assert.equal(await svg.locator('filter').getAttribute('filterUnits'),'userSpaceOnUse','selected vertical/horizontal rays need a nonzero filter region')
 assert.equal(await svg.locator('path.preference-starfish-hit').count(),view.profile.rays.length)
 assert.equal(await svg.evaluate(el=>!el.closest('details')&&el.getBoundingClientRect().top<innerHeight/2),true)
 assert(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth))
 const ray=svg.locator('g[role="button"]').first();await ray.focus();await page.keyboard.press('Enter');assert.equal(await ray.getAttribute('aria-pressed'),'true')
 await page.screenshot({path:`${output}/${theme}-${width}.png`,fullPage:true})
 assert.equal(await page.getByText('保存的理解，不是用户原话。',{exact:true}).count(),0)
}
spaces=[];await page.reload();await page.getByRole('button',{name:'刷新',exact:true}).waitFor();assert.equal(await page.locator('[data-testid="preference-chart-viewport"]').count(),0)
assert.deepEqual(errors,[]);console.log('Frontend team graph, keyboard, responsive layout and revoked membership passed.')
}finally{await browser.close()}
