// Assistant (pilot) E2E, phone size: button + welcome, "טעיתי" finds the undo answer, an unknown question
// is logged as help_miss, a tour advances on click, usage rows reach the DB, and the pilot flag hides it.
// Creates a synthetic owner (MFA enrolled in the browser) and one synthetic lead; deletes all at the end.
// Env: SB_SECRET (service key, fetched at runtime). Usage: node tests/e2e/assistant.cjs <screenshot-dir>
const { chromium } = require('playwright');
const crypto = require('crypto');

const REF = 'fvkeawbtwbqcvtbqjwem';
const SB = `https://${REF}.supabase.co`;
const URL = (process.env.ORIGIN || 'https://preview-coral-cohen-sleep.coral-cohen-site.workers.dev') + '/admin';
const out = process.argv[2];
const SK = process.env.SB_SECRET;
const H = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' };
let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) fail++; };
const rest = async (path, opt = {}) => { const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { ...H, Prefer: 'return=representation' }, ...opt }); return r.ok ? r.json().catch(() => null) : Promise.reject(new Error(`${path} ${r.status} ${await r.text()}`)); };

function totp(secret) {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += a.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((x) => parseInt(x, 2)));
  const ctr = Buffer.alloc(8);
  ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = crypto.createHmac('sha1', key).update(ctr).digest();
  const o = h[19] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}

(async () => {
  const email = `e2e-asst-${Date.now()}@example.com`;
  const pw = 'E2e-' + crypto.randomBytes(9).toString('base64url') + '9a';
  let userId, leadId;
  const b = await chromium.launch();
  try {
    const u = await (await fetch(`${SB}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email, password: pw, email_confirm: true }) })).json();
    userId = u.id;
    await rest('profiles', { method: 'POST', body: JSON.stringify({ id: userId, role: 'owner', full_name: 'בדיקה E2E', assistant_enabled: true }) });
    const [lead] = await rest('leads', { method: 'POST', body: JSON.stringify({ parent_name: 'משפחת בדיקה (E2E)', phone: '050-0000000', phone_normalized: '972500000000', consent_at: new Date().toISOString(), signed_name: 'בדיקה', service: 'sleep' }) });
    leadId = lead.id;
    check(!!userId && !!leadId, 'synthetic owner + lead');

    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(URL);
    await p.fill('#email', email);
    await p.fill('#password', pw);
    await p.click('button.cbtn--primary');
    await p.waitForSelector('.qr img');
    await p.click('.auth__secret summary');
    const secret = (await p.textContent('.auth__secret code')).trim();
    await p.fill('#code', totp(secret));
    await p.click('button.cbtn--primary');
    await p.waitForSelector('.shell');

    // 0. dashboard finishes loading (also with almost no data)
    const dashOk = await p.waitForSelector('.tiles--kpi', { timeout: 15000 }).then(() => true).catch(() => false);
    check(dashOk, 'dashboard loaded');

    // 1. button + first-visit welcome
    check(await p.isVisible('.asst__fab'), 'help button visible');
    check(await p.isVisible('.asst__welcome'), 'welcome bubble on first visit');
    await p.screenshot({ path: `${out}/asst-1-welcome.png` });

    // 2. "טעיתי" → undo answer
    await p.click('.asst__welcome >> text=בואי נתחיל');
    await p.waitForSelector('#asst-panel');
    await p.screenshot({ path: `${out}/asst-2-panel.png` });
    await p.fill('#asst-q', 'טעיתי');
    await p.click('.asst__search button');
    await p.waitForSelector('.asst__ans');
    check((await p.textContent('.asst__body')).includes('טעיתי בשלב'), '"טעיתי" finds the undo answer');
    await p.screenshot({ path: `${out}/asst-3-answer.png` });

    // 3. unknown question → miss message
    await p.fill('#asst-q', 'מתכון לעוגת שוקולד');
    await p.click('.asst__search button');
    await p.waitForSelector('.asst__miss');
    check(true, 'unknown question shows "not found, forwarded"');
    await p.screenshot({ path: `${out}/asst-4-miss.png` });

    // 4. tour advances on click of the highlighted element
    await p.fill('#asst-q', '');
    await p.click('.asst__tours >> text=הפיכת פנייה למשפחה');
    await p.waitForSelector('.tour__bubble >> text=שלב 1 מתוך 2');
    await p.waitForSelector('.tour__spot');
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${out}/asst-5-tour.png` });
    await p.locator('[data-help="lead-row"]:visible').first().click();
    await p.waitForSelector('.tour__bubble >> text=שלב 2 מתוך 2', { timeout: 8000 });
    check(true, 'tour advanced after clicking the highlighted element');
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${out}/asst-6-tour-step2.png` });
    await p.click('.tour__bubble >> text=סיום');

    // 5. usage log reached the DB (batched ~5s)
    await p.waitForTimeout(6500);
    const rows = await rest(`usage_log?user_id=eq.${userId}&select=kind,detail`);
    const kinds = new Set(rows.map((r) => r.kind));
    check(kinds.has('screen') && kinds.has('help_q') && kinds.has('tour'), `usage rows saved (${rows.length}: ${[...kinds].join(',')})`);
    check(rows.some((r) => r.kind === 'help_miss' && r.detail === 'מתכון לעוגת שוקולד'), 'miss logged with the exact wording');
    check(!rows.some((r) => /050|E2E|בדיקה/.test(r.detail ?? '')), 'no personal data in usage rows');

    // 6. pilot flag off → no assistant
    await rest(`profiles?id=eq.${userId}`, { method: 'PATCH', body: JSON.stringify({ assistant_enabled: false }) });
    await p.reload();
    await p.waitForSelector('.shell');
    await p.waitForTimeout(800);
    check(!(await p.isVisible('.asst__fab')), 'pilot flag off hides the assistant');
    check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  } catch (e) {
    check(false, String(e).split('\n')[0]);
  } finally {
    await b.close();
    if (leadId) { await rest(`tasks?lead_id=eq.${leadId}`, { method: 'DELETE' }).catch(() => {}); await rest(`leads?id=eq.${leadId}`, { method: 'DELETE' }).catch((e) => check(false, 'lead cleanup ' + e)); }
    if (userId) { const r = await fetch(`${SB}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: H }); check(r.ok, 'synthetic user deleted (profile/usage cascade)'); }
  }
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})();
