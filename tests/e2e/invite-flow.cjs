// E2E: invite link → set password (strength check) → MFA enroll → access check → forgot-password screen.
// Usage: node tests/e2e/invite-flow.cjs <file-with-action-link> <screenshot-dir>  (link from admin generate_link for a synthetic user; delete the user after)
const {chromium}=require('playwright'); const crypto=require('crypto'); const fs=require('fs');
function totp(secret){const a='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.replace(/=+$/,'').toUpperCase())bits+=a.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g).map(b=>parseInt(b,2)));const ctr=Buffer.alloc(8);ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=crypto.createHmac('sha1',key).update(ctr).digest();const o=h[19]&15;return String(((h.readUInt32BE(o)&0x7fffffff)%1e6)).padStart(6,'0');}
(async()=>{const link=fs.readFileSync(process.argv[2],'utf8').trim(); const out=process.argv[3]; const log=[];
 const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1280,height:800}});
 p.on('pageerror',e=>log.push('pageerror '+e));
 await p.goto(link,{waitUntil:'load'}); await p.waitForSelector('#pw1',{timeout:30000}); log.push('landed on: set-password');
 await p.screenshot({path:out+'/b1-setpw.png'});
 await p.fill('#pw1','short'); await p.fill('#pw2','short'); await p.click('button.cbtn--primary'); log.push('weak pw msg: '+await p.textContent('.field__err'));
 const pw='Aa1'+crypto.randomBytes(8).toString('hex'); await p.fill('#pw1',pw); await p.fill('#pw2',pw); await p.click('button.cbtn--primary');
 await p.waitForSelector('.qr img',{timeout:20000}); log.push('after password: mfa-enroll');
 await p.click('.auth__secret summary'); const secret=(await p.textContent('.auth__secret code')).trim();
 await p.fill('#code',totp(secret)); await p.click('button.cbtn--primary');
 await p.waitForSelector('text=אין הרשאת גישה',{timeout:20000});
 log.push('final screen: '+await p.textContent('.auth__title'));
 await p.screenshot({path:out+'/b2-noaccess.png'});
 // forgot-password screen renders
 await p.click('.cbtn--ghost'); await p.waitForSelector('#email'); await p.click('text=שכחתי סיסמה'); await p.waitForSelector('#fp-email'); log.push('forgot screen ok');
 console.log(log.join('\n')); await b.close();})().catch(e=>{console.error('E2E FAIL',e.message);process.exit(1)});
