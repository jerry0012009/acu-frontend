const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const origin = process.env.ACU_TEST_ORIGIN || 'http://127.0.0.1:4354';

(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    for (const path of ['playground','image-playground','video-playground']) {
      const page = await browser.newPage({viewport:{width:1440,height:1000}});
      page.on('pageerror',error=>console.error('PAGE ERROR',error.message));
      page.on('console',msg=>{if(msg.type()==='error')console.error('CONSOLE',msg.text())});
      const calls=[]; let releaseKeys;
      const keysReady = new Promise(resolve=>{releaseKeys=resolve});
      await page.route('**/api/**', async route=>{
        const url=new URL(route.request().url()); calls.push(url.pathname+url.search);
        if(url.pathname==='/api/user/auth/refresh')return route.fulfill({json:{success:true,data:{access_token:'fixture',token_type:'Bearer',access_expires_at:Date.now()/1000+600,user:{id:17,username:'Fixture',role:100,group:'default'},session:{sid:'fixture',current:true,login_method:'password',ip:'127.0.0.1',user_agent:'fixture',created_at:1,last_active_at:1,expires_at:Date.now()/1000+600}}}});
        if(url.pathname==='/api/status')return route.fulfill({json:{success:true,data:{setup:true,system_name:'ACU',quota_per_unit:500000}}});
        if(url.pathname==='/api/notice')return route.fulfill({json:{success:true,data:''}});
        if(url.pathname==='/api/user/self/acu-conversation-options') {
          if(url.searchParams.get('include_models')!=='false')return route.fulfill({json:{success:true,data:{tokens:[{id:31,name:'First existing key',masked_key:'sk-***',group:'default'}],selected_token_id:31,models:[],models_error:'Model service unavailable'}}});
          await keysReady;
          return route.fulfill({json:{success:true,data:{tokens:[{id:31,name:'First existing key',masked_key:'sk-***',group:'default'},{id:30,name:'Second existing key',masked_key:'sk-***',group:'default'}],selected_token_id:0,models:[]}}});
        }
        return route.fulfill({json:{success:true,data:[]}});
      });
      await page.route('**/pg/**',route=>{
        const url=new URL(route.request().url());
        assert.equal(route.request().headers()['x-acu-playground-token-id'],'31');
        return route.fulfill({json:{success:true,data:url.pathname.endsWith('/models')?[{id:'image-fixture',kind:'image',sizes:['1024x1024'],maxImages:1},{id:'video-fixture',kind:'video',sizes:['848x480'],minSeconds:2,maxSeconds:4}]:[]}});
      });
      await page.addInitScript(()=>{localStorage.setItem('setup_status_checked','true');localStorage.setItem('i18nextLng','en')});
      await page.goto(origin+'/'+path+'?token_id=99999');
      await page.getByRole('navigation',{name:'ACU Conversation',exact:true}).waitFor();
      assert.equal(await page.getByText('No available API key',{exact:true}).count(),0,'pending keys must not claim no key');
      releaseKeys();
      try { await page.getByRole('combobox').filter({hasText:'First existing key'}).first().waitFor({timeout:10000}); }
      catch(error){console.error(path,calls,await page.locator('body').innerText());throw error;}
      assert.equal(await page.getByText('No available API key',{exact:true}).count(),0);
      assert.equal(await page.getByRole('button',{name:'Create conversation key'}).count(),0);
      if(path!=='playground')assert(!calls.some(call=>call.includes('acu-conversation-options')&&!call.includes('include_models=false')),'media does not depend on text monitoring');
      await page.screenshot({path:'/tmp/acu-default-key-'+path+'.png',fullPage:true});
      await page.close();
    }
    console.log('PASS: all three modes select first existing key, pending is not empty, stale selection recovers and media skips text catalog.');
  } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
