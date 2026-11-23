// E2E: fill the 5-step questionnaire on the preview site and submit. Note: real Turnstile does not
// issue tokens to headless browsers, so a full success needs a real browser (or the temp key-protected copy of the function).
// Usage: node tests/e2e/questionnaire-submit.cjs <screenshot-dir>
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--disable-blink-features=AutomationControlled']}); const out=process.argv[2]; const log=[];
 const p=await b.newPage({viewport:{width:1280,height:900}, reducedMotion:'reduce'});
 p.on('pageerror',e=>log.push('pageerror '+e.message));
 p.on('response',async r=>{ if(r.url().includes('submit-lead')&&r.request().method()==='POST') log.push('submit → '+r.status()+' '+(await r.text().catch(()=>''))); });
 await p.goto('https://preview-coral-cohen-sleep.coral-cohen-site.workers.dev/#questionnaire',{waitUntil:'load'});
 const fill=async(id,v)=>p.fill('#q-'+id,v);
 await fill('parent_name','בדיקת מערכת (E2E)'); await fill('phone','050-000-0001'); await fill('child_age','שנה וחצי');
 await p.click('[data-q-next]');
 await fill('main_difficulty','בדיקה אוטומטית'); await fill('current_routine','בדיקה'); await fill('tried_so_far','בדיקה'); await p.click('[data-q-next]');
 await fill('desired_change','בדיקה'); await fill('medical_info','אין'); await fill('both_parents','כן'); await p.click('[data-q-next]');
 await fill('process_understanding','כן'); await fill('anything_else','אין'); await p.click('[data-q-next]');
 await p.check('#q-consent'); await fill('full_name','בדיקת מערכת');
 await p.waitForTimeout(8000);
 const token=await p.$eval('input[name="cf-turnstile-response"]',e=>e.value).catch(()=> '');
 log.push('turnstile token present: '+(token.length>0));
 await p.screenshot({path:out+'/f1-before-submit.png'});
 await p.click('[data-q-submit]'); await p.waitForTimeout(6000);
 log.push('done visible: '+await p.isVisible('[data-q-done]')+' | status: '+(await p.textContent('[data-q-status]')));
 await p.screenshot({path:out+'/f2-after-submit.png'});
 console.log(log.join('\n')); await b.close();})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
