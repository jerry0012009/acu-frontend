import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.DETAIL_BASE_URL || 'http://127.0.0.1:4321';
const full = JSON.parse(readFileSync(process.env.REAL_DETAIL_FILE, 'utf8')).run;
const summary = {...full, evidence: {...full.evidence}, skillsBefore: [], skillsAfter: []};
const advisors = process.env.REAL_OBSERVER_FILE ? JSON.parse(readFileSync(process.env.REAL_OBSERVER_FILE,'utf8')).advisors : [];
delete summary.evidence.agentContext;
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH, headless:true});
mkdirSync('/tmp/acu-detail-acceptance', {recursive:true});
try {
 const context=await browser.newContext({locale:'en-US'});
 let failDetail=false, failObserver=false, summaryCalls=0, fullCalls=0;
const user={id:1,role:100,username:'detail-acceptance',display_name:'Acceptance',status:1,language:'en',setting:'{}'};
 await context.route('**/api/**',async route=>{
  const url=new URL(route.request().url()), path=url.pathname;
  let data='';
  if(path.endsWith('/setup'))data={status:true,root_init:true};
  else if(path.endsWith('/auth/refresh'))data={access_token:'fixture',token_type:'Bearer',access_expires_at:9999999999,user,session:{sid:'detail-test',current:true,login_method:'test',ip:'',user_agent:'',created_at:1,last_active_at:1,expires_at:9999999999}};
  else if(path.endsWith('/self'))data=user;
  else if(path.endsWith('/acu-advisor')){
    if(failObserver){await route.fulfill({status:503,json:{success:false,message:'Temporarily unavailable'}});return;}
    data={advisors};
  }
  else if(path.endsWith('/notification-preferences'))data={browserEnabled:false,inAppEnabled:true};
  else if(path.endsWith('/acu-advisor/settings'))data={globalEnabled:true,learningEnabled:true,observerEnabled:true,advisorEnabled:true,globalObserverInterval:20};
  else if(path.endsWith('/acu-memory'))data={skills:[],enabled:true};
  else if(path.endsWith('/status'))data={system_name:'ACU',setup:true};
  else if(path.endsWith('/learning-runs'))data={runs:[full]};
  else if(path.endsWith('/learning-runs/'+full.runId)){
   if(url.searchParams.get('view')==='summary'){
    summaryCalls++; if(failDetail){await route.fulfill({status:503,json:{success:false,message:'Temporarily unavailable'}});return;}
    data=summary;
   }else{fullCalls++;data=full;}
  }
  await route.fulfill({json:{success:true,data}});
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  await page.goto(base+'/private-acu/learning-runs');
  const row=page.getByRole('row').filter({hasText:full.runId});await row.waitFor();
  const start=Date.now();await row.click();
  await page.getByRole('heading',{name:'Distillation',exact:true}).waitFor({timeout:5000});
  assert(Date.now()-start<5000,'learning result must open without waiting for full raw evidence');
  assert.equal(fullCalls,width===1440?0:1,'full payload must not be fetched on initial open');
  await page.getByText('Full evidence and document snapshots',{exact:true}).click();
  await page.getByRole('heading',{name:/before/i}).waitFor().catch(async error=>{console.log((await page.locator('[data-slot="sheet-content"]').innerText()).slice(-2000),{fullCalls,errors});throw error;});
  assert(fullCalls>0);
  await page.screenshot({path:`/tmp/acu-detail-acceptance/learning-${width}.png`,fullPage:true});
 }
 failDetail=true;
 await page.goto(base+'/private-acu/learning-runs');
 await page.getByRole('row').filter({hasText:full.runId}).click();
 await page.getByText('Unable to load learning run details',{exact:true}).waitFor();
 const retry=page.getByRole('button',{name:'Retry',exact:true});await retry.waitFor();
 failDetail=false;await retry.click();
 await page.getByRole('heading',{name:'Distillation',exact:true}).waitFor();
 if(advisors.length){
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await page.goto(base+'/private-acu/advisor');
    await page.getByRole('heading',{name:'Observer observation',exact:true}).waitFor();
    await page.screenshot({path:`/tmp/acu-detail-acceptance/observer-${width}.png`,fullPage:true});
   }
   failObserver=true;await page.reload();
   await page.getByText('Unable to load Advisor suggestions',{exact:true}).waitFor();
   failObserver=false;await page.getByRole('button',{name:'Retry',exact:true}).click();
   await page.getByRole('heading',{name:'Observer observation',exact:true}).waitFor();
 }
 assert(summaryCalls>=4);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,realRunId:full.runId,fullBytes:JSON.stringify(full).length,initialBytes:JSON.stringify(summary).length,summaryCalls,fullCalls,desktopMobile:true,failureRetry:true,realObserver:advisors.length>0}));
}finally{await browser.close();}
