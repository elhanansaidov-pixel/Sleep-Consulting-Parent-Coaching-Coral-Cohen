/**
 * In-browser stand-in for the Supabase client, used only in demo mode. Implements the subset of the
 * query builder the CRM uses (select with embeds, filters, order, range/limit, single, count, insert,
 * update, upsert, delete, rpc convert_lead) over sample data kept in localStorage. Never makes a
 * network request.
 */
import { seed, type Db, type Row } from './seed';
import { exitDemo, storeKey } from './flag';

const DB_KEY = () => storeKey('db');
let db: Db | null = null;
function load(): Db {
  if (db) return db;
  try { const s = localStorage.getItem(DB_KEY()); if (s) db = JSON.parse(s); } catch { /* ignore */ }
  if (!db) { db = seed(); save(); }
  return db!;
}
function save() { try { localStorage.setItem(DB_KEY(), JSON.stringify(db)); } catch { /* quota: keep in memory */ } }
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const nowIso = () => new Date().toISOString();
const singular = (t: string) => (t.endsWith('ies') ? t.slice(0, -3) + 'y' : t.endsWith('s') ? t.slice(0, -1) : t);

type Filter = (r: Row) => boolean;
const likeRe = (p: string) => new RegExp('^' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i');
function cmp(op: string, col: string, val: unknown): Filter {
  const v = (r: Row) => r[col] as never;
  switch (op) {
    case 'eq': return (r) => String(v(r)) === String(val);
    case 'neq': return (r) => String(v(r)) !== String(val);
    case 'gt': return (r) => v(r) != null && v(r) > (val as never);
    case 'gte': return (r) => v(r) != null && v(r) >= (val as never);
    case 'lt': return (r) => v(r) != null && v(r) < (val as never);
    case 'lte': return (r) => v(r) != null && v(r) <= (val as never);
    case 'ilike': case 'like': return (r) => v(r) != null && likeRe(String(val)).test(String(v(r)));
    case 'is': return (r) => (val === null || val === 'null' ? v(r) == null : v(r) === val);
    case 'in': return (r) => (val as unknown[]).map(String).includes(String(v(r)));
    default: return () => true;
  }
}
/** PostgREST `or` syntax: "a.eq.1,b.is.null,c.ilike.%x%" */
function orFilter(expr: string): Filter {
  const parts = expr.split(',').map((p) => { const [c, op, ...rest] = p.split('.'); return cmp(op, c, rest.join('.')); });
  return (r) => parts.some((f) => f(r));
}

/** Split a select list on top-level commas: "*, clients(parent_names), leads(parent_name)". */
function parseCols(s: string): { name: string; inner?: string }[] {
  const out: { name: string; inner?: string }[] = [];
  let depth = 0, cur = '';
  for (const ch of s + ',') {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      const t = cur.trim();
      if (t) { const m = t.match(/^(\w+)\((.*)\)$/); out.push(m ? { name: m[1], inner: m[2] } : { name: t }); }
      cur = '';
    } else cur += ch;
  }
  return out;
}
function project(table: string, row: Row, cols: string): Record<string, unknown> {
  const d = load();
  const out: Record<string, unknown> = {};
  for (const c of parseCols(cols || '*')) {
    if (c.name === '*') Object.assign(out, row);
    else if (c.inner != null) {
      const fk = `${singular(c.name)}_id`;
      if (fk in row) {
        const target = (d[c.name] ?? []).find((x) => x.id === row[fk]);
        out[c.name] = target ? project(c.name, target, c.inner) : null;
      } else {
        const back = `${singular(table)}_id`;
        out[c.name] = (d[c.name] ?? []).filter((x) => x[back] === row.id).map((x) => project(c.name, x, c.inner!));
      }
    } else out[c.name] = row[c.name] ?? null;
  }
  return out;
}

