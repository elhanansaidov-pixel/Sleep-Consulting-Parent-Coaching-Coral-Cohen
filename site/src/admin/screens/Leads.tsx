import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase, type Role } from '../lib/supabase';
import { steps as qSteps } from '../../data/questionnaire';

type Stage = { id: string; name: string; position: number; kind: 'open' | 'won' | 'lost' };
type Lead = {
  id: string; created_at: string; parent_name: string; phone: string; phone_normalized: string; email: string | null;
  child_age: string | null; stage_id: string | null; priority: 'low' | 'normal' | 'high';
  next_follow_up_at: string | null; duplicate_of: string | null; answers: Record<string, string>;
  consent_at: string; signed_name: string; first_contact_at: string | null;
};
type Activity = { id: string; kind: string; body: string | null; created_at: string; actor: string | null };

const PRIORITY = { high: 'גבוהה', normal: 'רגילה', low: 'נמוכה' } as const;
const PAGE = 25;
const fmt = (iso: string) => new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('he-IL', { dateStyle: 'medium' });
const waLink = (phoneNorm: string) => `https://wa.me/${phoneNorm}`;

function useStages() {
  const [stages, setStages] = useState<Stage[]>([]);
  useEffect(() => {
    supabase.from('pipeline_stages').select('id,name,position,kind').order('position').then(({ data }) => setStages((data as Stage[]) ?? []));
  }, []);
  return stages;
}

function StageChip({ stage }: { stage?: Stage }) {
  if (!stage) return <span className="chip">—</span>;
  return <span className={`chip chip--${stage.kind}`}>{stage.name}</span>;
}

/* ───────────────────────── list ───────────────────────── */

