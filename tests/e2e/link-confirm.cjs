// One-time links (invite/recovery) must survive link scanners / chat previews and be consumed only on click.
// Creates a synthetic invited user, generates an invite link, "previews" it (plain GET + headless load without
// clicking), then clicks through to the set-password screen. Deletes the user at the end.
// Env: SB_SECRET (service key, fetched at runtime by the caller). Usage: node tests/e2e/link-confirm.cjs
const { chromium } = require('playwright');
const REF = 'fvkeawbtwbqcvtbqjwem';
const API = `https://${REF}.supabase.co/auth/v1`;
const ORIGIN = process.env.ORIGIN || 'https://preview-coral-cohen-sleep.coral-cohen-site.workers.dev';
const SK = process.env.SB_SECRET;
const H = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' };
let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) fail++; };

(async () => {
  const email = `e2e-link-${Date.now()}@example.com`;
  const gen = await (await fetch(`${API}/admin/generate_link`, { method: 'POST', headers: H, body: JSON.stringify({ type: 'invite', email, redirect_to: `${ORIGIN}/admin` }) })).json();
  const userId = gen.id || gen.user?.id;
  const hash = gen.hashed_token || gen.properties?.hashed_token;
  check(!!userId && !!hash, 'synthetic user + hashed token');
  const link = `${ORIGIN}/admin?token_hash=${hash}&type=invite`;
  const b = await chromium.launch();
  try {
    // 1) chat-preview / scanner: plain GET + a full page load with no click
    await fetch(link);
    const pv = await b.newPage();
    await pv.goto(link, { waitUntil: 'load' });
    await pv.getByRole('button', { name: 'המשך לבחירת סיסמה' }).waitFor();
    check(true, 'preview load shows the continue button only');
    await pv.close();

    // 2) the real click, in a fresh browser (like Coral's phone)
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(link, { waitUntil: 'load' });
    await p.getByRole('button', { name: 'המשך לבחירת סיסמה' }).click();
    await p.getByLabel('סיסמה חדשה').first().waitFor({ timeout: 15000 });
    check(true, 'token still valid after preview → set-password screen');
    check(!(await p.evaluate(() => location.search)), 'token removed from the address bar');
    if (process.env.OUT) await p.screenshot({ path: `${process.env.OUT}/link-confirm-setpw.png` });

    // 3) reusing the link fails gracefully
    const p2 = await (await b.newContext()).newPage();
    await p2.goto(link, { waitUntil: 'load' });
    await p2.getByRole('button', { name: 'המשך לבחירת סיסמה' }).click();
    await p2.getByText('הקישור כבר נוצל').waitFor({ timeout: 15000 });
    check(true, 'second use shows a friendly "link used" message');
  } catch (e) {
    check(false, String(e).split('\n')[0]);
  } finally {
    await b.close();
    if (userId) {
      const r = await fetch(`${API}/admin/users/${userId}`, { method: 'DELETE', headers: H });
      check(r.ok, 'synthetic user deleted');
    }
  }
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})();
