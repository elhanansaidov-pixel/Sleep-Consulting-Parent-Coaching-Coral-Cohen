import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase, type Role } from '../lib/supabase';
import { Empty, PageHead, PROGRAM_STATUS, SERVICE, Timeline, fmt, fmtDate, fromLocalInput, logActivity, toLocalInput, useFlash } from '../lib/ui';

type Program = {
  id: string; client_id: string; service: 'sleep' | 'parenting'; status: keyof typeof PROGRAM_STATUS; start_date: string;
  current_week: number | null; current_stage: number | null; next_session_at: string | null; clients: { parent_names: string } | null;
};
type Session = { id: string; held_at: string; kind: 'intro' | 'weekly' | 'parenting'; summary: string | null };
const SESSION_KIND = { intro: 'מפגש היכרות', weekly: 'שיחה שבועית', parenting: 'מפגש הדרכה' } as const;

function Progress({ p }: { p: Program }) {
  if (p.service !== 'sleep') return <span className="muted">הדרכת הורים · מפגשים שבועיים</span>;
  const w = p.current_week ?? 0;
  return (
    <span className="prog" aria-label={`שבוע ${w} מתוך 8, שלב ${p.current_stage ?? '—'} מתוך 4`}>
      <span className="prog__bar" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} className={i < w ? 'on' : ''} />)}</span>
      <span className="muted">שבוע {w || '—'}/8 · שלב {p.current_stage ?? '—'}/4</span>
    </span>
  );
}

