const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{for(const width of[1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});
  let records=[];const model={id:'doubao-seedance-2.0-mini',kind:'video',sizes:['16:9','9:16','1:1'],resolutions:['480p','720p'],minSeconds:4,maxSeconds:15,maxImages:9,maxVideos:3,audio:true,frameModes:true};
  await page.route('**/api/**',route=>{const p=new URL(route.request().url()).pathname;let data={};
   if(p==='/api/user/auth/refresh')return route.fulfill({json:{success:true,data:{token_type:'Bearer',access_token:'fixture',access_expires_at:Date.now()/1000+3600,user:{id:1,username:'Review',role:1},session:{sid:'fixture',current:true,login_method:'password',ip:'127.0.0.1',user_agent:'acceptance',created_at:Date.now()/1000,last_active_at:Date.now()/1000,expires_at:Date.now()/1000+3600}}}});
   if(p==='/api/user/self')data={id:1,username:'Review',role:1};
   if(p==='/api/status')data={setup:true,system_name:'ACU',quota_per_unit:500000,usd_exchange_rate:6.74};
   if(p==='/api/notice')data='';
   if(p==='/api/user/self/acu-conversation-options')data={tokens:[{id:1,name:'ACU',masked_key:'sk-****',group:'default',routing_preference:'balanced'}],selected_token_id:1,models:[]};
   return route.fulfill({json:{success:true,data}});
  });
  await page.route('**/pg/**',route=>{const p=new URL(route.request().url()).pathname;
   if(p==='/pg/media/models')return route.fulfill({json:{success:true,data:[model,{id:'gpt-image-2.6',kind:'image',sizes:['1024x1024','1536x1024'],maxImages:8,maxVideos:0,audio:false,frameModes:false}]}});
   if(p==='/pg/media/history')return route.fulfill({json:{success:true,data:records}});
   if(p==='/pg/videos/estimate')return route.fulfill({json:{success:true,data:{priceCny:.8048}}});
   if(p==='/pg/videos'){const b=route.request().postDataJSON();assert.equal(b.seconds,'4');assert.equal(b.metadata.resolution,'480p');records=[{id:'task_test',kind:'video',model:model.id,status:'queued',created:Date.now()/1000,url:'/v1/videos/task_test/content'}];return route.fulfill({json:{id:'task_test',status:'queued'}})}
   if(p==='/pg/media/assets')return route.fulfill({json:{success:true,data:{url:'http://127.0.0.1:4347/pg/assets/1/upload-test.png?expires=9999999999&signature=fixture',type:'image',name:'reference.png'}}});
   return route.fulfill({status:404,json:{}});
  });
  await page.addInitScript(()=>{localStorage.setItem('setup_status_checked','true');localStorage.setItem('i18nextLng','en')});
  await page.goto('http://127.0.0.1:4347/video-playground',{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'Video generation',exact:true}).waitFor();
  await page.getByLabel('Prompt',{exact:true}).fill('A red sphere rolls across a white table.');
  await page.getByRole('button',{name:'Generate',exact:true}).click();
  await page.getByText('Video is generating',{exact:true}).waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'/tmp/acu-media-video-'+width+'.png',fullPage:true});
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:/doubao-seedance/}).waitFor();
  await page.goto('http://127.0.0.1:4347/image-playground',{waitUntil:'networkidle'});await page.getByRole('heading',{name:'Image generation',exact:true}).waitFor();
  assert(await page.getByRole('button',{name:'Generate',exact:true}).isDisabled());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'/tmp/acu-media-image-'+width+'.png',fullPage:true});assert.deepEqual(errors,[]);await page.close();
 }console.log('PASS desktop/mobile media routes, submit, pending, reload history, empty-state controls, no horizontal overflow');}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
