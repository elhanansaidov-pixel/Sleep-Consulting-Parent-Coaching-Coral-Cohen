import { useEffect, useState } from 'react';
import { supabase, type Role } from '../lib/supabase';

function PageHead({ title, lead }: { title: string; lead?: string }) {
  return (
    <header className="phead">
      <h1>{title}</h1>
      {lead && <p>{lead}</p>}
    </header>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      <p className="empty__text">{text}</p>
    </div>
  );
}

export function PlaceholderScreen({ title, stage, text }: { title: string; stage: string; text: string }) {
  return (
    <>
      <PageHead title={title} />
      <Empty title={`ייבנה בשלב ${stage}`} text={text} />
    </>
  );
}

type Stage = { id: string; name: string; position: number; kind: 'open' | 'won' | 'lost' };
const KIND_LABEL = { open: 'פתוח', won: 'נסגר בהצלחה', lost: 'לא רלוונטי' } as const;

export function SettingsScreen({ role }: { role: Role }) {
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [msg, setMsg] = useState('');
  const [newName, setNewName] = useState('');
  const load = () => supabase.from('pipeline_stages').select('id,name,position,kind').order('position').then(({ data }) => setStages((data as Stage[]) ?? []));
  useEffect(() => { load(); }, []);
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 2500); };

  async function rename(s: Stage, name: string) {
    const v = name.trim();
    if (!v || v === s.name) return;
    const { error } = await supabase.from('pipeline_stages').update({ name: v }).eq('id', s.id);
    flash(error ? 'השמירה נכשלה' : 'נשמר');
    load();
  }
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('stage_name') ?? '').trim();
    const { data: fresh } = await supabase.from('pipeline_stages').select('id,name,position,kind').order('position');
    const stages = (fresh as Stage[] | null) ?? [];
    if (!name) return;
    // new open stage goes right before the first closed (won/lost) stage
    const firstClosed = stages.find((s) => s.kind !== 'open');
    const pos = firstClosed ? firstClosed.position : (stages.at(-1)?.position ?? 0) + 1;
    for (const s of [...stages].filter((x) => x.position >= pos).sort((a, b) => b.position - a.position)) {
      await supabase.from('pipeline_stages').update({ position: s.position + 1 }).eq('id', s.id);
    }
    const { error } = await supabase.from('pipeline_stages').insert({ name, position: pos, kind: 'open' });
    flash(error ? 'ההוספה נכשלה' : 'השלב נוסף');
    setNewName('');
    load();
  }
  async function remove(s: Stage) {
    const [{ count: l }, { count: d }] = await Promise.all([
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('stage_id', s.id),
      supabase.from('deals').select('id', { count: 'exact', head: true }).eq('stage_id', s.id),
    ]);
    if ((l ?? 0) + (d ?? 0) > 0) return flash('יש פניות או עסקאות בשלב הזה. העבירו אותן קודם.');
    if (!confirm(`למחוק את השלב "${s.name}"?`)) return;
    const { error } = await supabase.from('pipeline_stages').delete().eq('id', s.id);
    flash(error ? 'המחיקה נכשלה' : 'השלב נמחק');
    load();
  }

  return (
    <>
      <PageHead title="הגדרות" lead="שלבי לוח המכירות משותפים לפניות ולעסקאות." />
      <p className="toast" role="status" aria-live="polite">{msg}</p>
      <section className="card" aria-labelledby="stages-h">
        <h2 id="stages-h" className="card__title">שלבי לוח המכירות</h2>
        {!stages ? <p className="muted">טוען…</p> : (
          <ol className="stages">
            {stages.map((s) => (
              <li key={s.id}>
                <span className="stages__pos">{s.position}</span>
                <span>
                  <label className="sr-only" htmlFor={`st-${s.id}`}>שם השלב {s.position}</label>
                  <input id={`st-${s.id}`} className="input stages__input" defaultValue={s.name} maxLength={60} onBlur={(e) => rename(s, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                </span>
                <span className="stages__end">
                  <span className={`chip chip--${s.kind}`}>{KIND_LABEL[s.kind]}</span>
                  {role === 'owner' && s.kind === 'open' && <button className="cbtn cbtn--ghost cbtn--sm" onClick={() => remove(s)} aria-label={`מחיקת השלב ${s.name}`}>מחיקה</button>}
                </span>
              </li>
            ))}
          </ol>
        )}
        <form className="stage-add" onSubmit={add}>
          <label className="sr-only" htmlFor="st-new">שלב חדש</label>
          <input id="st-new" name="stage_name" className="input" placeholder="שם לשלב חדש…" maxLength={60} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="cbtn" disabled={!newName.trim()}>הוספת שלב</button>
        </form>
      </section>
    </>
  );
}