const DEFAULTS: Record<string, () => Record<string, unknown>> = {
  leads: () => ({ priority: 'normal', source: 'website', answers: {}, client_id: null, duplicate_of: null }),
  tasks: () => ({ status: 'open', priority: 'normal', completed_at: null, lead_id: null, client_id: null, deal_id: null, details: null }),
  deals: () => ({ payment_status: 'unpaid', paid_amount: 0, closed_at: null, lost_reason: null, expected_close: null }),
  programs: () => ({ status: 'active', start_date: nowIso().slice(0, 10), current_week: 1, current_stage: 1, next_session_at: null }),
  clients: () => ({ tags: [], notes: null, email: null }),
  activities: () => ({ actor: null }),
};

/** The small set of database triggers the UI relies on. */
function beforeUpdate(table: string, oldRow: Row, next: Row) {
  const d = load();
  if (table === 'deals' && next.stage_id !== oldRow.stage_id) {
    const k = d.pipeline_stages.find((s) => s.id === next.stage_id)?.kind;
    next.closed_at = k === 'won' || k === 'lost' ? nowIso() : null;
  }
  if (table === 'tasks') {
    if (next.status === 'done' && oldRow.status !== 'done') next.completed_at = nowIso();
    if (next.status !== 'done') next.completed_at = null;
  }
  if (table === 'leads' && next.stage_id !== oldRow.stage_id && !oldRow.first_contact_at) {
    const first = [...d.pipeline_stages].filter((s) => s.kind === 'open').sort((a, b) => Number(a.position) - Number(b.position))[0];
    if (first && oldRow.stage_id === first.id) next.first_contact_at = nowIso();
  }
}
function cascadeDelete(table: string, ids: Set<string>) {
  const d = load();
  const drop = (t: string, pred: (r: Row) => boolean) => {
    const gone = (d[t] ?? []).filter(pred);
    d[t] = (d[t] ?? []).filter((r) => !pred(r));
    return new Set(gone.map((r) => r.id));
  };
  if (table === 'clients') {
    const progs = drop('programs', (r) => ids.has(r.client_id as string));
    drop('sessions', (r) => progs.has(r.program_id as string));
    const deals = drop('deals', (r) => ids.has(r.client_id as string));
    drop('tasks', (r) => ids.has(r.client_id as string) || deals.has(r.deal_id as string));
    d.leads.forEach((l) => { if (ids.has(l.client_id as string)) l.client_id = null; });
  }
  if (table === 'leads') { drop('tasks', (r) => ids.has(r.lead_id as string)); d.deals.forEach((x) => { if (ids.has(x.lead_id as string)) x.lead_id = null; }); }
  if (table === 'deals') drop('tasks', (r) => ids.has(r.deal_id as string));
  if (table === 'programs') drop('sessions', (r) => ids.has(r.program_id as string));
  drop('activities', (r) => ids.has(r.entity_id as string));
}

