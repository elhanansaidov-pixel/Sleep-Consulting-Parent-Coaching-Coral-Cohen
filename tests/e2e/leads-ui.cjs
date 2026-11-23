// E2E: owner login (+MFA enroll) → leads list → phone search → CSV export (formula-escaped) →
// lead card (answers rendered as text) → stage change → note → mobile cards → delete.
// Usage: node tests/e2e/leads-ui.cjs <cred-file: email\npassword> <screenshot-dir>
// Use a temporary synthetic owner and synthetic leads only; delete them afterwards.
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');

const [email, pw] = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n');
const out = process.argv[3];
const URL = process.env.ADMIN_URL || 'https://preview-coral-cohen-sleep.coral-cohen-site.workers.dev/admin';

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
  const log = [];
  const ctx = await b.newContext({ viewport: { width: 1366, height: 860 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => log.push('pageerror ' + e.message));
  p.on('dialog', async (d) => { log.push('dialog: ' + d.message().split('\n')[0]); await d.accept('בדיקת מערכת (E2E)'); });

  await p.goto(URL);
  await p.waitForSelector('#email');
  await p.fill('#email', email);
  await p.fill('#password', pw);
  await p.click('button.cbtn--primary');
  await p.waitForSelector('.qr img');
  await p.click('.auth__secret summary');
  const secret = (await p.textContent('.auth__secret code')).trim();
  await p.fill('#code', totp(secret));
  await p.click('button.cbtn--primary');
  await p.waitForSelector('.shell');

  await p.goto(URL + '#/leads');
  await p.waitForSelector('.table tbody tr');
  await p.waitForTimeout(500);
  log.push('rows: ' + (await p.$$('.table tbody tr')).length + ' | duplicate chips: ' + (await p.$$('.chip--warn')).length);
  await p.screenshot({ path: out + '/l1-list.png' });

  await p.fill('#lead-q', '0000001');
  await p.waitForTimeout(900);
  log.push('search by phone rows: ' + (await p.$$('.table tbody tr')).length);
  await p.fill('#lead-q', '');
  await p.waitForTimeout(700);

  const dl = p.waitForEvent('download');
  await p.click('text=ייצוא ל-CSV');
  const d = await dl;
  const csv = fs.readFileSync(await d.path(), 'utf8');
  log.push('csv lines: ' + csv.trim().split('\r\n').length + ' | formula escaped: ' + csv.includes("\"'=1+1\""));

  await p.click('.table tbody tr:last-child .rowlink');
  await p.waitForSelector('.answers');
  await p.waitForTimeout(600);
  log.push('html shown as plain text: ' + (await p.textContent('.answers')).includes('<b>בלילה</b>'));
  await p.selectOption('#ld-stage', { index: 1 });
  await p.waitForTimeout(1200);
  await p.fill('#ld-note', 'הערת בדיקה');
  await p.click('.note-form button');
  await p.waitForTimeout(1200);
  log.push('timeline items: ' + (await p.$$('.timeline-list li')).length);
  await p.screenshot({ path: out + '/l2-detail.png', fullPage: true });

  const m = await ctx.newPage();
  await m.setViewportSize({ width: 390, height: 844 });
  await m.goto(URL + '#/leads');
  await m.waitForSelector('.lcard');
  await m.screenshot({ path: out + '/l3-mobile.png' });

  await p.click('text=מחיקת הפנייה');
  await p.waitForTimeout(1500);
  log.push('after delete: ' + p.url().split('#')[1]);
  console.log(log.join('\n'));
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
