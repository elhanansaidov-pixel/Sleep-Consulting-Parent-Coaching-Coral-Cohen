// E2E (stage F): settings → automations panel → enable device notifications (web push subscribe).
// Usage: node tests/e2e/push-settings.cjs <cred-file: email\npassword> <screenshot-dir>
// Uses a synthetic owner. Headless Chromium may not reach a push service; the result is reported as-is.
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');

const [email, pw] = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n');
const out = process.argv[3];
const ORIGIN = 'https://preview-coral-cohen-sleep.coral-cohen-site.workers.dev';

function totp(secret) {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += a.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8);
  ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = crypto.createHmac('sha1', key).update(ctr).digest();
  const o = h[19] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.grantPermissions(['notifications'], { origin: ORIGIN });
  const p = await ctx.newPage();
  const log = [];
  p.on('pageerror', (e) => log.push('pageerror ' + e.message));

  await p.goto(ORIGIN + '/admin');
  await p.waitForSelector('#email');
  await p.fill('#email', email);
  await p.fill('#password', pw);
  await p.click('button.cbtn--primary');
  await p.waitForSelector('.qr img', { timeout: 20000 });
  await p.click('.auth__secret summary');
  const secret = (await p.textContent('.auth__secret code')).trim();
  await p.fill('#code', totp(secret));
  await p.click('button.cbtn--primary');
  await p.waitForSelector('.shell');

  await p.goto(ORIGIN + '/admin#/settings');
  await p.waitForSelector('#auto-h');
  await p.waitForTimeout(800);
  log.push('automations: ' + (await p.$$eval('.autos li', (e) => e.map((x) => (x.querySelector('input').checked ? '✓ ' : '✗ ') + x.innerText.trim()))).join(' | '));
  const btn = await p.$('button:has-text("הפעלת התראות")');
  log.push('enable button present: ' + !!btn);
  if (btn) {
    await btn.click();
    await p.waitForTimeout(6000);
    log.push('after enable: ' + (await p.textContent('#push-h ~ .toast').catch(() => '')) + ' | state chip: ' + !!(await p.$('#push-h ~ p .chip--won')));
  }
  await p.screenshot({ path: out + '/f1-settings.png', fullPage: true });
  console.log(log.join('\n'));
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
