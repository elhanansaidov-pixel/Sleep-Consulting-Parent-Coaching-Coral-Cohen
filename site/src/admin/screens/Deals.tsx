import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type Announcements, type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { supabase, type Role } from '../lib/supabase';
import { Empty, Modal, PageHead, PAYMENT, SERVICE, fmtDate, logActivity, money, useFlash, useStages, type Stage } from '../lib/ui';

type Deal = {
  id: string; client_id: string; title: string | null; service: 'sleep' | 'parenting'; amount: number | null; stage_id: string | null;
  expected_close: string | null; payment_status: keyof typeof PAYMENT; paid_amount: number; closed_at: string | null; lost_reason: string | null;
  clients: { parent_names: string } | null;
};

/** Arrow keys move a lifted card one whole column at a time (left/right), in visual order. */
const columnJump: KeyboardCoordinateGetter = (event, { context: { active, droppableRects, collisionRect } }) => {
  if (!active || !collisionRect || (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight')) return undefined;
  event.preventDefault();
  const cx = collisionRect.left + collisionRect.width / 2;
  const cols = [...droppableRects.values()].map((r) => r.left + r.width / 2).sort((a, b) => a - b);
  const target = event.code === 'ArrowRight' ? cols.find((x) => x > cx + 4) : [...cols].reverse().find((x) => x < cx - 4);
  if (target === undefined) return undefined;
  return { x: collisionRect.left + (target - cx), y: collisionRect.top };
};

function Card({ d, canDrag, onOpen }: { d: Deal; canDrag: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: d.id, disabled: !canDrag });
  return (
    <div className={`kcard-wrap${isDragging ? ' kcard-wrap--drag' : ''}`}>
      <div
        ref={setNodeRef}
        className={`kcard${isDragging ? ' kcard--drag' : ''}`}
        style={{ transform: CSS.Translate.toString(transform) }}
        {...attributes}
        {...listeners}
        aria-roledescription="כרטיס עסקה הניתן לגרירה"
        aria-label={`${d.clients?.parent_names ?? ''}, ${d.title ?? SERVICE[d.service]}, ${money(d.amount)}, ${PAYMENT[d.payment_status]}`}
      >
        <span className="kcard__name">{d.clients?.parent_names}</span>
        <span className="kcard__meta">{d.title ?? SERVICE[d.service]}</span>
        <span className="kcard__foot">
          <b>{money(d.amount)}</b>
          <span className={`chip chip--pay-${d.payment_status}`}>{PAYMENT[d.payment_status]}</span>
        </span>
      </div>
      {!isDragging && (
        <button type="button" className="kcard__open" onClick={onOpen} aria-label={`פרטי העסקה של ${d.clients?.parent_names ?? ''}`}>פרטים</button>
      )}
    </div>
  );
}

function Column({ stage, deals, canDrag, onOpen }: { stage: Stage; deals: Deal[]; canDrag: boolean; onOpen: (d: Deal) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const sum = deals.reduce((a, d) => a + (d.amount ?? 0), 0);
  return (
    <section ref={setNodeRef} className={`kcol kcol--${stage.kind}${isOver ? ' kcol--over' : ''}`} aria-label={`${stage.name}, ${deals.length} עסקאות`}>
      <header className="kcol__head"><span>{stage.name}</span><span className="muted">{deals.length} · {money(sum)}</span></header>
      <div className="kcol__body">
        {deals.map((d) => <Card key={d.id} d={d} canDrag={canDrag} onOpen={() => onOpen(d)} />)}
        {deals.length === 0 && <p className="kcol__empty">אין עסקאות</p>}
      </div>
    </section>
  );
}

function EditDeal({ d, stages, canWrite, onSaved }: { d: Deal; stages: Stage[]; canWrite: boolean; onSaved: () => void }) {
  const [f, setF] = useState({
    amount: d.amount?.toString() ?? '', paid_amount: d.paid_amount?.toString() ?? '0', payment_status: d.payment_status,
    stage_id: d.stage_id ?? '', expected_close: d.expected_close ?? '', lost_reason: d.lost_reason ?? '',
  });
  const [err, setErr] = useState('');
  const lostStage = stages.find((s) => s.id === f.stage_id)?.kind === 'lost';
  async function save(e: FormEvent) {
    e.preventDefault();
    const amount = f.amount ? Number(f.amount) : null;
    const paid = Number(f.paid_amount || 0);
    if (amount != null && paid > amount) return setErr('הסכום ששולם גדול מסכום העסקה.');
    const { error } = await supabase.from('deals').update({
      amount, paid_amount: paid, payment_status: f.payment_status, stage_id: f.stage_id || null,
      expected_close: f.expected_close || null, lost_reason: lostStage ? f.lost_reason.trim() || null : null,
    }).eq('id', d.id);
    if (error) return setErr('השמירה נכשלה');
    if (f.stage_id !== d.stage_id) await logActivity('deal', d.id, 'stage_change', `השלב שונה ל: ${stages.find((s) => s.id === f.stage_id)?.name ?? ''}`);
    if (f.payment_status !== d.payment_status) await logActivity('client', d.client_id, 'payment', `תשלום: ${PAYMENT[f.payment_status]} (${money(paid)})`);
    onSaved();
  }
  return (
    <form onSubmit={save} noValidate>
      <p className="muted"><a href={`#/clients/${d.client_id}`}>{d.clients?.parent_names}</a> · {d.title ?? SERVICE[d.service]}{d.closed_at ? ` · נסגרה ${fmtDate(d.closed_at)}` : ''}</p>
      <fieldset disabled={!canWrite} className="plain">
        <div className="grid2">
          <div className="field"><label htmlFor="ed-a">סכום עסקה (₪)</label><input id="ed-a" className="input" type="number" min="0" dir="ltr" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
          <div className="field"><label htmlFor="ed-st">שלב</label><select id="ed-st" className="input" value={f.stage_id} onChange={(e) => setF({ ...f, stage_id: e.target.value })}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        </div>
        <div className="grid2">
          <div className="field"><label htmlFor="ed-ps">סטטוס תשלום</label><select id="ed-ps" className="input" value={f.payment_status} onChange={(e) => setF({ ...f, payment_status: e.target.value as Deal['payment_status'] })}>{Object.entries(PAYMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="field"><label htmlFor="ed-pa">שולם בפועל (₪)</label><input id="ed-pa" className="input" type="number" min="0" dir="ltr" value={f.paid_amount} onChange={(e) => setF({ ...f, paid_amount: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="ed-ec">תאריך סגירה צפוי</label><input id="ed-ec" className="input" type="date" value={f.expected_close} onChange={(e) => setF({ ...f, expected_close: e.target.value })} /></div>
        {lostStage && <div className="field"><label htmlFor="ed-lr">סיבה שהעסקה לא נסגרה</label><input id="ed-lr" className="input" maxLength={500} value={f.lost_reason} onChange={(e) => setF({ ...f, lost_reason: e.target.value })} /></div>}
        {err && <p className="field__err" role="alert">{err}</p>}
        {canWrite && <button className="cbtn cbtn--primary">שמירה</button>}
      </fieldset>
    </form>
  );
}

export function DealsScreen({ role }: { role: Role }) {
  const canWrite = role === 'owner';
  const { stages } = useStages();
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [open, setOpen] = useState<Deal | null>(null);
  const { flash, node } = useFlash();

  const load = useCallback(async () => {
    const { data } = await supabase.from('deals').select('*, clients(parent_names)').order('created_at', { ascending: false }).limit(500);
    setDeals((data as Deal[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnJump }),
  );
  const stageName = (id?: string | number | null) => stages.find((s) => s.id === id)?.name ?? '';
  const announcements: Announcements = {
    onDragStart: () => 'הרמת כרטיס. חץ ימינה או שמאלה מעביר לשלב הסמוך, רווח מניח, Escape מבטל.',
    onDragOver: ({ over }) => (over ? `מעל השלב ${stageName(over.id)}` : 'מחוץ לשלבים'),
    onDragEnd: ({ over }) => (over ? `הכרטיס הונח בשלב ${stageName(over.id)}` : 'הגרירה בוטלה'),
    onDragCancel: () => 'הגרירה בוטלה',
  };

  async function onDragEnd(e: DragEndEvent) {
    const d = deals?.find((x) => x.id === e.active.id);
    const to = e.over?.id as string | undefined;
    if (!d || !to || to === d.stage_id) return;
    setDeals((all) => all!.map((x) => (x.id === d.id ? { ...x, stage_id: to } : x))); // optimistic
    const { error } = await supabase.from('deals').update({ stage_id: to }).eq('id', d.id);
    if (error) { flash('ההעברה נכשלה'); return load(); }
    await logActivity('deal', d.id, 'stage_change', `השלב שונה ל: ${stageName(to)}`);
    flash(`הועבר ל"${stageName(to)}"`);
    load();
  }

  const totals = useMemo(() => {
    const kind = (id: string | null) => stages.find((s) => s.id === id)?.kind;
    const all = deals ?? [];
    return {
      paid: all.reduce((a, d) => a + (d.paid_amount ?? 0), 0),
      forecast: all.filter((d) => kind(d.stage_id) === 'open').reduce((a, d) => a + (d.amount ?? 0), 0),
      wonOpenBalance: all.filter((d) => kind(d.stage_id) === 'won').reduce((a, d) => a + Math.max(0, (d.amount ?? 0) - (d.paid_amount ?? 0)), 0),
    };
  }, [deals, stages]);

  return (
    <>
      <PageHead title="עסקאות" lead={canWrite ? 'גררו כרטיס בין השלבים. במקלדת: Tab לכרטיס, רווח להרמה, חצים להזזה ורווח להנחה.' : 'מצב צפייה בלבד.'} />
      {node}
      <div className="tiles tiles--3">
        <div className="tile"><p className="tile__label">הכנסות בפועל (שולם)</p><p className="tile__value">{money(totals.paid)}</p></div>
        <div className="tile"><p className="tile__label">יתרה לגבייה מעסקאות שנסגרו</p><p className="tile__value">{money(totals.wonOpenBalance)}</p></div>
        <div className="tile tile--forecast"><p className="tile__label">תחזית (עסקאות פתוחות)</p><p className="tile__value">{money(totals.forecast)}</p></div>
      </div>
      {!deals ? <p className="muted">טוען…</p> : deals.length === 0 ? (
        <Empty title="עדיין אין עסקאות" text='עסקה נוצרת כשהופכים פנייה למשפחה, או מכרטיס המשפחה.' />
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd} accessibility={{ announcements, screenReaderInstructions: { draggable: 'כדי להזיז עסקה: רווח להרמה, חצים להזזה בין שלבים, רווח להנחה.' } }}>
          <div className="kanban">
            {stages.map((s) => <Column key={s.id} stage={s} deals={deals.filter((d) => d.stage_id === s.id)} canDrag={canWrite} onOpen={setOpen} />)}
          </div>
        </DndContext>
      )}
      <Modal open={!!open} title="פרטי עסקה" onClose={() => setOpen(null)}>
        {open && <EditDeal d={open} stages={stages} canWrite={canWrite} onSaved={() => { setOpen(null); flash('נשמר'); load(); }} />}
      </Modal>
    </>
  );
}
