import { useEffect, useState } from 'react';
import { supabase, type Role } from '../lib/supabase';
import { VAPID_PUBLIC_KEY } from '../lib/config';
import { fmt } from '../lib/ui';

/* ── device notifications (web push) ──────────────────────── */
const b64ToBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

type PushState = 'loading' | 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on';

async function saveSub(sub: PushSubscription) {
  const j = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth, user_agent: navigator.userAgent.slice(0, 300) },
    { onConflict: 'endpoint' },
  );
  if (error) throw error;
}

/** Shared push-subscription state for the settings card and the dashboard nudge. */
function usePush() {
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function detect() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return setState(isIOS() && !isStandalone() ? 'ios-install' : 'unsupported');
    }
    if (Notification.permission === 'denied') return setState('denied');
    const reg = await navigator.serviceWorker.getRegistration('/admin');
    let sub = await reg?.pushManager.getSubscription();
    // Self-heal: the browser can rotate or drop a subscription (e.g. after installing the app to the
    // home screen on Android). With permission already granted, re-subscribe silently and re-save.
    if (reg && Notification.permission === 'granted') {
      try {
        sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) });
        await saveSub(sub);
      } catch { /* keep current state; the user can toggle in settings */ }
    }
    setState(sub ? 'on' : 'off');
  }
  useEffect(() => { detect(); }, []);

  async function enable() {
    setBusy(true); setMsg('');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setBusy(false); return detect(); }
      const reg = await navigator.serviceWorker.register('/admin-sw.js', { scope: '/admin' });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) });
      await saveSub(sub);
      setMsg('ההתראות הופעלו במכשיר הזה.');
    } catch {
      setMsg('לא הצלחנו להפעיל התראות במכשיר הזה.');
    }
    setBusy(false);
    detect();
  }

  async function disable() {
    setBusy(true);
    const reg = await navigator.serviceWorker.getRegistration('/admin');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
    setBusy(false);
    setMsg('ההתראות כובו במכשיר הזה.');
    detect();
  }

  return { state, busy, msg, enable, disable };
}

export function DeviceNotifications() {
  const { state, busy, msg, enable, disable } = usePush();

  return (
    <section className="card" aria-labelledby="push-h">
      <h2 id="push-h" className="card__title">התראות במכשיר הזה</h2>
      <p className="muted">התראה קופצת על כל פנייה חדשה מהאתר, בנוסף למייל. ההתראה לא כוללת פרטים אישיים, רק קישור לפנייה.</p>
      {state === 'loading' && <p className="muted">בודקים…</p>}
      {state === 'unsupported' && <p>הדפדפן הזה לא תומך בהתראות. נסו Chrome, Edge, Firefox או Safari עדכני.</p>}
      {state === 'ios-install' && (
        <div className="howto">
          <p><b>באייפון, התראות עובדות רק מהמסך הראשי:</b></p>
          <ol>
            <li>פתחו את המערכת ב-Safari.</li>
            <li>לחצו על כפתור השיתוף (ריבוע עם חץ למעלה).</li>
            <li>בחרו "הוספה למסך הבית".</li>
            <li>פתחו את המערכת מהאייקון החדש, וחזרו למסך הזה.</li>
          </ol>
        </div>
      )}
      {state === 'denied' && <p>ההתראות נחסמו בדפדפן. כדי לאפשר אותן, פתחו את הגדרות האתר בדפדפן (סמל המנעול ליד הכתובת) ואפשרו התראות.</p>}
      {state === 'off' && <button className="cbtn cbtn--primary" onClick={enable} disabled={busy}>{busy ? 'מפעילים…' : 'הפעלת התראות'}</button>}
      {state === 'on' && <p><span className="chip chip--won">פעיל</span> <button className="cbtn cbtn--sm" onClick={disable} disabled={busy}>כיבוי במכשיר הזה</button></p>}
      <p className="toast" role="status" aria-live="polite">{msg}</p>
    </section>
  );
}

/* ── automations: switches + run log ──────────────────────── */
type Auto = { key: string; label: string; enabled: boolean };
type Run = { id: number; automation: string; status: 'ok' | 'error' | 'skipped'; attempts: number; detail: string | null; ran_at: string };
const NUDGE_KEY = 'cc-push-nudge-dismissed';
/** Gentle banner on the dashboard until this device has notifications on (or the user dismisses it). */
export function PushNudge() {
  const { state, busy, enable } = usePush();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(NUDGE_KEY) === '1'; } catch { return false; } });
  if (hidden || !['off', 'ios-install'].includes(state)) return null;
  const dismiss = () => { try { localStorage.setItem(NUDGE_KEY, '1'); } catch { /* ignore */ } setHidden(true); };
  return (
    <div className="nudge" role="region" aria-label="הפעלת התראות">
      {state === 'off' ? (
        <>
          <p><b>רוצה לקבל התראה בטלפון על כל פנייה חדשה?</b> לחיצה על הכפתור תקפיץ בקשת הרשאה מהדפדפן.</p>
          <span className="actions">
            <button className="cbtn cbtn--primary cbtn--sm" onClick={enable} disabled={busy}>{busy ? 'מפעילים…' : 'הפעלת התראות'}</button>
            <button className="cbtn cbtn--ghost cbtn--sm" onClick={dismiss}>לא עכשיו</button>
          </span>
        </>
      ) : (
        <>
          <p><b>באייפון אפשר לקבל התראות על פניות חדשות.</b> ב-Safari: כפתור השיתוף ← "הוספה למסך הבית", ואז פותחים את המערכת מהאייקון ומפעילים בהגדרות.</p>
          <span className="actions"><button className="cbtn cbtn--ghost cbtn--sm" onClick={dismiss}>הבנתי</button></span>
        </>
      )}
    </div>
  );
}

const STATUS = { ok: 'בוצע', error: 'שגיאה', skipped: 'דולג' } as const;

export function AutomationsPanel({ role }: { role: Role }) {
  const [autos, setAutos] = useState<Auto[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const load = async () => {
    const [{ data: a }, { data: r }] = await Promise.all([
      supabase.from('automations').select('key,label,enabled').order('key'),
      supabase.from('automation_runs').select('id,automation,status,attempts,detail,ran_at').order('ran_at', { ascending: false }).limit(15),
    ]);
    setAutos((a as Auto[]) ?? []);
    setRuns((r as Run[]) ?? []);
  };
  useEffect(() => { load(); }, []);
  const labelOf = (k: string) => autos.find((a) => a.key === k)?.label ?? k;

  async function toggle(a: Auto) {
    await supabase.from('automations').update({ enabled: !a.enabled }).eq('key', a.key);
    load();
  }

  return (
    <section className="card" aria-labelledby="auto-h">
      <h2 id="auto-h" className="card__title">אוטומציות</h2>
      <ul className="autos">
        {autos.map((a) => (
          <li key={a.key}>
            <label className="switch">
              <input type="checkbox" role="switch" checked={a.enabled} disabled={role !== 'owner'} onChange={() => toggle(a)} />
              <span>{a.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <h3 className="autos__sub">הפעלות אחרונות</h3>
      {runs.length === 0 ? <p className="muted">עדיין לא היו הפעלות.</p> : (
        <ul className="mini-list">
          {runs.map((r) => (
            <li key={r.id}>
              <span>{labelOf(r.automation)}</span>
              <span className="muted">{fmt(r.ran_at)} · <span className={r.status === 'error' ? 'late' : ''}>{STATUS[r.status]}</span>{r.detail ? ` · ${r.detail}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
