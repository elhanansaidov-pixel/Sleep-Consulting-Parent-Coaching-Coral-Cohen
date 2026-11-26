import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase, type Role } from '../lib/supabase';
import { Empty, Modal, PageHead, PAYMENT, PROGRAM_STATUS, SERVICE, StageChip, Timeline, fmtDate, logActivity, money, useFlash, useStages } from '../lib/ui';
import { TaskPanel } from './Tasks';

type Client = { id: string; parent_names: string; phone: string | null; phone_normalized: string | null; email: string | null; tags: string[]; notes: string | null; created_at: string; created_from_lead_id: string | null };
type Deal = { id: string; title: string | null; service: 'sleep' | 'parenting'; amount: number | null; stage_id: string | null; payment_status: keyof typeof PAYMENT; paid_amount: number };
type Program = { id: string; service: 'sleep' | 'parenting'; status: keyof typeof PROGRAM_STATUS; current_week: number | null; current_stage: number | null; start_date: string; next_session_at: string | null };

const normPhone = (raw: string) => { let d = raw.replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); if (d.startsWith('0')) d = '972' + d.slice(1); return d; };

export function ClientsScreen() {
  const [rows, setRows] = useState<(Client & { programs: { status: string }[] })[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(async () => {
      let query = supabase.from('clients').select('*, programs(status)').order('created_at', { ascending: false }).limit(200);
      const term = q.trim().replace(/[%,()]/g, '');
      if (term) query = query.ilike('parent_names', `%${term}%`);
      const { data } = await query;
      setRows((data as any) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <>
      <PageHead title="משפחות" lead="משפחות שעברו מפנייה לתהליך." />
      <div className="toolbar">
        <label className="sr-only" htmlFor="c-q">חיפוש</label>
        <input id="c-q" className="input" type="search" placeholder="חיפוש לפי שם" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!rows ? <p className="muted">טוען…</p> : rows.length === 0 ? (
        <Empty title={q ? 'לא נמצאו משפחות' : 'עדיין אין משפחות'} text={q ? undefined : 'משפחה נוצרת מתוך כרטיס פנייה, בכפתור "הפיכה למשפחה".'} />
      ) : (
        <ul className="cards cards--always">
          {rows.map((c) => {
            const active = c.programs?.some((p) => p.status === 'active');
            return (
              <li key={c.id}>
                <a className="lcard" data-help="client-row" href={`#/clients/${c.id}`}>
                  <span className="lcard__top"><b>{c.parent_names}</b>{active && <span className="chip chip--won">בתהליך פעיל</span>}</span>
                  <span className="muted">{c.tags?.length ? c.tags.join(' · ') + ' · ' : ''}מאז {fmtDate(c.created_at)}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function EditClient({ c, onSaved }: { c: Client; onSaved: () => void }) {
  const [f, setF] = useState({ parent_names: c.parent_names, phone: c.phone ?? '', email: c.email ?? '', tags: (c.tags ?? []).join(', '), notes: c.notes ?? '' });
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f.parent_names.trim()) return setErr('שם המשפחה חובה');
    const tags = f.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 20);
    const { error } = await supabase.from('clients').update({
      parent_names: f.parent_names.trim(), phone: f.phone.trim() || null, phone_normalized: f.phone.trim() ? normPhone(f.phone) : null,
      email: f.email.trim() || null, tags, notes: f.notes.trim() || null,
    }).eq('id', c.id);
    if (error) return setErr('השמירה נכשלה');
    onSaved();
  }
  return (
    <form onSubmit={save} noValidate>
      <div className="field"><label htmlFor="ec-n">שם ההורה/ההורים</label><input id="ec-n" className="input" maxLength={200} value={f.parent_names} onChange={(e) => setF({ ...f, parent_names: e.target.value })} /></div>
      <div className="grid2">
        <div className="field"><label htmlFor="ec-p">טלפון</label><input id="ec-p" className="input" dir="ltr" maxLength={30} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div className="field"><label htmlFor="ec-e">מייל</label><input id="ec-e" className="input" dir="ltr" type="email" maxLength={200} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      </div>
      <div className="field"><label htmlFor="ec-t">תגיות (מופרדות בפסיק)</label><input id="ec-t" className="input" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></div>
      <div className="field"><label htmlFor="ec-x">הערות קבועות</label><textarea id="ec-x" className="input" rows={4} maxLength={10000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      {err && <p className="field__err" role="alert">{err}</p>}
      <button className="cbtn cbtn--primary">שמירה</button>
    </form>
  );
}

function NewDeal({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const { stages } = useStages();
  const [f, setF] = useState({ service: 'sleep' as Deal['service'], amount: '', stage_id: '' });
  async function save(e: FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase.from('deals').insert({
      client_id: clientId, service: f.service, title: SERVICE[f.service], amount: f.amount ? Number(f.amount) : null,
      stage_id: f.stage_id || stages.find((s) => s.kind === 'open')?.id,
    }).select('id').single();
    if (!error && data) { await logActivity('client', clientId, 'deal', `נפתחה עסקה: ${SERVICE[f.service]}`); onDone(); }
  }
  return (
    <form onSubmit={save}>
      <div className="grid2">
        <div className="field"><label htmlFor="nd-s">שירות</label><select id="nd-s" className="input" value={f.service} onChange={(e) => setF({ ...f, service: e.target.value as Deal['service'] })}>{Object.entries(SERVICE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="nd-a">סכום (₪)</label><input id="nd-a" className="input" type="number" min="0" step="1" dir="ltr" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
      </div>
      <div className="field"><label htmlFor="nd-st">שלב</label><select id="nd-st" className="input" value={f.stage_id} onChange={(e) => setF({ ...f, stage_id: e.target.value })}><option value="">השלב הראשון</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <button className="cbtn cbtn--primary">פתיחת עסקה</button>
    </form>
  );
}

export function ClientDetailScreen({ id, role }: { id: string; role: Role }) {
  const owner = role === 'owner';
  const { stages } = useStages();
  const [c, setC] = useState<Client | null | undefined>(undefined);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [modal, setModal] = useState<'' | 'edit' | 'deal'>('');
  const [tl, setTl] = useState(0);
  const { flash, node } = useFlash();

  const load = useCallback(async () => {
    const [{ data: cl }, { data: d }, { data: p }] = await Promise.all([
      supabase.from('clients').select('*').eq('id', id).maybeSingle(),
      supabase.from('deals').select('id,title,service,amount,stage_id,payment_status,paid_amount').eq('client_id', id).order('created_at', { ascending: false }),
      supabase.from('programs').select('id,service,status,current_week,current_stage,start_date,next_session_at').eq('client_id', id).order('created_at', { ascending: false }),
    ]);
    setC((cl as Client) ?? null);
    setDeals((d as Deal[]) ?? []);
    setPrograms((p as Program[]) ?? []);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function startProgram(service: Program['service'], dealId?: string) {
    const { data, error } = await supabase.from('programs').insert({
      client_id: id, deal_id: dealId ?? null, service, current_week: service === 'sleep' ? 1 : null, current_stage: service === 'sleep' ? 1 : null,
    }).select('id').single();
    if (error || !data) return flash('הפתיחה נכשלה');
    await logActivity('client', id, 'program', `נפתח תהליך: ${SERVICE[service]}`);
    window.location.hash = `#/programs/${data.id}`;
  }

  async function remove() {
    if (!c) return;
    const typed = prompt(`מחיקה לצמיתות של המשפחה, העסקאות, התהליכים והמשימות שלה.\nכדי לאשר, הקלידו את השם: ${c.parent_names}`);
    if (typed?.trim() !== c.parent_names.trim()) return;
    const { error } = await supabase.from('clients').delete().eq('id', c.id);
    if (error) return flash('המחיקה נכשלה');
    window.location.hash = '#/clients';
  }

  if (c === undefined) return <p className="muted">טוען…</p>;
  if (c === null) return <Empty title="המשפחה לא נמצאה" />;
  const stageById = Object.fromEntries(stages.map((s) => [s.id, s]));

  return (
    <>
      <a className="back" href="#/clients">→ כל המשפחות</a>
      <PageHead title={c.parent_names} lead={`${c.tags?.length ? c.tags.join(' · ') + ' · ' : ''}מאז ${fmtDate(c.created_at)}`}>
        {c.phone_normalized && <a className="cbtn cbtn--primary" href={`https://wa.me/${c.phone_normalized}`} target="_blank" rel="noopener noreferrer">וואטסאפ</a>}
        {c.phone && <a className="cbtn" href={`tel:${c.phone}`}>חיוג</a>}
        {owner && <button className="cbtn" data-help="client-edit" onClick={() => setModal('edit')}>עריכה</button>}
      </PageHead>
      {node}
      {c.created_from_lead_id && <p className="muted">נוצרה מ<a href={`#/leads/${c.created_from_lead_id}`}>פנייה בשאלון</a>.</p>}

      <div className="detail">
        <div className="side-col">
          <section className="card" aria-labelledby="pr-h">
            <div className="card__row"><h2 id="pr-h" className="card__title">תהליכים</h2>
              {owner && <span className="actions"><button className="cbtn cbtn--sm" data-help="client-program-sleep" onClick={() => startProgram('sleep')}>+ ייעוץ שינה</button><button className="cbtn cbtn--sm" onClick={() => startProgram('parenting')}>+ הדרכת הורים</button></span>}
            </div>
            {programs.length === 0 ? <p className="muted">אין תהליכים.</p> : (
              <ul className="mini-list">{programs.map((p) => (
                <li key={p.id}><a href={`#/programs/${p.id}`}><b>{SERVICE[p.service]}</b></a>
                  <span className="muted">{PROGRAM_STATUS[p.status]}{p.service === 'sleep' ? ` · שבוע ${p.current_week ?? '—'}/8 · שלב ${p.current_stage ?? '—'}/4` : ''}{p.next_session_at ? ` · הבא: ${fmtDate(p.next_session_at)}` : ''}</span></li>
              ))}</ul>
            )}
          </section>
          <section className="card" aria-labelledby="dl-h">
            <div className="card__row"><h2 id="dl-h" className="card__title">עסקאות</h2>{owner && <button className="cbtn cbtn--sm" data-help="client-deal-add" onClick={() => setModal('deal')}>+ עסקה</button>}</div>
            {deals.length === 0 ? <p className="muted">אין עסקאות.</p> : (
              <ul className="mini-list">{deals.map((d) => (
                <li key={d.id}><a href="#/deals"><b>{d.title ?? SERVICE[d.service]}</b></a>
                  <span className="muted">{money(d.amount)} · {PAYMENT[d.payment_status]} <StageChip stage={stageById[d.stage_id ?? '']} /></span></li>
              ))}</ul>
            )}
          </section>
          {c.notes && <section className="card"><h2 className="card__title">הערות קבועות</h2><p className="prewrap">{c.notes}</p></section>}
        </div>
        <aside className="side-col">
          <TaskPanel scope={{ client_id: id }} role={role} />
          <Timeline entity="client" id={id} canWrite={owner} refreshKey={tl} />
          {owner && <button className="cbtn cbtn--danger" data-help="client-delete" onClick={remove}>מחיקת המשפחה</button>}
        </aside>
      </div>

      <Modal open={modal === 'edit'} title="עריכת פרטי משפחה" onClose={() => setModal('')}>
        <EditClient c={c} onSaved={() => { setModal(''); flash('נשמר'); load(); setTl(tl + 1); }} />
      </Modal>
      <Modal open={modal === 'deal'} title="עסקה חדשה" onClose={() => setModal('')}>
        <NewDeal clientId={id} onDone={() => { setModal(''); load(); setTl(tl + 1); }} />
      </Modal>
    </>
  );
}