export function ProgramsScreen() {
  const [rows, setRows] = useState<Program[] | null>(null);
  const [status, setStatus] = useState<'active' | 'all'>('active');
  useEffect(() => {
    let q = supabase.from('programs').select('*, clients(parent_names)').order('next_session_at', { ascending: true, nullsFirst: false }).limit(300);
    if (status === 'active') q = q.eq('status', 'active');
    q.then(({ data }) => setRows((data as Program[]) ?? []));
  }, [status]);
  return (
    <>
      <PageHead title="תהליכים" lead="ליווי פעיל: ייעוץ שינה (8 שבועות, 4 שלבים) והדרכת הורים.">
        <button className="cbtn" onClick={() => setStatus(status === 'active' ? 'all' : 'active')}>{status === 'active' ? 'הצגת כל התהליכים' : 'רק פעילים'}</button>
      </PageHead>
      {!rows ? <p className="muted">טוען…</p> : rows.length === 0 ? (
        <Empty title="אין תהליכים פעילים" text="תהליך נפתח מכרטיס המשפחה." />
      ) : (
        <ul className="cards cards--always">
          {rows.map((p) => (
            <li key={p.id}>
              <a className="lcard" data-help="program-row" href={`#/programs/${p.id}`}>
                <span className="lcard__top"><b>{p.clients?.parent_names}</b><span className="chip">{SERVICE[p.service]}</span></span>
                <Progress p={p} />
                <span className="muted">{PROGRAM_STATUS[p.status]}{p.next_session_at ? ` · שיחה הבאה: ${fmt(p.next_session_at)}` : ''}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function ProgramDetailScreen({ id, role }: { id: string; role: Role }) {
  const owner = role === 'owner';
  const [p, setP] = useState<Program | null | undefined>(undefined);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [form, setForm] = useState({ held_at: toLocalInput(new Date().toISOString()), kind: 'weekly' as Session['kind'], summary: '' });
  const [tl, setTl] = useState(0);
  const { flash, node } = useFlash();

  const load = useCallback(async () => {
    const [{ data }, { data: s }] = await Promise.all([
      supabase.from('programs').select('*, clients(parent_names)').eq('id', id).maybeSingle(),
      supabase.from('sessions').select('id,held_at,kind,summary').eq('program_id', id).order('held_at', { ascending: false }),
    ]);
    setP((data as Program) ?? null);
    setSessions((s as Session[]) ?? []);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function update(patch: Partial<Program>, note?: string) {
    const { error } = await supabase.from('programs').update(patch).eq('id', id);
    if (error) return flash('השמירה נכשלה');
    if (note) { await logActivity('program', id, 'update', note); setTl(tl + 1); }
    flash('נשמר');
    load();
  }

  async function addSession(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('sessions').insert({ program_id: id, held_at: fromLocalInput(form.held_at), kind: form.kind, summary: form.summary.trim() || null });
    if (error) return flash('השמירה נכשלה');
    setForm({ ...form, summary: '' });
    flash('המפגש נשמר');
    load();
  }

  if (p === undefined) return <p className="muted">טוען…</p>;
  if (p === null) return <Empty title="התהליך לא נמצא" />;
  const sleep = p.service === 'sleep';

  return (
    <>
      <a className="back" href="#/programs">→ כל התהליכים</a>
      <PageHead title={`${SERVICE[p.service]} · ${p.clients?.parent_names ?? ''}`} lead={`התחיל ${fmtDate(p.start_date)} · ${PROGRAM_STATUS[p.status]}`}>
        <a className="cbtn" href={`#/clients/${p.client_id}`}>לכרטיס המשפחה</a>
      </PageHead>
      {node}
      <div className="detail">
        <div className="side-col">
          <section className="card" aria-labelledby="st-h">
            <h2 id="st-h" className="card__title">מצב התהליך</h2>
            <Progress p={p} />
            <fieldset className="plain" disabled={!owner}>
              {sleep && (
                <div className="grid2">
                  <div className="field"><label htmlFor="pg-w">שבוע (1–8)</label>
                    <select id="pg-w" data-help="program-week" className="input" value={p.current_week ?? 1} onChange={(e) => update({ current_week: Number(e.target.value) }, `עבר לשבוע ${e.target.value}`)}>{Array.from({ length: 8 }, (_, i) => <option key={i} value={i + 1}>שבוע {i + 1}</option>)}</select></div>
                  <div className="field"><label htmlFor="pg-s">שלב בתוכנית (1–4)</label>
                    <select id="pg-s" data-help="program-stage" className="input" value={p.current_stage ?? 1} onChange={(e) => update({ current_stage: Number(e.target.value) }, `עבר לשלב ${e.target.value} בתוכנית`)}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>שלב {n}</option>)}</select></div>
                </div>
              )}
              <div className="grid2">
                <div className="field"><label htmlFor="pg-n">{sleep ? 'השיחה השבועית הבאה' : 'המפגש הבא'}</label>
                  <input id="pg-n" data-help="program-next" className="input" type="datetime-local" value={toLocalInput(p.next_session_at)} onChange={(e) => update({ next_session_at: fromLocalInput(e.target.value) })} /></div>
                <div className="field"><label htmlFor="pg-st">סטטוס</label>
                  <select id="pg-st" className="input" value={p.status} onChange={(e) => update({ status: e.target.value as Program['status'] }, `סטטוס התהליך: ${PROGRAM_STATUS[e.target.value as Program['status']]}`)}>{Object.entries(PROGRAM_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              </div>
            </fieldset>
          </section>

          <section className="card" aria-labelledby="ss-h">
            <h2 id="ss-h" className="card__title">{sleep ? 'שיחות ומפגשים' : 'מפגשי הדרכה'}</h2>
            {owner && (
              <form className="session-form" data-help="program-session" onSubmit={addSession}>
                <div className="grid2">
                  <div className="field"><label htmlFor="ss-d">מתי</label><input id="ss-d" className="input" type="datetime-local" value={form.held_at} onChange={(e) => setForm({ ...form, held_at: e.target.value })} /></div>
                  <div className="field"><label htmlFor="ss-k">סוג</label><select id="ss-k" className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Session['kind'] })}>{Object.entries(SESSION_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                </div>
                <div className="field"><label htmlFor="ss-s">סיכום</label><textarea id="ss-s" className="input" rows={4} maxLength={10000} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></div>
                <button className="cbtn cbtn--primary">שמירת מפגש</button>
              </form>
            )}
            {sessions.length === 0 ? <p className="muted">עדיין לא נרשמו מפגשים.</p> : (
              <ol className="timeline-list">
                {sessions.map((s) => (<li key={s.id}><span className="muted">{fmt(s.held_at)} · {SESSION_KIND[s.kind]}</span><p>{s.summary || '—'}</p></li>))}
              </ol>
            )}
          </section>
        </div>
        <aside className="side-col">
          <Timeline entity="program" id={id} canWrite={owner} refreshKey={tl} />
        </aside>
      </div>
    </>
  );
}
