// Assistant stage B E2E, phone size: action tracking, fix (undo) detection, tip after 5 actions,
// dismissed tip stays dismissed, learned topic shown, profile synced. Synthetic owner + lead, deleted at the end.
// Env: SB_SECRET (service key, fetched at runtime). Usage: node tests/e2e/assistant-learning.cjs <screenshot-dir>
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
  const email = `e2e-asstb-${Date.now()}@example.com`;
  const pw = 'E2e-' + crypto.randomBytes(9).toString('base64url') + '9a';
  let userId, leadId;
  const b = await chromium.launch();
  try {
    const u = await (await fetch(`${SB}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email, password: pw, email_confirm: true }) })).json();
    userId = u.id;
    await rest('profiles', { method: 'POST', body: JSON.stringify({ id: userId, role: 'owner', full_name: 'בדיקה E2E', assistant_enabled: true }) });
    // a lead that has been waiting 2 days in the first stage → the "waiting lead" data tip
    const [first] = await rest('pipeline_stages?kind=eq.open&order=position&limit=1&select=id');
    const [lead] = await rest('leads', { method: 'POST', body: JSON.stringify({ stage_id: first.id, parent_name: 'משפחת בדיקה (E2E)', phone: '050-0000000', phone_normalized: '972500000000', consent_at: new Date().toISOString(), signed_name: 'בדיקה', service: 'sleep', created_at: new Date(Date.now() - 2 * 86400000).toISOString() }) });
    leadId = lead.id;
    check(!!userId && !!leadId, 'synthetic owner + waiting lead');

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
    await p.click('.asst__welcome >> text=אחר כך');

    // open the lead and do real work
    await p.goto(URL + '#/leads/' + leadId);
    await p.waitForSelector('#ld-pri');
    // a "fix": change priority, then change it back within 2 minutes
    await p.selectOption('#ld-pri', 'high'); await p.waitForTimeout(900);
    await p.selectOption('#ld-pri', 'normal'); await p.waitForTimeout(900);
    check(!(await p.isVisible('.asst__tipb')), 'no tip before 5 actions');
    for (let i = 1; i <= 3; i++) {
      await p.fill('#ld-note', `הערת בדיקה ${i}`);
      await p.click('.note-form button');
      await p.waitForTimeout(1000);
    }
    // 5th action
    await p.waitForSelector('.asst__tipb', { timeout: 10000 }).catch(() => {});
    check(await p.isVisible('.asst__tipb'), 'tip pops after 5 actions');
    const tipText = (await p.textContent('.asst__tipb')) ?? '';
    check(tipText.includes('ממתינה'), `tip is about the waiting lead (“${tipText.trim().slice(0, 50)}…”)`);
    await p.screenshot({ path: `${out}/asstb-1-tip.png` });
    await p.click('.asst__tipb >> text=הבנתי');
    check(!(await p.isVisible('.asst__tipb')), '"הבנתי" closes the tip');

    // one more action: the dismissed tip must not return
    await p.fill('#ld-note', 'עוד הערה'); await p.click('.note-form button'); await p.waitForTimeout(1500);
    const again = await p.isVisible('.asst__tipb') ? (await p.textContent('.asst__tipb')) : '';
    check(!again.includes('ממתינה'), 'dismissed tip does not come back');
    if (again) await p.click('.asst__tipb >> text=הבנתי');

    // what the assistant learned
    await p.click('.asst__fab');
    await p.waitForSelector('#asst-panel');
    const learnText = await p.textContent('.asst__body');
    check(learnText.includes('כבר ברור לך') && learnText.includes('טיפול בפנייה'), 'profile: "טיפול בפנייה" learned after 3 successful notes');
    await p.screenshot({ path: `${out}/asstb-2-learned.png` });
    await p.click('.asst__head button');

    // server side: usage + profile
    await p.waitForTimeout(6500);
    const rows = await rest(`usage_log?user_id=eq.${userId}&select=kind,detail`);
    check(rows.some((r) => r.kind === 'undo' && r.detail === 'new-lead'), 'fix detected (priority changed back)');
    check(rows.filter((r) => r.kind === 'action' && r.detail.startsWith('insert:activities')).length >= 3, 'note actions recorded');
    check(rows.some((r) => r.kind === 'tip' && r.detail.startsWith('waiting:')), 'tip shown/closed recorded');
    check(!rows.some((r) => /הערת|בדיקה|050/.test(r.detail ?? '')), 'no personal content in usage rows');
    const prof = await rest(`assistant_profile?user_id=eq.${userId}&select=profile`);
    check(prof.length === 1 && Array.isArray(prof[0].profile.learned), 'profile synced to assistant_profile');
    check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  } catch (e) {
    check(false, String(e).split('\n')[0]);
  } finally {
    await b.close();
    if (leadId) { await rest(`activities?entity_id=eq.${leadId}`, { method: 'DELETE' }).catch(() => {}); await rest(`tasks?lead_id=eq.${leadId}`, { method: 'DELETE' }).catch(() => {}); await rest(`leads?id=eq.${leadId}`, { method: 'DELETE' }).catch((e) => check(false, 'lead cleanup ' + e)); }
    if (userId) { const r = await fetch(`${SB}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: H }); check(r.ok, 'synthetic user deleted (profile/usage cascade)'); }
  }
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})();
