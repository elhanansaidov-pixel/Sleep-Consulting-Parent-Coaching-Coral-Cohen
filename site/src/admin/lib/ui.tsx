import { useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

/* ── formatting ─────────────────────────────────────────── */
export const fmt = (iso: string) => new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('he-IL', { dateStyle: 'medium' });
export const money = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
export const SERVICE = { sleep: 'ייעוץ שינה', parenting: 'הדרכת הורים' } as const;
export const PAYMENT = { unpaid: 'לא שולם', partial: 'שולם חלקית', paid: 'שולם' } as const;
export const PRIORITY = { high: 'גבוהה', normal: 'רגילה', low: 'נמוכה' } as const;
export const PROGRAM_STATUS = { active: 'פעיל', paused: 'מושהה', completed: 'הסתיים' } as const;

/** datetime-local value (local time) ↔ ISO */
export const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

/* ── shared data ────────────────────────────────────────── */
export type Stage = { id: string; name: string; position: number; kind: 'open' | 'won' | 'lost' };

export function useStages() {
  const [stages, setStages] = useState<Stage[]>([]);
  const reload = () =>
    supabase.from('pipeline_stages').select('id,name,position,kind').order('position').then(({ data }) => setStages((data as Stage[]) ?? []));
  useEffect(() => { reload(); }, []);
  return { stages, reload };
}

export function StageChip({ stage }: { stage?: Stage }) {
  if (!stage) return <span className="chip">—</span>;
  return <span className={`chip chip--${stage.kind}`}>{stage.name}</span>;
}

/* ── layout pieces ──────────────────────────────────────── */
export function PageHead({ title, lead, children }: { title: string; lead?: string; children?: ReactNode }) {
  return (
    <header className="phead phead--row">
      <div>
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </header>
  );
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {text && <p className="empty__text">{text}</p>}
    </div>
  );
}

/** Accessible modal built on the native <dialog> element (focus trap, Esc, backdrop). */
export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" aria-labelledby="modal-title" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="modal__in">
        <header className="modal__head">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="cbtn cbtn--ghost cbtn--sm" onClick={onClose} aria-label="סגירה">✕</button>
        </header>
        {open && children}
      </div>
    </dialog>
  );
}

export function useFlash() {
  const [msg, setMsg] = useState('');
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 2500); };
  const node = <p className="toast" role="status" aria-live="polite">{msg}</p>;
  return { flash, node };
}

/* ── timeline (activities) ──────────────────────────────── */
type Activity = { id: string; body: string | null; created_at: string };
export function Timeline({ entity, id, canWrite, refreshKey = 0 }: { entity: 'lead' | 'client' | 'deal' | 'program'; id: string; canWrite: boolean; refreshKey?: number }) {
  const [acts, setActs] = useState<Activity[]>([]);
  const [note, setNote] = useState('');
  const load = () =>
    supabase.from('activities').select('id,body,created_at').eq('entity', entity).eq('entity_id', id).order('created_at', { ascending: false })
      .then(({ data }) => setActs((data as Activity[]) ?? []));
  useEffect(() => { load(); }, [id, refreshKey]);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const body = note.trim();
    if (!body) return;
    const { error } = await supabase.from('activities').insert({ entity, entity_id: id, kind: 'note', body });
    if (!error) { setNote(''); load(); }
  }
  return (
    <section className="card" aria-labelledby={`tl-${id}`}>
      <h2 id={`tl-${id}`} className="card__title">הערות ופעילות</h2>
      {canWrite && (
        <form onSubmit={add} className="note-form">
          <label className="sr-only" htmlFor={`note-${id}`}>הערה חדשה</label>
          <textarea id={`note-${id}`} className="input" rows={3} maxLength={10000} placeholder="הערה פנימית…" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="cbtn cbtn--sm" disabled={!note.trim()}>הוספה</button>
        </form>
      )}
      {acts.length === 0 ? <p className="muted">אין עדיין פעילות.</p> : (
        <ol className="timeline-list">
          {acts.map((a) => (<li key={a.id}><span className="muted">{fmt(a.created_at)}</span><p>{a.body}</p></li>))}
        </ol>
      )}
    </section>
  );
}

export const logActivity = (entity: 'lead' | 'client' | 'deal' | 'program', entity_id: string, kind: string, body: string) =>
  supabase.from('activities').insert({ entity, entity_id, kind, body });
