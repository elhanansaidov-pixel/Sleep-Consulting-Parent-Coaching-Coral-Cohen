/**
 * Records what the user does without touching every screen: wraps supabase writes (insert/update/
 * upsert/delete and rpc) and logs `action` events as "<op>:<table>[:<fields>]". Values are never
 * logged — only table and field names. Detects "fixes" (kind `undo`): the same field of the same row
 * changed again within 2 minutes, or a delete in a table right after an insert into it.
 * Only active for pilot users (track() is a no-op otherwise).
 */
import { supabase } from '../lib/supabase';
import { track } from './usage';

const SKIP = new Set(['usage_log', 'assistant_profile', 'lead_views']);
const FIX_WINDOW = 2 * 60_000;
const recent = new Map<string, number>(); // "<table>:<field>:<rowId>" or "insert:<table>" → time
let installed = false;

/** Maps a recorded action to a learning topic (= tour id in tours.ts). */
export function topicOf(action: string): string | null {
  const [op, table, fields = ''] = action.split(':');
  const f = fields.split(',');
  if (op === 'rpc' && table === 'convert_lead') return 'convert';
  if (op === 'export') return 'export';
  if (table === 'leads') return op === 'delete' ? 'delete-request' : 'new-lead';
  if (table === 'activities') return 'new-lead'; // notes
  if (table === 'clients') return op === 'delete' ? 'delete-request' : null;
  if (table === 'deals') return f.some((x) => x === 'payment_status' || x === 'paid_amount') ? 'payment' : op === 'update' && f.includes('stage_id') ? 'deals-drag' : null;
  if (table === 'programs') return op === 'insert' ? 'start-program' : 'program-update';
  if (table === 'sessions') return 'program-update';
  if (table === 'tasks') return 'tasks';
  if (table === 'push_subscriptions' && op !== 'delete') return 'push';
  return null;
}

function fieldsOf(payload: unknown): string {
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row || typeof row !== 'object') return '';
  return Object.keys(row).filter((k) => !['id', 'user_id', 'entity', 'entity_id', 'body', 'kind'].includes(k)).sort().join(',');
}

function record(op: string, table: string, payload: unknown, rowId?: string) {
  // Only real notes count for activities (other activity rows are automatic timeline entries).
  if (table === 'activities') {
    const row = (Array.isArray(payload) ? payload[0] : payload) as { kind?: string } | undefined;
    if (row?.kind !== 'note') return;
  }
  const fields = op === 'update' || op === 'upsert' ? fieldsOf(payload) : '';
  const action = `${op}:${table}${fields ? ':' + fields : ''}`;
  track('action', action);

  const now = Date.now();
  for (const [k, t] of recent) if (now - t > FIX_WINDOW) recent.delete(k);
  const topic = topicOf(action) ?? table;
  if (op === 'update' && rowId) {
    const key = `${table}:${fields}:${rowId}`;
    if (recent.has(key)) track('undo', topic);
    recent.set(key, now);
  } else if (op === 'insert') {
    recent.set(`insert:${table}`, now);
  } else if (op === 'delete' && recent.has(`insert:${table}`)) {
    track('undo', topic);
  }
}

/** Wrap a filter builder so we learn the row id (eq('id', …)) and record when the request is sent. */
function wrapBuilder<T extends object>(builder: T, op: string, table: string, payload: unknown): T {
  let rowId: string | undefined;
  let done = false;
  const proxy: T = new Proxy(builder, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (typeof v !== 'function') return v;
      if (prop === 'then') {
        return (res?: (x: unknown) => unknown, rej?: (e: unknown) => unknown) => {
          if (!done) { done = true; try { record(op, table, payload, rowId); } catch { /* never break the app */ } }
          return (v as (a?: unknown, b?: unknown) => unknown).call(target, res, rej);
        };
      }
      return (...args: unknown[]) => {
        if (prop === 'eq' && args[0] === 'id') rowId = String(args[1]);
        const r = (v as (...a: unknown[]) => unknown).apply(target, args);
        return r === target ? proxy : r;
      };
    },
  });
  return proxy;
}

export function installInstrumentation() {
  if (installed) return;
  installed = true;
  const origFrom = supabase.from.bind(supabase);
  (supabase as { from: typeof supabase.from }).from = ((table: string) => {
    const qb = origFrom(table);
    if (SKIP.has(table)) return qb;
    return new Proxy(qb, {
      get(target, prop, receiver) {
        const v = Reflect.get(target, prop, receiver);
        if (typeof v === 'function' && (prop === 'insert' || prop === 'update' || prop === 'upsert' || prop === 'delete')) {
          return (...args: unknown[]) => wrapBuilder((v as (...a: unknown[]) => object).apply(target, args), String(prop), table, args[0]);
        }
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
  }) as typeof supabase.from;

  const origRpc = supabase.rpc.bind(supabase);
  (supabase as { rpc: typeof supabase.rpc }).rpc = ((fn: string, ...rest: unknown[]) => {
    const b = (origRpc as (...a: unknown[]) => object)(fn, ...rest);
    return wrapBuilder(b, 'rpc', fn, undefined);
  }) as typeof supabase.rpc;
}
