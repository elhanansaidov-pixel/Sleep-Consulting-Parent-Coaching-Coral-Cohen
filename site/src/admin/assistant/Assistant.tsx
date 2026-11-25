import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { FAQ, type Faq } from './faq';
import { search } from './search';
import { TOURS } from './tours';
import { TourHost, startTour } from './Tour';
import { localUsage, setUsageEnabled, track } from './usage';

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
const dayTip = () => DAILY[Math.floor(Date.now() / 86_400_000) % DAILY.length];

function topScreens(): string[] {
  const counts: Record<string, number> = {};
  for (const r of localUsage()) if (r.kind === 'screen' && SCREEN_LABEL[r.detail]) counts[r.detail] = (counts[r.detail] ?? 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k]) => k).filter((k) => k !== 'help');
  return (top.length >= 3 ? top : [...top, 'leads', 'tasks', 'programs'].filter((k, i, a) => a.indexOf(k) === i)).slice(0, 3);
}

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
  const fab = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUsageEnabled(true);
    try { if (!localStorage.getItem(WELCOMED)) setWelcome(true); } catch { /* ignore */ }
  }, []);
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

  const tip = dayTip();
  const learned = localUsage().filter((r) => r.kind === 'tour' && r.detail.endsWith(':done')).length;

  return createPortal(
    <>
      <TourHost />
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
                  <p>{tip.text}</p>
                  {tip.tour && <button type="button" className="cbtn cbtn--sm" onClick={() => tour(tip.tour!)}>תראי לי</button>}
                </section>

                <section aria-labelledby="asst-sc-h">
                  <h3 id="asst-sc-h">הקיצורים שלך</h3>
                  <div className="asst__chips">
                    {topScreens().map((s) => <a key={s} className="chip" href={`#/${s}`} onClick={close}>{SCREEN_LABEL[s]}</a>)}
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
                  <p className="muted">
                    {learned ? `סיימת ${learned} מדריכים. ` : ''}
                    אני עדיין לומדת איך את עובדת. עם הזמן אדע מה כבר ברור לך, איפה כדאי לעזור, ובאילו שעות את עובדת.
                  </p>
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
