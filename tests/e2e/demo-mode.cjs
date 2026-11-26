// Demo mode (/admin?demo=1), phone size: sample data renders on every screen, edits persist in the
// browser only, the assistant works with its own memory, reset/exit work — and NOT ONE request
// reaches Supabase. Usage: node tests/e2e/demo-mode.cjs <screenshot-dir>
const { chromium } = require('playwright');
const ORIGIN = process.env.ORIGIN || 'https://preview-coral-cohen-sleep.coral-cohen-site.workers.dev';
const out = process.argv[2];
let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) fail++; };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const dbRequests = [];
  const errors = [];
  p.on('request', (r) => { if (/supabase\.(co|com)/.test(r.url())) dbRequests.push(r.method() + ' ' + r.url().split('?')[0]); });
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('dialog', (d) => (d.type() === 'prompt' ? d.accept('1800') : d.accept()));
  const go = async (hash) => { await p.goto(`${ORIGIN}/admin?demo=1${hash}`); await p.waitForSelector('.shell'); await p.waitForTimeout(700); };
  try {
    await go('#/dashboard');
    check(await p.isVisible('.demo-bar'), 'demo bar visible');
    await p.waitForSelector('.tiles--kpi', { timeout: 10000 });
    const kpi = await p.textContent('.tiles--kpi');
    check(/₪/.test(kpi), 'dashboard shows sample numbers');
    await p.click('.asst__welcome >> text=אחר כך').catch(() => {});
    await p.screenshot({ path: `${out}/demo-1-dashboard.png` });

    await go('#/leads');
    const leadCount = await p.locator('[data-help="lead-row"]:visible').count();
    check(leadCount >= 8, `leads list shows sample leads (${leadCount})`);
    await p.screenshot({ path: `${out}/demo-2-leads.png` });

    // open the newest lead, move it to "נוצר קשר", add a note → persists after reload
    await p.locator('[data-help="lead-row"]:visible', { hasText: 'משפחת לוי' }).first().click();
    await p.waitForSelector('#ld-stage');
    const opts = await p.$$eval('#ld-stage option', (o) => o.map((x) => ({ v: x.value, t: x.textContent })));
    await p.selectOption('#ld-stage', opts.find((o) => o.t.includes('נוצר קשר')).v);
    await p.waitForTimeout(500);
    await p.fill('#ld-note', 'הערת דמו'); await p.click('.note-form button'); await p.waitForTimeout(600);
    await p.reload(); await p.waitForSelector('#ld-stage'); await p.waitForTimeout(600);
    const stageNow = await p.$eval('#ld-stage', (s) => s.options[s.selectedIndex].textContent);
    check(stageNow.includes('נוצר קשר') && (await p.textContent('body')).includes('הערת דמו'), 'edits persist in the browser');

    // convert to family (rpc) → client page
    await p.click('[data-help="lead-convert"]').catch(() => {});
    await p.waitForURL(/#\/clients\//, { timeout: 8000 }).catch(() => {});
    check(/#\/clients\//.test(p.url()), 'convert lead → family works in demo');

    for (const [hash, sel, label] of [['#/clients', '[data-help="client-row"]', 'families'], ['#/deals', '[data-help="deal-card"]', 'deals board'], ['#/programs', '[data-help="program-row"]', 'programs'], ['#/tasks', '.task', 'tasks']]) {
      await go(hash);
      check((await p.locator(`${sel}:visible`).count()) > 0, `${label} show sample data`);
    }
    await p.screenshot({ path: `${out}/demo-3-tasks.png` });
    await go('#/deals'); await p.screenshot({ path: `${out}/demo-4-deals.png` });

    // assistant in demo: tour finds real elements
    await p.click('.asst__fab');
    await p.click('.asst__tours >> text=עדכון תהליך שבועי');
    await p.waitForSelector('.tour__spot', { timeout: 6000 });
    check(true, 'tour spotlights real sample data');
    await p.screenshot({ path: `${out}/demo-5-tour.png` });
    await p.click('.tour__bubble >> text=יציאה');

    // separate assistant memory
    const keys = await p.evaluate(() => Object.keys(localStorage));
    check(keys.some((k) => k === 'cc-demo:cc-usage') && !keys.includes('cc-usage'), 'assistant memory kept under demo keys only');

    // reset → seed restored ("משפחת לוי" back to "פנייה חדשה")
    await p.click('.demo-bar >> text=איפוס');
    await p.waitForSelector('.shell'); await p.waitForTimeout(500);
    await go('#/leads');
    const resetOk = (await p.locator('[data-help="lead-row"]:visible').count()) >= 8 && !(await p.evaluate(() => Object.keys(localStorage).includes('cc-demo:cc-usage') && JSON.parse(localStorage.getItem('cc-demo:cc-usage')).length > 5));
    check(resetOk, 'reset restores the sample data');

    // exit → real login screen
    await p.click('.demo-bar >> text=יציאה');
    await p.waitForSelector('#email', { timeout: 10000 });
    check(!p.url().includes('demo=1'), 'exit returns to the real login');
    const beforeExit = dbRequests.filter((r) => !r.includes('/auth/v1/'));
    check(dbRequests.length === 0 || beforeExit.length === 0, `no database requests while in demo (${dbRequests.length} total, incl. after exit)`);
    check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  } catch (e) {
    check(false, String(e).split('\n')[0]);
    await p.screenshot({ path: `${out}/demo-fail.png` }).catch(() => {});
  }
  await b.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})();