type Result = { data: unknown; error: null | { message: string }; count?: number | null };

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private cols = '*';
  private returning = false;
  private countMode = false;
  private head = false;
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean; nullsFirst?: boolean }[] = [];
  private lim?: number;
  private rng?: [number, number];
  private one: false | 'single' | 'maybe' = false;
  private payload: unknown;
  private conflict = 'id';
  constructor(private table: string) {}

  select(cols = '*', opts?: { count?: string; head?: boolean }) {
    if (this.op === 'select') { this.cols = cols; this.countMode = !!opts?.count; this.head = !!opts?.head; } else { this.returning = true; this.cols = cols; }
    return this;
  }
  insert(rows: unknown) { this.op = 'insert'; this.payload = rows; return this; }
  update(patch: unknown) { this.op = 'update'; this.payload = patch; return this; }
  upsert(rows: unknown, opts?: { onConflict?: string }) { this.op = 'upsert'; this.payload = rows; this.conflict = opts?.onConflict ?? 'id'; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c: string, v: unknown) { this.filters.push(cmp('eq', c, v)); return this; }
  neq(c: string, v: unknown) { this.filters.push(cmp('neq', c, v)); return this; }
  gt(c: string, v: unknown) { this.filters.push(cmp('gt', c, v)); return this; }
  gte(c: string, v: unknown) { this.filters.push(cmp('gte', c, v)); return this; }
  lt(c: string, v: unknown) { this.filters.push(cmp('lt', c, v)); return this; }
  lte(c: string, v: unknown) { this.filters.push(cmp('lte', c, v)); return this; }
  ilike(c: string, v: string) { this.filters.push(cmp('ilike', c, v)); return this; }
  like(c: string, v: string) { this.filters.push(cmp('like', c, v)); return this; }
  is(c: string, v: unknown) { this.filters.push(cmp('is', c, v)); return this; }
  in(c: string, v: unknown[]) { this.filters.push(cmp('in', c, v)); return this; }
  filter(c: string, op: string, v: unknown) { this.filters.push(cmp(op, c, v)); return this; }
  not(c: string, op: string, v: unknown) { const f = cmp(op, c, v); this.filters.push((r) => !f(r)); return this; }
  or(expr: string) { this.filters.push(orFilter(expr)); return this; }
  order(col: string, o?: { ascending?: boolean; nullsFirst?: boolean }) { this.orders.push({ col, asc: o?.ascending ?? true, nullsFirst: o?.nullsFirst }); return this; }
  limit(n: number) { this.lim = n; return this; }
  range(a: number, b: number) { this.rng = [a, b]; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }

  private run(): Result {
    const d = load();
    const t = (d[this.table] ??= []);
    const match = (r: Row) => this.filters.every((f) => f(r));
    let affected: Row[] = [];

    if (this.op === 'insert' || this.op === 'upsert') {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Record<string, unknown>[];
      for (const r of rows) {
        const keys = this.conflict.split(',').map((k) => k.trim());
        const existing = this.op === 'upsert' ? t.find((x) => keys.every((k) => r[k] !== undefined && String(x[k]) === String(r[k]))) : undefined;
        if (existing) { const next = { ...existing, ...r, updated_at: nowIso() } as Row; beforeUpdate(this.table, existing, next); Object.assign(existing, next); affected.push(existing); }
        else {
          const row = { id: uuid(), created_at: nowIso(), updated_at: nowIso(), ...(DEFAULTS[this.table]?.() ?? {}), ...r } as Row;
          if (this.table === 'usage_log' || this.table === 'assistant_profile' || this.table === 'lead_views') row.user_id ??= 'demo-user';
          t.push(row); affected.push(row);
        }
      }
      save();
    } else if (this.op === 'update') {
      for (const r of t.filter(match)) { const next = { ...r, ...(this.payload as object), updated_at: nowIso() } as Row; beforeUpdate(this.table, r, next); Object.assign(r, next); affected.push(r); }
      save();
    } else if (this.op === 'delete') {
      affected = t.filter(match);
      const ids = new Set(affected.map((r) => r.id));
      d[this.table] = t.filter((r) => !ids.has(r.id));
      cascadeDelete(this.table, ids);
      save();
    }

    if (this.op !== 'select') {
      if (!this.returning) return { data: null, error: null };
      const data = affected.map((r) => project(this.table, r, this.cols));
      return this.one ? { data: data[0] ?? null, error: this.one === 'single' && !data.length ? { message: 'no rows' } : null } : { data, error: null };
    }

    let rows = t.filter(match);
    for (const o of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const x = a[o.col] as never, y = b[o.col] as never;
        const nf = o.nullsFirst ?? !o.asc;
        if (x == null && y == null) return 0;
        if (x == null) return nf ? -1 : 1;
        if (y == null) return nf ? 1 : -1;
        return (x < y ? -1 : x > y ? 1 : 0) * (o.asc ? 1 : -1);
      });
    }
    const count = this.countMode ? rows.length : null;
    if (this.rng) rows = rows.slice(this.rng[0], this.rng[1] + 1);
    if (this.lim != null) rows = rows.slice(0, this.lim);
    if (this.head) return { data: null, error: null, count };
    const data = rows.map((r) => project(this.table, r, this.cols));
    if (this.one) {
      if (this.one === 'single' && data.length !== 1) return { data: null, error: { message: 'no rows' }, count };
      return { data: data[0] ?? null, error: null, count };
    }
    return { data, error: null, count };
  }

  then<A = Result, B = never>(res?: ((v: Result) => A | PromiseLike<A>) | null, rej?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    let out: Result;
    try { out = this.run(); } catch (e) { out = { data: null, error: { message: String(e) } }; }
    // async, like the real client
    return new Promise<Result>((r) => setTimeout(() => r(out), 60)).then(res, rej);
  }
}

