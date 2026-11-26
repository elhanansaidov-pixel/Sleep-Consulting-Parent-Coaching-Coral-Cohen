// Accessibility menu: axe (closed + open), keyboard open/close, each preference, persistence across pages.
// Usage: node tests/e2e/a11y-menu.cjs <axe.min.js path> <out-dir>
const { chromium } = require('playwright');
const fs = require('fs');

const [axePath, out] = process.argv.slice(2);
const AXE = fs.readFileSync(axePath, 'utf8');
const ORIGIN = process.env.ORIGIN || 'https://preview-coral-cohen-sleep.coral-cohen-site.workers.dev';
let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) fail++; };

async function axe(page, name) {
  await page.addScriptTag({ content: AXE });
  const v = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }))
    .violations.map((x) => `${x.id} (${x.nodes.length}) ${x.nodes[0]?.target?.join(' ')}`));
  check(v.length === 0, `axe ${name}${v.length ? ': ' + v.join(' | ') : ''}`);
}

(async () => {
  const b = await chromium.launch();
  for (const [label, vp, mobile] of [['desktop', { width: 1440, height: 900 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
    const ctx = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile });
    const p = await ctx.newPage();
    await p.goto(`${ORIGIN}/?v=${Date.now()}`, { waitUntil: 'load' });
    await axe(p, `${label} / menu closed`);

    // keyboard: focus the button, Enter opens, focus moves into the panel
    await p.focus('[data-a11y-open]');
    await p.keyboard.press('Enter');
    check(await p.isVisible('#a11y-panel'), `${label} Enter opens panel`);
    check(await p.evaluate(() => document.getElementById('a11y-panel').contains(document.activeElement)), `${label} focus moved into panel`);
    check((await p.getAttribute('[data-a11y-open]', 'aria-expanded')) === 'true', `${label} aria-expanded=true`);
    await axe(p, `${label} / menu open`);
    await p.screenshot({ path: `${out}/a11y-${label}-open.png` });
    await p.keyboard.press('Escape');
    check(!(await p.isVisible('#a11y-panel')), `${label} Escape closes`);
    check(await p.evaluate(() => document.activeElement?.hasAttribute('data-a11y-open')), `${label} focus returns to button`);

    // text size
    await p.click('[data-a11y-open]');
    const fs0 = await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    await p.click('[data-a11y-size="1"]'); await p.click('[data-a11y-size="1"]');
    const fs2 = await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    check(Math.abs(fs2 / fs0 - 1.25) < 0.01, `${label} text size 125% (${fs0}px → ${fs2}px)`);
    check(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${label} no horizontal scroll at 125%`);

    // toggles
    for (const k of ['contrast', 'gray', 'links', 'spacing', 'cursor']) {
      await p.click(`[data-a11y-toggle="${k}"]`);
      check(await p.evaluate((k) => document.documentElement.classList.contains(`a11y-${k}`), k), `${label} ${k} on`);
      check((await p.getAttribute(`[data-a11y-toggle="${k}"]`, 'aria-pressed')) === 'true', `${label} ${k} aria-pressed`);
    }
    await p.screenshot({ path: `${out}/a11y-${label}-all-on.png` });
    await p.keyboard.press('Escape');
    await p.evaluate(() => document.querySelector('#pains').scrollIntoView());
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${out}/a11y-${label}-contrast-content.png` });

    // persistence: other page, before paint
    await p.goto(`${ORIGIN}/accessibility`, { waitUntil: 'domcontentloaded' });
    const persisted = await p.evaluate(() => ['contrast', 'gray', 'links', 'spacing', 'cursor'].every((k) => document.documentElement.classList.contains(`a11y-${k}`)) && document.documentElement.style.getPropertyValue('--a11y-fs') === '1.25');
    check(persisted, `${label} preferences persist on /accessibility`);
    await p.waitForLoadState('load');
    await axe(p, `${label} /accessibility with all prefs on`);
    await p.click('[data-a11y-open]'); await p.click('[data-a11y-reset]');
    check(await p.evaluate(() => !/a11y-/.test(document.documentElement.className) && !document.documentElement.style.getPropertyValue('--a11y-fs')), `${label} reset clears`);
    await p.screenshot({ path: `${out}/a11y-${label}-statement.png`, fullPage: false });

    // stop motion: reloads; hero becomes static and motion is not initialised
    await p.goto(`${ORIGIN}/`, { waitUntil: 'load' });
    await p.click('[data-a11y-open]');
    await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-a11y-toggle="still"]')]);
    const still = await p.evaluate(() => ({ cls: document.documentElement.classList.contains('a11y-still'), motion: document.documentElement.classList.contains('js-motion'), heroH: document.querySelector('.hero').offsetHeight, vh: innerHeight }));
    check(still.cls && !still.motion && still.heroH <= still.vh * 1.2, `${label} stop motion (hero ${still.heroH}px, vh ${still.vh})`);
    await p.click('[data-a11y-open]');
    await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-a11y-reset]')]);
    check(await p.evaluate(() => document.documentElement.classList.contains('js-motion')), `${label} motion back after reset`);
    await ctx.close();
  }
  await b.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})();
