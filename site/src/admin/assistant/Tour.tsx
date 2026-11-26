import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { tourById, type Tour } from './tours';
import { track } from './usage';

/* Tiny event bus so any component (assistant panel, tips) can start a tour. */
const START = 'cc-tour-start';
export const startTour = (id: string) => window.dispatchEvent(new CustomEvent(START, { detail: id }));

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};
const findTarget = (key?: string) =>
  key ? [...document.querySelectorAll(`[data-help="${key}"]`)].find(visible) as HTMLElement | undefined : undefined;

/** Spotlight + bubble. The dimming is a huge box-shadow with pointer-events:none, so the page stays clickable. */
export function TourHost() {
  const [tour, setTour] = useState<Tour | null>(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  const bubble = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement | undefined>(undefined);

  const end = useCallback((how: 'done' | 'exit') => {
    if (tour) track('tour', `${tour.id}:${how}${how === 'exit' ? `@${i + 1}` : ''}`);
    setTour(null); setI(0); setRect(null);
  }, [tour, i]);

  useEffect(() => {
    const on = (e: Event) => {
      const t = tourById((e as CustomEvent<string>).detail);
      if (!t) return;
      track('tour', `${t.id}:start`);
      setTour(t); setI(0);
    };
    window.addEventListener(START, on);
    return () => window.removeEventListener(START, on);
  }, []);

  const step = tour?.steps[i];
  // Let other parts (tips) know a tour is running.
  useEffect(() => { document.body.toggleAttribute('data-tour-active', !!tour); }, [tour]);

  // Navigate if needed, then wait up to 1.5s for the target to appear.
  useEffect(() => {
    if (!step) return;
    setRect(null); setMissing(false); targetRef.current = undefined;
    if (step.path && !window.location.hash.startsWith(step.path)) window.location.hash = step.path;
    const t0 = Date.now();
    const iv = window.setInterval(() => {
      const el = findTarget(step.target);
      if (el) {
        window.clearInterval(iv);
        targetRef.current = el;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        window.setTimeout(() => setRect(el.getBoundingClientRect()), 350);
      } else if (Date.now() - t0 > 1500) {
        window.clearInterval(iv);
        setMissing(true);
      }
    }, 100);
    return () => window.clearInterval(iv);
  }, [step]);

  // Keep the spotlight on the element while the page scrolls/resizes.
  useEffect(() => {
    if (!step || missing) return;
    const iv = window.setInterval(() => { const el = targetRef.current; if (el && el.isConnected) setRect(el.getBoundingClientRect()); }, 200);
    return () => window.clearInterval(iv);
  }, [step, missing]);

  // waitClick: advance when the highlighted element is clicked.
  useEffect(() => {
    const el = targetRef.current;
    if (!step?.waitClick || !el || !rect) return;
    const on = () => window.setTimeout(() => next(), 250);
    el.addEventListener('click', on, { once: true });
    return () => el.removeEventListener('click', on);
  });

  useLayoutEffect(() => { bubble.current?.focus(); }, [i, tour]);
  useEffect(() => {
    if (!tour) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') end('exit'); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [tour, end]);

  function next() {
    if (!tour) return;
    if (i >= tour.steps.length - 1) end('done');
    else setI((n) => n + 1);
  }

  if (!tour || !step) return null;
  const last = i === tour.steps.length - 1;
  const pad = 6;
  const spot: CSSProperties | undefined = rect && !missing ? {
    top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
  } : undefined;

  // Bubble below the target if there is room, otherwise above; centered when there is no target.
  const vw = window.innerWidth, vh = window.innerHeight;
  const bw = Math.min(340, vw - 24);
  let bstyle: CSSProperties = { width: bw, left: (vw - bw) / 2, top: vh / 2 - 90 };
  if (spot && rect) {
    const below = rect.bottom + 14;
    const top = below + 190 < vh ? below : Math.max(12, rect.top - 14 - 190);
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - bw / 2), vw - bw - 12);
    bstyle = { width: bw, left, top };
  }

  return createPortal(
    <div className="tour" aria-live="polite">
      {spot ? <div className="tour__spot" style={spot} /> : <div className="tour__dim" />}
      <div ref={bubble} className="tour__bubble" style={bstyle} role="dialog" aria-label={tour.title} tabIndex={-1}>
        <p className="tour__meta">{tour.title} · שלב {i + 1} מתוך {tour.steps.length}</p>
        <p className="tour__text">{step.text}</p>
        {missing && <p className="tour__miss">החלק הזה לא מופיע כרגע במסך. אולי עוד אין נתונים כאלה, וזה בסדר. אפשר להמשיך.</p>}
        {step.waitClick && !missing && <p className="tour__hint">לחצי על החלק המודגש כדי להמשיך.</p>}
        <div className="tour__btns">
          <button type="button" className="cbtn cbtn--ghost cbtn--sm" onClick={() => end('exit')}>יציאה</button>
          <span className="actions">
            {i > 0 && <button type="button" className="cbtn cbtn--sm" onClick={() => setI(i - 1)}>הקודם</button>}
            <button type="button" className="cbtn cbtn--primary cbtn--sm" onClick={next}>{last ? 'סיום' : 'הבא'}</button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
