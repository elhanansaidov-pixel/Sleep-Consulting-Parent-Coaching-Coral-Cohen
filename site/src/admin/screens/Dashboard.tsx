import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PageHead, money } from '../lib/ui';
import { PushNudge } from './Automations';

/* ── period handling ───────────────────────────────────────── */
type RangeId = '30d' | '90d' | '12m' | 'ytd';
const RANGES: { id: RangeId; label: string }[] = [
  { id: '30d', label: '30 ימים' }, { id: '90d', label: '90 ימים' }, { id: '12m', label: '12 חודשים' }, { id: 'ytd', label: 'מתחילת השנה' },
];
function period(id: RangeId) {
  const end = new Date();
  const start = new Date(end);
  if (id === '30d') start.setDate(end.getDate() - 30);
  if (id === '90d') start.setDate(end.getDate() - 90);
  if (id === '12m') start.setMonth(end.getMonth() - 12);
  if (id === 'ytd') { start.setMonth(0, 1); start.setHours(0, 0, 0, 0); }
  const len = end.getTime() - start.getTime();
  return { start, end, prevStart: new Date(start.getTime() - len), prevEnd: start, monthly: id === '12m' || id === 'ytd' };
}

type Lead = { created_at: string; first_contact_at: string | null; client_id: string | null };
type Deal = { amount: number | null; paid_amount: number; closed_at: string | null; stage_id: string | null; created_at: string };
type Stage = { id: string; kind: 'open' | 'won' | 'lost' };

/* ── small helpers ─────────────────────────────────────────── */
const inRange = (iso: string | null, a: Date, b: Date) => !!iso && new Date(iso) >= a && new Date(iso) < b;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
function avgHours(leads: Lead[]) {
  const xs = leads.filter((l) => l.first_contact_at).map((l) => (new Date(l.first_contact_at!).getTime() - new Date(l.created_at).getTime()) / 3_600_000);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
const fmtHours = (h: number | null) => (h == null ? '—' : h < 1 ? `${Math.round(h * 60)} דק׳` : h < 48 ? `${h.toFixed(h < 10 ? 1 : 0)} שע׳` : `${(h / 24).toFixed(1)} ימים`);

function buckets(start: Date, end: Date, monthly: boolean) {
  const out: { key: string; label: string; from: Date; to: Date }[] = [];
  const d = new Date(start);
  if (monthly) {
    d.setDate(1); d.setHours(0, 0, 0, 0);
    while (d < end) {
      const to = new Date(d); to.setMonth(d.getMonth() + 1);
      out.push({ key: d.toISOString(), label: d.toLocaleDateString('he-IL', { month: 'short', year: '2-digit' }), from: new Date(d), to });
      d.setMonth(d.getMonth() + 1);
    }
  } else {
    d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); // weeks start on Sunday
    while (d < end) {
      const to = new Date(d); to.setDate(d.getDate() + 7);
      out.push({ key: d.toISOString(), label: d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }), from: new Date(d), to });
      d.setDate(d.getDate() + 7);
    }
  }
  return out;
}

/* ── KPI tile with period comparison ───────────────────────── */
function Kpi({ label, value, delta, deltaKind = 'up-good', note, alert }: { label: string; value: string; delta?: number | null; deltaKind?: 'up-good' | 'down-good'; note?: string; alert?: boolean }) {
  let d = null;
  if (delta != null && Number.isFinite(delta)) {
    const good = delta === 0 ? null : (delta > 0) === (deltaKind === 'up-good');
    const sign = delta > 0 ? '▲' : delta < 0 ? '▼' : '•';
    d = <span className={`kpi__delta${good === null ? '' : good ? ' kpi__delta--good' : ' kpi__delta--bad'}`}>{sign} {Math.abs(Math.round(delta))}% מהתקופה הקודמת</span>;
  }
  return (
    <div className="tile kpi">
      <p className="tile__label">{label}</p>
      <p className="tile__value">{value}</p>
      {d ?? (note && <span className={`kpi__delta${alert ? ' kpi__delta--bad' : ''}`}>{note}</span>)}
    </div>
  );
}
const change = (now: number, prev: number) => (prev ? ((now - prev) / prev) * 100 : null);

