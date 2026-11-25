// E2E (stage E): dashboard KPIs, funnel, range switch, chart tooltip, table view.
// Usage: node tests/e2e/dashboard.cjs <cred-file: email\npassword> <screenshot-dir> <tag>
// Uses a synthetic owner; the TOTP secret is cached next to the cred file between runs.
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');

const [email, pw] = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n');
const out = process.argv[3];
const tag = process.argv[4] || 'run';
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
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  p.on('pageerror', (e) => log.push('pageerror ' + e.message));

  await p.goto(URL);
  await p.waitForSelector('#email');
  await p.fill('#email', email);
  await p.fill('#password', pw);
  await p.click('button.cbtn--primary');
  await p.waitForSelector('#code', { timeout: 20000 });
  let secret;
  if (!fs.existsSync(process.argv[2] + '.totp')) {
    await p.waitForSelector('.qr img', { timeout: 20000 });
    await p.click('.auth__secret summary');
    secret = (await p.textContent('.auth__secret code')).trim();
    fs.writeFileSync(process.argv[2] + '.totp', secret);
  } else {
    secret = fs.readFileSync(process.argv[2] + '.totp', 'utf8');
    await p.waitForTimeout((30 - (Math.floor(Date.now() / 1000) % 30) + 1) * 1000);
  }
  await p.fill('#code', totp(secret));
  await p.click('button.cbtn--primary');
  await p.waitForSelector('.kpi');
  await p.waitForTimeout(1200);

  log.push('kpis: ' + (await p.$$eval('.kpi', (e) => e.map((x) => x.innerText.replace(/\n/g, ' ')))).join(' || '));
  log.push('funnel: ' + (await p.$$eval('.funnel li', (e) => e.map((x) => x.innerText.replace(/\n/g, ' ')))).join(' | '));
  await p.screenshot({ path: `${out}/e-${tag}-90d.png`, fullPage: true });

  await p.click('text=12 חודשים');
  await p.waitForTimeout(1200);
  const rects = await p.$$('.chart rect[tabindex="0"]');
  if (rects.length) {
    await rects[rects.length - 1].hover();
    await p.waitForTimeout(300);
    log.push('tooltip: ' + (await p.textContent('.chart__tip').catch(() => 'none')));
  }
  await p.screenshot({ path: `${out}/e-${tag}-12m.png`, fullPage: true });
  const tb = await p.$('button:has-text("תצוגת טבלה")');
  if (tb) {
    await tb.click();
    await p.waitForTimeout(300);
    log.push('table rows: ' + (await p.$$('.table--compact tbody tr')).length);
  }

  const m = await b.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto(URL + '#/dashboard');
  await m.waitForTimeout(500);
  console.log(log.join('\n'));
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