export function LeadsScreen({ role }: { role: Role }) {
  const stages = useStages();
  const [rows, setRows] = useState<Lead[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [err, setErr] = useState(false);
  const stageById = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s])), [stages]);

  const load = useCallback(async () => {
    setErr(false);
    let query = supabase.from('leads')
      .select('id,created_at,parent_name,phone,phone_normalized,email,child_age,stage_id,priority,next_follow_up_at,duplicate_of', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (stageFilter) query = query.eq('stage_id', stageFilter);
    const term = q.trim().replace(/[%,()]/g, '');
    if (term) {
      const digits = term.replace(/\D/g, '');
      query = digits.length >= 3
        ? query.or(`parent_name.ilike.%${term}%,phone_normalized.ilike.%${digits.replace(/^0/, '')}%`)
        : query.ilike('parent_name', `%${term}%`);
    }
    const { data, count, error } = await query;
    if (error) return setErr(true);
    setRows((data as Lead[]) ?? []);
    setTotal(count ?? 0);
  }, [page, q, stageFilter]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  async function exportCsv() {
    const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    if (error || !data) return alert('הייצוא נכשל.');
    const qs = qSteps.flatMap((s) => s.fields).filter((f) => !['parent_name', 'phone', 'email', 'child_age'].includes(f.id));
    const head = ['תאריך', 'שם', 'טלפון', 'מייל', 'גיל', 'שלב', 'עדיפות', ...qs.map((f) => `${f.num}. ${f.label}`), 'חתימה'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
    const lines = (data as Lead[]).map((l) => [
      fmt(l.created_at), l.parent_name, l.phone, l.email, l.child_age, stageById[l.stage_id ?? '']?.name, PRIORITY[l.priority],
      ...qs.map((f) => l.answers?.[f.id]), l.signed_name,
    ].map(esc).join(','));
    const blob = new Blob(['﻿' + [head.map(esc).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pniyot-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <>
      <header className="phead phead--row">
        <div>
          <h1>פניות</h1>
          <p>{total} פניות מהשאלון באתר</p>
        </div>
        {role === 'owner' && <button className="cbtn" onClick={exportCsv}>ייצוא ל-CSV</button>}
      </header>

      <div className="toolbar">
        <label className="sr-only" htmlFor="lead-q">חיפוש</label>
        <input id="lead-q" className="input" type="search" placeholder="חיפוש לפי שם או טלפון" value={q} onChange={(e) => { setPage(0); setQ(e.target.value); }} />
        <label className="sr-only" htmlFor="lead-stage">סינון לפי שלב</label>
        <select id="lead-stage" className="input" value={stageFilter} onChange={(e) => { setPage(0); setStageFilter(e.target.value); }}>
          <option value="">כל השלבים</option>
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {err && <p className="field__err" role="alert">לא הצלחנו לטעון את הפניות.</p>}
      {!rows ? <p className="muted">טוען…</p> : rows.length === 0 ? (
        <div className="empty"><p className="empty__title">{q || stageFilter ? 'לא נמצאו פניות' : 'עדיין אין פניות'}</p><p className="empty__text">{q || stageFilter ? 'נסו חיפוש או סינון אחר.' : 'פניות מהשאלון באתר יופיעו כאן, וקורל תקבל מייל על כל פנייה חדשה.'}</p></div>
      ) : (
        <>
          <table className="table">
            <thead><tr><th scope="col">שם</th><th scope="col">טלפון</th><th scope="col">גיל</th><th scope="col">שלב</th><th scope="col">מעקב הבא</th><th scope="col">התקבלה</th></tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td><a className="rowlink" href={`#/leads/${l.id}`}>{l.parent_name}</a>{l.duplicate_of && <span className="chip chip--warn">חוזרת</span>}{l.priority === 'high' && <span className="chip chip--lost">עדיפות גבוהה</span>}</td>
                  <td dir="ltr" className="ltr-cell">{l.phone}</td>
                  <td>{l.child_age}</td>
                  <td><StageChip stage={stageById[l.stage_id ?? '']} /></td>
                  <td>{l.next_follow_up_at ? fmtDate(l.next_follow_up_at) : '—'}</td>
                  <td className="muted">{fmt(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="cards">
            {rows.map((l) => (
              <li key={l.id}>
                <a className="lcard" href={`#/leads/${l.id}`}>
                  <span className="lcard__top"><b>{l.parent_name}</b><StageChip stage={stageById[l.stage_id ?? '']} /></span>
                  <span className="muted">גיל: {l.child_age} · {fmt(l.created_at)}</span>
                </a>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav className="pager" aria-label="עמודים">
              <button className="cbtn cbtn--sm" disabled={page === 0} onClick={() => setPage(page - 1)}>הקודם</button>
              <span>{page + 1} / {pages}</span>
              <button className="cbtn cbtn--sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>הבא</button>
            </nav>
          )}
        </>
      )}
    </>
  );
}

/* ───────────────────────── detail ───────────────────────── */

export function LeadDetailScreen({ id, role }: { id: string; role: Role }) {
  const stages = useStages();
  const [lead, setLead] = useState<Lead | null | undefined>(undefined);
  const [acts, setActs] = useState<Activity[]>([]);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const owner = role === 'owner';

  const load = useCallback(async () => {
    const { data } = await supabase.from('leads').select('*').eq('id', id).maybeSingle();
    setLead((data as Lead) ?? null);
    const { data: a } = await supabase.from('activities').select('id,kind,body,created_at,actor').eq('entity', 'lead').eq('entity_id', id).order('created_at', { ascending: false });
    setActs((a as Activity[]) ?? []);
  }, [id]);

  useEffect(() => {
    load();
    supabase.from('lead_views').insert({ lead_id: id }).then(() => {}); // audit: who opened this lead
  }, [id, load]);

  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(''), 2500); }

  async function update(patch: Partial<Lead>, activity?: { kind: string; body: string }) {
    if (!owner || !lead) return;
    const { error } = await supabase.from('leads').update(patch).eq('id', lead.id);
    if (error) return flash('השמירה נכשלה');
    if (activity) await supabase.from('activities').insert({ entity: 'lead', entity_id: lead.id, ...activity });
    flash('נשמר');
    load();
  }

  async function changeStage(stageId: string) {
    if (!lead) return;
    const s = stages.find((x) => x.id === stageId);
    const first = stages[0]?.id;
    const patch: Partial<Lead> = { stage_id: stageId };
    if (!lead.first_contact_at && lead.stage_id === first && stageId !== first) patch.first_contact_at = new Date().toISOString();
    await update(patch, { kind: 'stage_change', body: `השלב שונה ל: ${s?.name ?? ''}` });
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    const body = note.trim();
    if (!body || !lead) return;
    const { error } = await supabase.from('activities').insert({ entity: 'lead', entity_id: lead.id, kind: 'note', body });
    if (error) return flash('השמירה נכשלה');
    setNote('');
    load();
  }

  async function remove() {
    if (!lead) return;
    const typed = prompt(`מחיקה לצמיתות של הפנייה ושל כל המידע שבה.\nכדי לאשר, הקלידו את שם ההורה: ${lead.parent_name}`);
    if (typed?.trim() !== lead.parent_name.trim()) return;
    const { error } = await supabase.from('leads').delete().eq('id', lead.id);
    if (error) return flash('המחיקה נכשלה'); // notes & notifications are removed by a DB trigger
    window.location.hash = '#/leads';
  }

  if (lead === undefined) return <p className="muted">טוען…</p>;
  if (lead === null) return <div className="empty"><p className="empty__title">הפנייה לא נמצאה</p><p className="empty__text"><a href="#/leads">חזרה לרשימת הפניות</a></p></div>;

  const answerFields = qSteps.flatMap((s) => s.fields).filter((f) => !['parent_name', 'phone', 'email', 'child_age'].includes(f.id));

  return (
    <>
      <a className="back" href="#/leads">→ כל הפניות</a>
      <header className="phead phead--row">
        <div>
          <h1>{lead.parent_name}</h1>
          <p>התקבלה {fmt(lead.created_at)} · גיל הילד/ה: {lead.child_age}</p>
        </div>
        <div className="actions">
          <a className="cbtn cbtn--primary" href={waLink(lead.phone_normalized)} target="_blank" rel="noopener noreferrer">וואטסאפ</a>
          <a className="cbtn" href={`tel:${lead.phone}`}>חיוג</a>
          {lead.email && <a className="cbtn" href={`mailto:${lead.email}`}>מייל</a>}
        </div>
      </header>
      {lead.duplicate_of && <p className="notice">הורה זה כבר מילא שאלון בעבר. <a href={`#/leads/${lead.duplicate_of}`}>לפנייה הקודמת</a></p>}
      <p className="toast" role="status" aria-live="polite">{msg}</p>

      <div className="detail">
        <section className="card" aria-labelledby="ans-h">
          <h2 id="ans-h" className="card__title">תשובות לשאלון</h2>
          <dl className="answers">
            <div><dt>טלפון</dt><dd dir="ltr" className="ltr-cell">{lead.phone}</dd></div>
            {lead.email && <div><dt>דוא״ל</dt><dd dir="ltr" className="ltr-cell">{lead.email}</dd></div>}
            {answerFields.map((f) => (
              <div key={f.id}><dt>{f.num}. {f.label}</dt><dd>{lead.answers?.[f.id] || '—'}</dd></div>
            ))}
            <div><dt>הצהרה והסכמה</dt><dd>אושרה ונחתמה בשם "{lead.signed_name}" ב-{fmt(lead.consent_at)}</dd></div>
          </dl>
        </section>

        <aside className="side-col">
          <section className="card" aria-labelledby="mgmt-h">
            <h2 id="mgmt-h" className="card__title">ניהול</h2>
            <div className="field">
              <label htmlFor="ld-stage">שלב</label>
              <select id="ld-stage" className="input" disabled={!owner} value={lead.stage_id ?? ''} onChange={(e) => changeStage(e.target.value)}>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ld-pri">עדיפות</label>
              <select id="ld-pri" className="input" disabled={!owner} value={lead.priority} onChange={(e) => update({ priority: e.target.value as Lead['priority'] })}>
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ld-fu">מעקב הבא</label>
              <input id="ld-fu" className="input" type="date" disabled={!owner} value={lead.next_follow_up_at?.slice(0, 10) ?? ''} onChange={(e) => update({ next_follow_up_at: e.target.value ? new Date(e.target.value + 'T09:00:00').toISOString() : null })} />
            </div>
            {!owner && <p className="muted">מצב צפייה בלבד (מנהל טכני).</p>}
          </section>

          <section className="card" aria-labelledby="tl-h">
            <h2 id="tl-h" className="card__title">הערות ופעילות</h2>
            {owner && (
              <form onSubmit={addNote} className="note-form">
                <label className="sr-only" htmlFor="ld-note">הערה חדשה</label>
                <textarea id="ld-note" className="input" rows={3} maxLength={10000} placeholder="הערה פנימית…" value={note} onChange={(e) => setNote(e.target.value)} />
                <button className="cbtn cbtn--sm" disabled={!note.trim()}>הוספה</button>
              </form>
            )}
            <ol className="timeline-list">
              {acts.map((a) => (
                <li key={a.id}>
                  <span className="muted">{fmt(a.created_at)}</span>
                  <p>{a.body}</p>
                </li>
              ))}
            </ol>
          </section>

          {owner && <button className="cbtn cbtn--danger" onClick={remove}>מחיקת הפנייה</button>}
        </aside>
      </div>
    </>
  );
}
