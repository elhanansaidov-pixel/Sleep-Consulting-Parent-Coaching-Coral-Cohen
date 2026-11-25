import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { FAQ, type Faq } from './faq';
import { search } from './search';
import { TOURS } from './tours';
import { TourHost, startTour } from './Tour';
import { setUsageEnabled, track, USAGE_EVENT, type UsageRow } from './usage';
import { installInstrumentation } from './instrument';
import { computeProfile, syncProfile, type Profile } from './profile';
import { dismiss, loadSnapshot, pickTip, TOPIC_LABEL, type DataSnapshot, type Tip } from './tips';

const WELCOMED = 'cc-assistant-welcomed';
const SCREEN_LABEL: Record<string, string> = {
  dashboard: 'לוח בקרה', leads: 'פניות', clients: 'משפחות', deals: 'עסקאות', programs: 'תהליכים', tasks: 'משימות', settings: 'הגדרות', help: 'מדריך',
};
// Short daily tips; one per day, rotating. Stage B replaces this with tips driven by usage + data.
const DAILY: { text: string; tour?: string }[] = [
  { text: 'אחרי שיחה עם הורה, העבירי את הפנייה ל"נוצר קשר". כך המערכת מפסיקה להזכיר עליה.', tour: 'new-lead' },
  { text: 'שדה "מעקב הבא" בפנייה מכניס אותה למייל הבוקר ביום שבחרת.', tour: 'new-lead' },
  { text: 'אחרי כל שיחה שבועית, רשמי סיכום קצר בתהליך. כך כל ההיסטוריה במקום אחד.', tour: 'program-update' },
  { text: 'משפחה שילמה? "פרטים" בכרטיס העסקה ← סטטוס תשלום וכמה שולם.', tour: 'payment' },
  { text: 'פעם בחודש כדאי ללחוץ "ייצוא ל-CSV" במסך הפניות, לגיבוי.', tour: 'export' },
  { text: 'בלוח הבקרה, "הכנסות בפועל" כולל רק כסף ששולם. "תחזית" היא עסקאות פתוחות.', tour: 'dashboard' },
  { text: 'המערכת יכולה להיפתח כמו אפליקציה: "הוספה למסך הבית" בדפדפן.' },
];
const TIP_AFTER_ACTIONS = 5;
/** Daily tip, skipping topics already learned. */
function dayTip(learned: string[]) {
  const pool = DAILY.filter((t) => !t.tour || !learned.includes(t.tour));
  const list = pool.length ? pool : DAILY;
  return list[Math.floor(Date.now() / 86_400_000) % list.length];
}
function topScreens(p: Profile): string[] {
  const top = p.shortcuts.filter((k) => SCREEN_LABEL[k]);
  return [...top, 'leads', 'tasks', 'programs'].filter((k, i, a) => a.indexOf(k) === i).slice(0, 3);
}
const hourText = (h: number) => `${String(h).padStart(2, '0')}:00`;

function Answer({ f, onTour }: { f: Faq; onTour: (id: string) => void }) {
  return (
    <div className="asst__ans">
      <p className="asst__q">{f.q}</p>
      <p>{f.a}</p>
      {f.tour && <button type="button" className="cbtn cbtn--sm" onClick={() => onTour(f.tour!)}>אראה לך על המסך</button>}
    </div>
  );
}