function convertLead(p: { p_lead: string; p_amount?: number | null }): Result {
  const d = load();
  const l = d.leads.find((x) => x.id === p.p_lead);
  if (!l) return { data: null, error: { message: 'lead not found' } };
  if (l.client_id) return { data: l.client_id, error: null };
  let c = d.clients.find((x) => x.phone_normalized === l.phone_normalized);
  if (!c) {
    c = { id: uuid(), parent_names: l.parent_name, phone: l.phone, phone_normalized: l.phone_normalized, email: l.email ?? null, tags: [], notes: null, created_from_lead_id: l.id, created_at: nowIso(), updated_at: nowIso() } as Row;
    d.clients.push(c);
    d.activities.push({ id: uuid(), entity: 'client', entity_id: c.id, kind: 'created', body: 'המשפחה נוצרה מפנייה בשאלון', actor: null, created_at: nowIso() } as Row);
  }
  l.client_id = c.id;
  d.deals.push({ id: uuid(), client_id: c.id, lead_id: l.id, service: l.service, amount: p.p_amount ?? null, stage_id: l.stage_id, title: l.service === 'sleep' ? 'ייעוץ שינה' : 'הדרכת הורים', payment_status: 'unpaid', paid_amount: 0, closed_at: null, lost_reason: null, expected_close: null, created_at: nowIso(), updated_at: nowIso() } as Row);
  d.activities.push({ id: uuid(), entity: 'lead', entity_id: l.id, kind: 'converted', body: 'הפנייה הפכה למשפחה ולעסקה', actor: null, created_at: nowIso() } as Row);
  save();
  return { data: c.id, error: null };
}

const session = { access_token: 'demo', token_type: 'bearer', user: { id: 'demo-user', email: 'demo@example.com' } };
const ok = <T>(data: T) => Promise.resolve({ data, error: null });

export function createDemoClient() {
  return {
    from: (table: string) => new Query(table),
    rpc: (fn: string, args: Record<string, unknown> = {}) => {
      const q = new Query('__rpc__');
      (q as unknown as { then: Query['then'] }).then = (res, rej) =>
        Promise.resolve(fn === 'convert_lead' ? convertLead(args as { p_lead: string }) : { data: null, error: null }).then(res, rej);
      return q;
    },
    auth: {
      getSession: () => ok({ session }),
      getUser: () => ok({ user: session.user }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => { exitDemo(); return ok(null); },
      signInWithPassword: () => ok({ session }),
      updateUser: () => ok({ user: session.user }),
      verifyOtp: () => ok({ session }),
      resetPasswordForEmail: () => ok({}),
      mfa: {
        getAuthenticatorAssuranceLevel: () => ok({ currentLevel: 'aal2', nextLevel: 'aal2' }),
        listFactors: () => ok({ totp: [{ id: 'demo-factor', status: 'verified', factor_type: 'totp' }], all: [] }),
        enroll: () => ok(null), challengeAndVerify: () => ok(null), unenroll: () => ok(null),
      },
    },
  };
}

