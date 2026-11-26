// E2E (stage D): lead → convert to family + deal → start sleep program → update week/stage/next session →
// log a session → add an overdue task → tasks screen → kanban keyboard move → deal payment → settings stage add/rename.
// Usage: node tests/e2e/crm-flow.cjs <cred-file: email\npassword> <screenshot-dir>
// Requires a synthetic owner user and ONE synthetic lead named "משפחת בדיקה (E2E)". Delete everything afterwards.
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
const localInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

(async () => {
  const b = await chromium.launch();
  const log = [];
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', (e) => log.push('pageerror ' + e.message));
  const answers = ['1800'];
  p.on('dialog', async (d) => { log.push('dialog: ' + d.type() + ' ' + d.message().split('\n')[0]); await (d.type() === 'prompt' ? d.accept(answers.shift() ?? '') : d.accept()); });

  // login + MFA enroll
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

  // 1. lead → family
  await p.goto(URL + '#/leads');
  await p.click('text=משפחת בדיקה (E2E)');
  await p.waitForSelector('text=הפיכה למשפחה');
  await p.click('button:has-text("הפיכה למשפחה")');
  await p.waitForURL(/#\/clients\//, { timeout: 15000 });
  await p.waitForSelector('text=עסקאות');
  await p.waitForTimeout(800);
  log.push('converted → client page; deal shown: ' + (await p.textContent('#dl-h + * , .mini-list')).includes('₪'));

  // 2. start sleep program
  await p.click('button:has-text("+ ייעוץ שינה")');
  await p.waitForURL(/#\/programs\//, { timeout: 15000 });
  await p.waitForSelector('#pg-w');
  await p.selectOption('#pg-w', '2');
  await p.waitForTimeout(900);
  await p.selectOption('#pg-s', '2');
  await p.waitForTimeout(900);
  const in1h = new Date(Date.now() + 3600_000);
  await p.fill('#pg-n', localInput(in1h));
  await p.locator('#pg-n').dispatchEvent('change');
  await p.waitForTimeout(900);
  await p.fill('#ss-s', 'סיכום שיחת בדיקה');
  await p.click('button:has-text("שמירת מפגש")');
  await p.waitForTimeout(1200);
  log.push('program: ' + (await p.textContent('.prog .muted')) + ' | sessions: ' + (await p.$$('#ss-h ~ .timeline-list li, .session-form ~ .timeline-list li')).length);
  await p.screenshot({ path: out + '/d3-program.png', fullPage: true });

  // 3. overdue task on the family
  await p.click('text=לכרטיס המשפחה');
  await p.waitForSelector('#t-title');
  await p.fill('#t-title', 'להתקשר לבדוק איך עבר הלילה (E2E)');
  await p.fill('#t-due', localInput(new Date(Date.now() - 26 * 3600_000)));
  await p.click('.task-add button');
  await p.waitForTimeout(1000);
  await p.screenshot({ path: out + '/d2-client.png', fullPage: true });
  await p.goto(URL + '#/tasks');
  await p.waitForSelector('.task-group');
  log.push('tasks groups: ' + (await p.$$eval('.task-group__title', (e) => e.map((x) => x.textContent.trim()))).join(' | '));
  await p.screenshot({ path: out + '/d4-tasks.png' });

  // 4. kanban: keyboard move the card to the "won" column (last-but-one column)
  await p.goto(URL + '#/deals');
  await p.waitForSelector('.kcard');
  const cols = await p.$$eval('.kcol', (e) => e.map((x) => x.getAttribute('aria-label')));
  await p.focus('.kcard');
  await p.keyboard.press('Space');
  for (let i = 0; i < 4; i++) { await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(150); }
  await p.keyboard.press('Space');
  await p.waitForTimeout(1500);
  const after = await p.$$eval('.kcol', (e) => e.map((x) => x.getAttribute('aria-label')));
  log.push('kanban before: ' + cols.join(' / '));
  log.push('kanban after:  ' + after.join(' / '));
  await p.click('.kcard__open');
  await p.waitForSelector('#ed-ps');
  await p.selectOption('#ed-ps', 'paid');
  await p.fill('#ed-pa', '1800');
  await p.click('.modal button.cbtn--primary');
  await p.waitForTimeout(1300);
  log.push('totals: ' + (await p.$$eval('.tiles--3 .tile', (e) => e.map((x) => x.textContent.trim()))).join(' | '));
  await p.screenshot({ path: out + '/d5-kanban.png' });

  // 5. settings: add + rename stage
  await p.goto(URL + '#/settings');
  await p.waitForSelector('#st-new');
  await p.fill('#st-new', 'שלב בדיקה (E2E)');
  await p.click('.stage-add button');
  await p.waitForTimeout(1500);
  log.push('stages: ' + (await p.$$eval('.stages__input', (e) => e.map((x) => x.value))).join(' | '));

  // dashboard
  await p.goto(URL + '#/dashboard');
  await p.waitForTimeout(1200);
  log.push('dashboard: ' + (await p.$$eval('.tile', (e) => e.map((x) => x.textContent.trim()))).join(' | '));
  await p.screenshot({ path: out + '/d1-dashboard.png' });

  console.log(log.join('\n'));
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