/** Help button + bottom sheet. Rendered through a portal to <body> so position:fixed is never trapped. */
export function Assistant() {
  const [open, setOpen] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [q, setQ] = useState('');
  const [asked, setAsked] = useState('');
  const [results, setResults] = useState<Faq[]>([]);
  const [profile, setProfile] = useState<Profile>(() => computeProfile());
  const [tip, setTip] = useState<Tip | null>(null);
  const fab = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const sessionActions = useRef(0);
  const snapshot = useRef<{ at: number; data: DataSnapshot | null }>({ at: 0, data: null });
  const shownTips = useRef(new Set<string>());

  useEffect(() => {
    setUsageEnabled(true);
    installInstrumentation();
    syncProfile(true).catch(() => {});
    try { if (!localStorage.getItem(WELCOMED)) setWelcome(true); } catch { /* ignore */ }
  }, []);

  // Learn on every event; after a few actions in this visit, consider one proactive tip.
  useEffect(() => {
    const on = async (e: Event) => {
      const row = (e as CustomEvent<UsageRow>).detail;
      const p = computeProfile();
      setProfile(p);
      syncProfile().catch(() => {});
      if (row.kind !== 'action') return;
      sessionActions.current++;
      if (sessionActions.current < TIP_AFTER_ACTIONS) return;
      if (Date.now() - snapshot.current.at > 60_000) {
        snapshot.current = { at: Date.now(), data: await loadSnapshot().catch(() => null) };
      }
      const t = pickTip(snapshot.current.data, p);
      if (t && !document.body.hasAttribute('data-tour-active')) {
        setTip(t);
        if (!shownTips.current.has(t.key)) { shownTips.current.add(t.key); track('tip', `${t.key}:shown`); }
      }
    };
    window.addEventListener(USAGE_EVENT, on);
    return () => window.removeEventListener(USAGE_EVENT, on);
  }, []);

  function tipOk() { if (!tip) return; dismiss(tip.key); track('tip', `${tip.key}:ok`); setTip(null); }
  function tipGo() {
    if (!tip) return;
    dismiss(tip.key); track('tip', `${tip.key}:go`);
    const t = tip; setTip(null);
    if (t.tour) startTour(t.tour); else if (t.href) window.location.hash = t.href;
  }
  // Screen visits (the "shortcuts" are the most-opened screens).
  useEffect(() => {
    const log = () => track('screen', window.location.hash.replace(/^#\/?/, '').split('/')[0] || 'dashboard');
    log();
    window.addEventListener('hashchange', log);
    return () => window.removeEventListener('hashchange', log);
  }, []);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open]);

  function dismissWelcome() { setWelcome(false); try { localStorage.setItem(WELCOMED, '1'); } catch { /* ignore */ } }
  function openPanel() { dismissWelcome(); setOpen(true); track('action', 'assistant_open'); }
  function close() { setOpen(false); fab.current?.focus(); }
  function tour(id: string) { setOpen(false); startTour(id); }

  // Live results while typing; logging happens on submit.
  useEffect(() => { setResults(q.trim().length >= 2 ? search(q) : []); setAsked(''); }, [q]);
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    const r = search(text);
    setResults(r);
    setAsked(text);
    if (r.length) track('help_q', r.map((f) => f.id).join(','));
    else track('help_miss', text);
  }

  const daily = dayTip(profile.learned);

  return createPortal(
    <>
      <TourHost />
      {tip && !open && !welcome && (
        <div className="asst__welcome asst__tipb" role="status" aria-live="polite">
          <p><span aria-hidden="true">💡 </span>{tip.text}</p>
          <span className="actions">
            {(tip.tour || tip.href) && <button type="button" className="cbtn cbtn--primary cbtn--sm" onClick={tipGo}>{tip.tour ? 'תראי לי' : 'לשם'}</button>}
            <button type="button" className="cbtn cbtn--ghost cbtn--sm" onClick={tipOk}>הבנתי</button>
          </span>
        </div>
      )}
      {welcome && !open && (
        <div className="asst__welcome" role="status">
          <p><b>היי קורל ✨</b> אני העוזרת שלך במערכת. אפשר לשאול אותי כל שאלה, ואני גם יכולה להראות לך על המסך איך עושים דברים.</p>
          <span className="actions">
            <button type="button" className="cbtn cbtn--primary cbtn--sm" onClick={openPanel}>בואי נתחיל</button>
            <button type="button" className="cbtn cbtn--ghost cbtn--sm" onClick={dismissWelcome}>אחר כך</button>
          </span>
        </div>
      )}
      <button ref={fab} type="button" className="asst__fab" onClick={() => (open ? close() : openPanel())} aria-expanded={open} aria-controls="asst-panel" data-help="assistant">
        <span aria-hidden="true">✨</span> עזרה
      </button>

      {open && <div className="asst__scrim" onClick={close} aria-hidden="true" />}
      {open && (
        <div id="asst-panel" className="asst" role="dialog" aria-modal="true" aria-labelledby="asst-h">
          <div className="asst__head">
            <h2 id="asst-h">✨ איך אפשר לעזור?</h2>
            <button type="button" className="cbtn cbtn--ghost cbtn--sm" onClick={close} aria-label="סגירת העוזרת">✕</button>
          </div>

          <form className="asst__search" onSubmit={onSubmit} role="search">
            <label className="sr-only" htmlFor="asst-q">מה תרצי לשאול?</label>
            <input ref={input} id="asst-q" className="input" type="search" placeholder="מה תרצי לשאול?" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
            <button className="cbtn cbtn--primary" disabled={!q.trim()}>שאלי</button>
          </form>

          <div className="asst__body" aria-live="polite">
            {q.trim().length >= 2 ? (
              results.length ? results.map((f) => <Answer key={f.id} f={f} onTour={tour} />)
                : asked ? <p className="asst__miss">לא מצאתי תשובה לזה. העברתי את השאלה למנהל הטכני, והוא יוסיף אותה. בינתיים אפשר לנסח אחרת, או לבחור מדריך מהרשימה.</p>
                : <p className="muted">לחצי "שאלי" כדי לחפש.</p>
            ) : (
              <>
                <section className="asst__tip" aria-labelledby="asst-tip-h">
                  <h3 id="asst-tip-h">טיפ להיום</h3>
                  <p>{daily.text}</p>
                  {daily.tour && <button type="button" className="cbtn cbtn--sm" onClick={() => tour(daily.tour!)}>תראי לי</button>}
                </section>

                <section aria-labelledby="asst-sc-h">
                  <h3 id="asst-sc-h">הקיצורים שלך</h3>
                  <div className="asst__chips">
                    {topScreens(profile).map((s) => <a key={s} className="chip" href={`#/${s}`} onClick={close}>{SCREEN_LABEL[s]}</a>)}
                  </div>
                </section>

                <section aria-labelledby="asst-tours-h">
                  <h3 id="asst-tours-h">אראה לך על המסך</h3>
                  <ul className="asst__tours">
                    {TOURS.map((t) => <li key={t.id}><button type="button" onClick={() => tour(t.id)}>{t.title}<span className="muted"> · {t.steps.length} שלבים</span></button></li>)}
                  </ul>
                </section>

                <section aria-labelledby="asst-me-h">
                  <h3 id="asst-me-h">מה למדתי עלייך עד עכשיו</h3>
                  {profile.counts.actions < 5 && !profile.learned.length ? (
                    <p className="muted">אני עדיין לומדת איך את עובדת. עם הזמן אדע מה כבר ברור לך, איפה כדאי לעזור, ובאילו שעות את עובדת.</p>
                  ) : (
                    <ul className="asst__learn">
                      {profile.learned.length > 0 && <li>✅ כבר ברור לך: {profile.learned.map((t) => TOPIC_LABEL[t] ?? t).join(', ')}. על זה לא אציק לך בטיפים.</li>}
                      {profile.struggling.map((t) => (
                        <li key={t}>🔁 כדאי לחזור על: {TOPIC_LABEL[t] ?? t} <button type="button" className="cbtn cbtn--sm" onClick={() => tour(t)}>תראי לי</button></li>
                      ))}
                      {profile.medianHour != null && <li>🕙 את עובדת בדרך כלל סביב {hourText(profile.medianHour)}, אז תזכורות יגיעו בסביבות השעה הזו.</li>}
                      {profile.shortcuts.length > 0 && <li>⭐ המסכים שאת פותחת הכי הרבה: {profile.shortcuts.map((s) => SCREEN_LABEL[s] ?? s).join(', ')}.</li>}
                      {profile.counts.toursDone > 0 && <li>🎓 סיימת {profile.counts.toursDone} מדריכים.</li>}
                    </ul>
                  )}
                </section>

                <p className="muted asst__count">יש לי תשובות ל-{FAQ.length} שאלות נפוצות.</p>
              </>
            )}
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
