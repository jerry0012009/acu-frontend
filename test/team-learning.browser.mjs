import assert from 'node:assert/strict'
import {mkdirSync} from 'node:fs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base=process.env.TEAM_LEARNING_BASE_URL || 'http://127.0.0.1:4331'
const output='/tmp/acu-team-learning-browser';mkdirSync(output,{recursive:true})
let access={spaces:[{key:'GYZ',spaceId:'team',enabled:true,memberUserIds:[3,4],writerUserIds:[3]}]}
const user={id:1,role:100,username:'root',status:1,language:'zh',setting:'{}'}
const browser=await chromium.launch({headless:true})
try{
const context=await browser.newContext();let saves=0
await context.route('**/api/**',async route=>{
 const request=route.request(),path=new URL(request.url()).pathname;let data=''
 if(path.endsWith('/setup'))data={status:true,root_init:true}
 else if(path.endsWith('/auth/refresh'))data={access_token:'fixture',token_type:'Bearer',access_expires_at:9999999999,user,session:{sid:'fixture',current:true,login_method:'test',ip:'',user_agent:'',created_at:1,last_active_at:1,expires_at:9999999999}}
 else if(path.endsWith('/self'))data=user
 else if(path.endsWith('/acu-team-preferences'))data={version:1,spaces:[]}
 else if(path.endsWith('/acu-private/film'))data={enabled:true,spaceId:'team',teamScope:'GYZ',skills:[]}
 else if(path.endsWith('/acu-private/access')){if(request.method()==='PUT'){access=request.postDataJSON();saves++}data=access}
 else if(path.endsWith('/notifications'))data={notifications:[],unreadCount:0}
 else if(path.endsWith('/status'))data={system_name:'ACU',setup:true,version:'test'}
 await route.fulfill({json:{success:true,data}})
})
for(const width of [390,1440]){
 const page=await context.newPage();await page.setViewportSize({width,height:1000});const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(()=>localStorage.setItem('i18nextLng','zh'))
 await page.goto(base+'/private-acu/film');await page.getByText('团队学习与管理',{exact:true}).click()
 const writers=page.getByLabel('可参与学习的用户 ID',{exact:true});await writers.fill('3, 4')
 assert.equal(await page.getByRole('button',{name:'添加项目',exact:true}).count(),0)
 assert.equal(await page.getByLabel('项目 API Key ID',{exact:true}).count(),0)
 await page.getByRole('button',{name:'保存权限',exact:true}).click();await page.getByText('权限已保存',{exact:true}).waitFor()
 await page.waitForFunction(()=>document.querySelectorAll('input').length>0)
 assert.deepEqual(access.spaces[0].writerUserIds,[3,4]);assert(!JSON.stringify(access).includes('projects'));assert(!JSON.stringify(access).includes('tokenIds'))
 assert(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth));await page.screenshot({path:`${output}/${width}.png`,fullPage:true});assert.deepEqual(errors,[]);await page.close()
}
assert.equal(saves,2);console.log('Team contributor save, no project controls, responsive layout and transport passed.')
}finally{await browser.close()}
