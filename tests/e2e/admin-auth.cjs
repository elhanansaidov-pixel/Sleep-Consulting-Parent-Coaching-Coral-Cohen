// E2E: admin login → wrong password → MFA enroll → dashboard → settings → mobile MFA challenge → logout.
// Usage: node tests/e2e/admin-auth.cjs <cred-file: email\npassword> <screenshot-dir>
// Use a temporary synthetic user only; delete it afterwards (see supabase/README.md).
const {chromium, devices}=require('playwright'); const crypto=require('crypto'); const fs=require('fs');
const [email,pw]=fs.readFileSync(process.argv[2],'utf8').trim().split('\n');
function totp(secret){const a='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.replace(/=+$/,'').toUpperCase())bits+=a.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g).map(b=>parseInt(b,2)));const ctr=Buffer.alloc(8);ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=crypto.createHmac('sha1',key).update(ctr).digest();const o=h[19]&15;return String(((h.readUInt32BE(o)&0x7fffffff)%1e6)).padStart(6,'0');}
(async()=>{const b=await chromium.launch(); const out=process.argv[3]; const log=[];
 const p=await b.newPage({viewport:{width:1280,height:800}});
 p.on('pageerror',e=>log.push('pageerror '+e));
 await p.goto('http://localhost:4321/admin',{waitUntil:'load'}); await p.waitForSelector('#email');
 await p.screenshot({path:out+'/a1-login.png'});
 await p.fill('#password','WrongPassword123'); await p.fill('#email',email); await p.click('button.cbtn--primary'); await p.waitForSelector('.field__err');
 log.push('wrong pw msg: '+await p.textContent('.field__err'));
 await p.fill('#password',pw); await p.click('button.cbtn--primary');
 await p.waitForSelector('.qr img',{timeout:20000}); await p.screenshot({path:out+'/a2-mfa-enroll.png'});
 await p.click('.auth__secret summary'); const secret=(await p.textContent('.auth__secret code')).trim();
 await p.fill('#code',totp(secret)); await p.click('button.cbtn--primary');
 await p.waitForSelector('.shell',{timeout:20000}); await p.waitForTimeout(1500);
 await p.screenshot({path:out+'/a3-dashboard.png'});
 log.push('tiles: '+(await p.$$eval('.tile__value',e=>e.map(x=>x.textContent))).join(','));
 await p.goto('http://localhost:4321/admin#/settings'); await p.waitForSelector('.stages li'); await p.screenshot({path:out+'/a4-settings.png'});
 log.push('stages: '+(await p.$$eval('.stages__name',e=>e.map(x=>x.textContent))).join(' | '));
 // reload → session persists, must pass MFA challenge again? (aal2 persists in session)
 await p.reload(); await p.waitForSelector('.shell, #code',{timeout:15000}); log.push('after reload: '+(await p.$('.shell')?'still in (aal2 session)':'mfa challenge'));
 // mobile
 const ctx=await b.newContext({...devices['iPhone 13']}); const m=await ctx.newPage();
 await m.goto('http://localhost:4321/admin'); await m.waitForSelector('#email'); await m.fill('#email',email); await m.fill('#password',pw); await m.click('button.cbtn--primary');
 await m.waitForSelector('#code',{timeout:20000}); await m.screenshot({path:out+'/a5-m-challenge.png'});
 // wait for next TOTP window to avoid replay rejection
 await m.waitForTimeout((30-Math.floor(Date.now()/1000)%30+1)*1000);
 await m.fill('#code',totp(secret)); await m.click('button.cbtn--primary'); await m.waitForSelector('.shell',{timeout:20000}); await m.waitForTimeout(1200);
 await m.screenshot({path:out+'/a6-m-dashboard.png'});
 // logout
 await m.click('.topm .cbtn'); await m.waitForSelector('#email'); log.push('logout ok');
 console.log(log.join('\n')); await b.close();})().catch(e=>{console.error('E2E FAIL',e.message);process.exit(1)});
