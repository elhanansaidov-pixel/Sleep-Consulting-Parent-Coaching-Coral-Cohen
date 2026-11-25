// Accessibility audit (axe-core, WCAG 2.0/2.1 A+AA) of the public pages and every CRM screen,
// on desktop and mobile widths. Seeds nothing itself — pass a synthetic owner + optional data.
// Usage: node tests/e2e/a11y.cjs <axe.min.js path> <cred-file: email\npassword> <out-dir>
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');

const [axePath, credFile, out] = process.argv.slice(2);
const AXE = fs.readFileSync(axePath, 'utf8');
const [email, pw] = fs.readFileSync(credFile, 'utf8').trim().split('\n');
const ORIGIN = process.env.ORIGIN || 'https://preview-coral-cohen-sleep.coral-cohen-site.workers.dev';

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

async function audit(page, name, results) {
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    return res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes[0]?.target?.join(' ') }));
  });
  results.push({ name, violations: r });
}

(async () => {
  const b = await chromium.launch();
  const results = [];
  for (const vp of [{ w: 1366, h: 900, tag: 'desktop' }, { w: 390, h: 844, tag: 'mobile' }]) {
    const p = await b.newPage({ viewport: { width: vp.w, height: vp.h }, reducedMotion: 'reduce' });
    for (const path of ['/', '/privacy', '/accessibility']) {
      await p.goto(ORIGIN + path, { waitUntil: 'load' });
      await p.waitForTimeout(800);
      await audit(p, `${vp.tag} ${path}`, results);
    }
    await p.close();
  }

  // CRM (desktop + mobile, same session)
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(ORIGIN + '/admin');
  await p.waitForSelector('#email');
  await audit(p, 'crm login', results);
  await p.fill('#email', email);
  await p.fill('#password', pw);
  await p.click('button.cbtn--primary');
  await p.waitForSelector('.qr img', { timeout: 20000 });
  await audit(p, 'crm mfa-enroll', results);
  await p.click('.auth__secret summary');
  const secret = (await p.textContent('.auth__secret code')).trim();
  await p.fill('#code', totp(secret));
  await p.click('button.cbtn--primary');
  await p.waitForSelector('.shell');
  const routes = ['dashboard', 'leads', 'clients', 'deals', 'programs', 'tasks', 'settings', 'help'];
  const firstLead = process.env.LEAD_ID;
  if (firstLead) routes.push(`leads/${firstLead}`);
  if (process.env.CLIENT_ID) routes.push(`clients/${process.env.CLIENT_ID}`);
  if (process.env.PROGRAM_ID) routes.push(`programs/${process.env.PROGRAM_ID}`);
  for (const r of routes) {
    await p.goto(`${ORIGIN}/admin#/${r}`);
    await p.waitForTimeout(1400);
    await audit(p, `crm ${r}`, results);
  }
  await p.setViewportSize({ width: 390, height: 844 });
  for (const r of ['dashboard', 'leads', 'deals', 'tasks']) {
    await p.goto(`${ORIGIN}/admin#/${r}`);
    await p.waitForTimeout(1200);
    await audit(p, `crm mobile ${r}`, results);
  }
  await b.close();

  fs.writeFileSync(`${out}/a11y.json`, JSON.stringify(results, null, 2));
  let total = 0;
  for (const r of results) {
    total += r.violations.length;
    console.log(`${r.violations.length ? 'FAIL' : 'PASS'} ${r.name}${r.violations.map((v) => `\n   - [${v.impact}] ${v.id} (${v.nodes}): ${v.help} → ${v.sample}`).join('')}`);
  }
  console.log(`\n${results.length} screens audited, ${total} violation types`);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
