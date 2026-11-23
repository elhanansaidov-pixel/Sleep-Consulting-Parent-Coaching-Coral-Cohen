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

type Counts = { leads: number; clients: number; programs: number; tasks: number };

export function DashboardScreen() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    (async () => {
      const q = (t: string) => supabase.from(t).select('id', { count: 'exact', head: true });
      const [l, c, p, t] = await Promise.all([q('leads'), q('clients'), q('programs'), q('tasks')]);
      if (l.error || c.error || p.error || t.error) return setErr(true);
      setCounts({ leads: l.count ?? 0, clients: c.count ?? 0, programs: p.count ?? 0, tasks: t.count ?? 0 });
    })();
  }, []);
  const tiles: [keyof Counts, string][] = [['leads', 'פניות'], ['clients', 'משפחות'], ['programs', 'תהליכים'], ['tasks', 'משימות']];
  return (
    <>
      <PageHead title="לוח בקרה" lead="נתונים אמיתיים מהמערכת. גרפים והשוואות יתווספו בשלב E." />
      {err && <p className="field__err" role="alert">לא הצלחנו לטעון נתונים.</p>}
      <div className="tiles">
        {tiles.map(([k, label]) => (
          <div className="tile" key={k}>
            <p className="tile__label">{label}</p>
            <p className="tile__value">{counts ? counts[k] : '—'}</p>
          </div>
        ))}
      </div>
    </>
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
  useEffect(() => {
    supabase.from('pipeline_stages').select('id,name,position,kind').order('position').then(({ data }) => setStages((data as Stage[]) ?? []));
  }, []);
  return (
    <>
      <PageHead title="הגדרות" lead={role === 'owner' ? 'שלבי לוח המכירות. העריכה תיפתח בשלב D.' : 'מצב תצוגה למנהל טכני.'} />
      <section className="card" aria-labelledby="stages-h">
        <h2 id="stages-h" className="card__title">שלבי לוח המכירות</h2>
        {!stages ? (
          <p className="muted">טוען…</p>
        ) : (
          <ol className="stages">
            {stages.map((s) => (
              <li key={s.id}>
                <span className="stages__pos">{s.position}</span>
                <span className="stages__name">{s.name}</span>
                <span className={`chip chip--${s.kind}`}>{KIND_LABEL[s.kind]}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