/* ── column chart (single series, inline SVG) ──────────────── */
function Columns({ title, data, format, empty }: { title: string; data: { label: string; value: number }[]; format: (n: number) => string; empty: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const W = 640, H = 220, padL = 44, padB = 26, padT = 18;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const band = (W - padL) / Math.max(1, data.length);
  const bw = Math.min(24, band * 0.6);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top);
  const total = data.reduce((a, d) => a + d.value, 0);
  const labelEvery = Math.ceil(data.length / 8);

  return (
    <section className="card chart" aria-labelledby={`ch-${title}`}>
      <div className="card__row">
        <h2 id={`ch-${title}`} className="card__title">{title}</h2>
        <button className="cbtn cbtn--ghost cbtn--sm" onClick={() => setTable(!table)} aria-pressed={table}>{table ? 'תצוגת גרף' : 'תצוגת טבלה'}</button>
      </div>
      {total === 0 ? <p className="chart__empty">{empty}</p> : table ? (
        <table className="table table--compact">
          <thead><tr><th scope="col">תקופה</th><th scope="col">ערך</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td>{format(d.value)}</td></tr>)}</tbody>
        </table>
      ) : (
        <div className="chart__wrap" dir="ltr">
          <svg viewBox={`0 0 ${W} ${H}`}  role="group" aria-label={`${title}: גרף עמודות. לפירוט מלא עברו לתצוגת טבלה.`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="chart__grid" />
                <text x={padL - 8} y={y(t)} className="chart__tick" textAnchor="end" dominantBaseline="middle">{compact(t)}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = padL + band * i + band / 2;
              const h = H - padB - y(d.value);
              return (
                <g key={d.label}>
                  {d.value > 0 && <path d={roundTop(cx - bw / 2, y(d.value), bw, h, Math.min(4, h))} className={`chart__bar${hover === i ? ' chart__bar--hover' : ''}`} />}
                  {i % labelEvery === 0 && <text x={cx} y={H - 8} className="chart__tick" textAnchor="middle">{d.label}</text>}
                  <rect x={padL + band * i} y={padT} width={band} height={H - padT - padB} fill="transparent"
                    role="img" tabIndex={0} aria-label={`${d.label}: ${format(d.value)}`}
                    onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <div className="chart__tip" dir="rtl" style={{ left: `${((padL + band * hover + band / 2) / W) * 100}%` }} role="status">
              <span>{data[hover].label}</span><b>{format(data[hover].value)}</b>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
function niceStep(max: number) {
  const raw = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p);
}
const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}K` : n.toLocaleString('he-IL'));
function roundTop(x: number, y: number, w: number, h: number, r: number) {
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/* ── funnel (horizontal bars, labels + values in text ink) ─── */
function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(1, steps[0]?.value ?? 0);
  return (
    <section className="card" aria-labelledby="fn-h">
      <h2 id="fn-h" className="card__title">משפך המרה בתקופה</h2>
      {!steps[0]?.value ? <p className="chart__empty">אין עדיין פניות בתקופה הזו.</p> : (
        <ol className="funnel">
          {steps.map((s, i) => (
            <li key={s.label}>
              <span className="funnel__label">{s.label}</span>
              <span className="funnel__track" aria-hidden="true"><span className="funnel__bar" style={{ width: `${(s.value / max) * 100}%` }} /></span>
              <span className="funnel__val">{s.value}{i > 0 && <span className="muted"> · {pct(s.value, steps[0].value)}%</span>}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ── screen ─────────────────────────────────────────────────── */
export function DashboardScreen() {
  const [range, setRange] = useState<RangeId>('90d');
  const [raw, setRaw] = useState<{ leads: Lead[]; deals: Deal[]; stages: Stage[]; overdue: number; active: number } | null>(null);
  const [err, setErr] = useState(false);
  const p = useMemo(() => period(range), [range]);

  useEffect(() => {
    (async () => {
      setErr(false);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [l, d, s, o, a] = await Promise.all([
        supabase.from('leads').select('created_at,first_contact_at,client_id').gte('created_at', p.prevStart.toISOString()).limit(5000),
        supabase.from('deals').select('amount,paid_amount,closed_at,stage_id,created_at').limit(5000),
        supabase.from('pipeline_stages').select('id,kind'),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'open').lt('due_at', today.toISOString()),
        supabase.from('programs').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      ]);
      if (l.error || d.error || s.error || o.error || a.error) return setErr(true);
      setRaw({ leads: (l.data as Lead[]) ?? [], deals: (d.data as Deal[]) ?? [], stages: (s.data as Stage[]) ?? [], overdue: o.count ?? 0, active: a.count ?? 0 });
    })();
  }, [p]);

  const m = useMemo(() => {
    if (!raw) return null;
    const kind = (id: string | null) => raw.stages.find((s) => s.id === id)?.kind;
    const cur = raw.leads.filter((x) => inRange(x.created_at, p.start, p.end));
    const prev = raw.leads.filter((x) => inRange(x.created_at, p.prevStart, p.prevEnd));
    const conv = cur.filter((x) => x.client_id).length;
    const convPrev = prev.filter((x) => x.client_id).length;
    const won = raw.deals.filter((d) => kind(d.stage_id) === 'won');
    const paidIn = (a: Date, b: Date) => won.filter((d) => inRange(d.closed_at, a, b)).reduce((s, d) => s + (d.paid_amount ?? 0), 0);
    const forecast = raw.deals.filter((d) => kind(d.stage_id) === 'open').reduce((s, d) => s + (d.amount ?? 0), 0);
    const bk = buckets(p.start, p.end, p.monthly);
    return {
      leads: cur.length, leadsDelta: change(cur.length, prev.length),
      convRate: pct(conv, cur.length), convDeltaPts: cur.length && prev.length ? (pct(conv, cur.length)! - pct(convPrev, prev.length)!) : null,
      resp: avgHours(cur), respPrev: avgHours(prev),
      paid: paidIn(p.start, p.end), paidDelta: change(paidIn(p.start, p.end), paidIn(p.prevStart, p.prevEnd)),
      forecast,
      leadsSeries: bk.map((b) => ({ label: b.label, value: cur.filter((x) => inRange(x.created_at, b.from, b.to)).length })),
      revenueSeries: bk.map((b) => ({ label: b.label, value: won.filter((d) => inRange(d.closed_at, b.from, b.to)).reduce((s, d) => s + (d.paid_amount ?? 0), 0) })),
      funnel: [
        { label: 'פניות שהתקבלו', value: cur.length },
        { label: 'נוצר קשר', value: cur.filter((x) => x.first_contact_at).length },
        { label: 'הפכו למשפחה', value: conv },
      ],
    };
  }, [raw, p]);

  return (
    <>
      <PageHead title="לוח בקרה" lead="כל המספרים מחושבים מהנתונים במערכת. ההשוואה היא לתקופה באורך זהה שלפניה." />
      <PushNudge />
      <div className="segmented" role="group" aria-label="טווח תאריכים">
        {RANGES.map((r) => <button key={r.id} className="segmented__btn" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>)}
      </div>
      {err && <p className="field__err" role="alert">לא הצלחנו לטעון נתונים.</p>}
      {!m ? <p className="muted">טוען…</p> : (
        <>
          <div className="tiles tiles--kpi">
            <Kpi label="פניות חדשות" value={String(m.leads)} delta={m.leadsDelta} />
            <Kpi label="שיעור המרה למשפחה" value={m.convRate == null ? '—' : `${m.convRate}%`} note={m.convDeltaPts == null ? undefined : `${m.convDeltaPts >= 0 ? '+' : ''}${m.convDeltaPts} נק׳ מהתקופה הקודמת`} />
            <Kpi label="זמן תגובה ממוצע" value={fmtHours(m.resp)} delta={m.resp != null && m.respPrev ? change(m.resp, m.respPrev) : null} deltaKind="down-good" note="מפנייה ועד יצירת קשר" />
            <Kpi label="הכנסות בפועל" value={money(m.paid)} delta={m.paidDelta} note="שולם בעסקאות שנסגרו בתקופה" />
            <Kpi label="תחזית (עסקאות פתוחות)" value={money(m.forecast)} note="לא כולל בהכנסות בפועל" />
            <Kpi label="תהליכים פעילים" value={String(raw!.active)} note={raw!.overdue ? `${raw!.overdue} משימות באיחור` : 'אין משימות באיחור'} alert={raw!.overdue > 0} />
          </div>
          <div className="charts">
            <Columns title={p.monthly ? 'פניות לפי חודש' : 'פניות לפי שבוע'} data={m.leadsSeries} format={(n) => `${n} פניות`} empty="אין עדיין פניות בתקופה הזו. כשיגיעו פניות מהשאלון, הן יופיעו כאן." />
            <Columns title={p.monthly ? "הכנסות בפועל לפי חודש סגירה" : "הכנסות בפועל לפי שבוע סגירה"} data={m.revenueSeries} format={(n) => money(n)} empty="אין עדיין עסקאות שנסגרו בתשלום בתקופה הזו." />
          </div>
          <Funnel steps={m.funnel} />
        </>
      )}
    </>
  );
}
