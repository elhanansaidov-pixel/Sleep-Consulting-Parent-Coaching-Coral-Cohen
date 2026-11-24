import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase, type Role } from '../lib/supabase';
import { Empty, PageHead, PRIORITY, fmt, fromLocalInput, useFlash } from '../lib/ui';

type Task = {
  id: string; title: string; due_at: string | null; priority: 'low' | 'normal' | 'high'; status: 'open' | 'done' | 'cancelled';
  lead_id: string | null; client_id: string | null; deal_id: string | null; completed_at: string | null;
  clients?: { parent_names: string } | null; leads?: { parent_name: string } | null;
};
type Scope = { lead_id?: string; client_id?: string; deal_id?: string };

function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function bucket(t: Task): 'overdue' | 'today' | 'later' | 'none' {
  if (!t.due_at) return 'none';
  const due = new Date(t.due_at).getTime();
  const s = startOfToday().getTime();
  if (due < s) return 'overdue';
  if (due < s + 86_400_000) return 'today';
  return 'later';
}

function AddTask({ scope, onAdded }: { scope: Scope; onAdded: () => void }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('normal');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('tasks').insert({ title: title.trim(), due_at: fromLocalInput(due), priority, ...scope });
    setBusy(false);
    if (!error) { setTitle(''); setDue(''); setPriority('normal'); onAdded(); }
  }
  return (
    <form className="task-add" onSubmit={submit}>
      <label className="sr-only" htmlFor="t-title">משימה חדשה</label>
      <input id="t-title" className="input" placeholder="משימה חדשה…" maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="sr-only" htmlFor="t-due">מועד</label>
      <input id="t-due" className="input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
      <label className="sr-only" htmlFor="t-pri">עדיפות</label>
      <select id="t-pri" className="input" value={priority} onChange={(e) => setPriority(e.target.value as Task['priority'])}>
        {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>עדיפות {v}</option>)}
      </select>
      <button className="cbtn cbtn--primary" disabled={busy || !title.trim()}>הוספה</button>
    </form>
  );
}

function TaskRow({ t, canWrite, onChange, showLink }: { t: Task; canWrite: boolean; onChange: () => void; showLink: boolean }) {
  const b = bucket(t);
  async function toggle() {
    await supabase.from('tasks').update({ status: t.status === 'done' ? 'open' : 'done' }).eq('id', t.id);
    onChange();
  }
  async function remove() {
    if (!confirm(`למחוק את המשימה "${t.title}"?`)) return;
    await supabase.from('tasks').delete().eq('id', t.id);
    onChange();
  }
  const link = t.client_id ? { href: `#/clients/${t.client_id}`, label: t.clients?.parent_names } : t.lead_id ? { href: `#/leads/${t.lead_id}`, label: t.leads?.parent_name } : null;
  return (
    <li className={`task task--${t.status} task--${b}`}>
      <input type="checkbox" className="task__check" checked={t.status === 'done'} disabled={!canWrite} onChange={toggle} aria-label={`סימון "${t.title}" כבוצעה`} />
      <div className="task__body">
        <span className="task__title">{t.title}</span>
        <span className="task__meta">
          {t.due_at && <span className={b === 'overdue' && t.status === 'open' ? 'late' : ''}>{b === 'overdue' && t.status === 'open' ? 'באיחור · ' : ''}{fmt(t.due_at)}</span>}
          {t.priority === 'high' && <span className="chip chip--lost">עדיפות גבוהה</span>}
          {showLink && link?.label && <a href={link.href}>{link.label}</a>}
        </span>
      </div>
      {canWrite && <button className="cbtn cbtn--ghost cbtn--sm" onClick={remove} aria-label={`מחיקת "${t.title}"`}>מחיקה</button>}
    </li>
  );
}

/** Tasks attached to one lead / family / deal (used inside detail pages). */
export function TaskPanel({ scope, role }: { scope: Scope; role: Role }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const canWrite = role === 'owner';
  const load = useCallback(async () => {
    let q = supabase.from('tasks').select('*').order('status').order('due_at', { ascending: true, nullsFirst: false });
    for (const [k, v] of Object.entries(scope)) q = q.eq(k, v as string);
    const { data } = await q;
    setTasks((data as Task[]) ?? []);
  }, [JSON.stringify(scope)]);
  useEffect(() => { load(); }, [load]);
  return (
    <section className="card" aria-labelledby="tp-h">
      <h2 id="tp-h" className="card__title">משימות</h2>
      {canWrite && <AddTask scope={scope} onAdded={load} />}
      {tasks.length === 0 ? <p className="muted">אין משימות.</p> : (
        <ul className="tasks">{tasks.map((t) => <TaskRow key={t.id} t={t} canWrite={canWrite} onChange={load} showLink={false} />)}</ul>
      )}
    </section>
  );
}

export function TasksScreen({ role }: { role: Role }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const canWrite = role === 'owner';
  const { flash, node } = useFlash();
  const load = useCallback(async () => {
    let q = supabase.from('tasks').select('*, clients(parent_names), leads(parent_name)').order('due_at', { ascending: true, nullsFirst: false }).limit(300);
    q = showDone ? q.eq('status', 'done') : q.eq('status', 'open');
    const { data, error } = await q;
    if (error) flash('לא הצלחנו לטעון משימות');
    setTasks((data as Task[]) ?? []);
  }, [showDone]);
  useEffect(() => { load(); }, [load]);

  const groups: [string, Task[]][] = tasks ? (showDone ? [['בוצעו', tasks]] : [
    ['באיחור', tasks.filter((t) => bucket(t) === 'overdue')],
    ['היום', tasks.filter((t) => bucket(t) === 'today')],
    ['בהמשך', tasks.filter((t) => bucket(t) === 'later')],
    ['ללא מועד', tasks.filter((t) => bucket(t) === 'none')],
  ]) : [];

  return (
    <>
      <PageHead title="משימות" lead="תזכורות ומשימות. המשימות להיום ובאיחור מגיעות גם במייל הבוקר.">
        <button className="cbtn" onClick={() => setShowDone(!showDone)}>{showDone ? 'משימות פתוחות' : 'משימות שבוצעו'}</button>
      </PageHead>
      {node}
      {canWrite && !showDone && <div className="card card--flat"><AddTask scope={{}} onAdded={load} /></div>}
      {!tasks ? <p className="muted">טוען…</p> : tasks.length === 0 ? (
        <Empty title={showDone ? 'אין משימות שבוצעו' : 'אין משימות פתוחות'} text={showDone ? undefined : 'משימות שנוצרות כאן או מתוך כרטיס של משפחה או פנייה יופיעו ברשימה.'} />
      ) : groups.filter(([, l]) => l.length).map(([label, list]) => (
        <section key={label} className="task-group" aria-label={label}>
          <h2 className={`task-group__title${label === 'באיחור' ? ' late' : ''}`}>{label} <span className="muted">({list.length})</span></h2>
          <ul className="tasks">{list.map((t) => <TaskRow key={t.id} t={t} canWrite={canWrite} onChange={load} showLink />)}</ul>
        </section>
      ))}
    </>
  );
}
