/**
 * Usage log — the basis for learning. Records event kinds and short non-personal codes only
 * (screen ids, action ids, FAQ/tour ids, or the wording of an unanswered help question).
 * Local copy (≤1,500 rows) feeds tips; rows are sent to `usage_log` in batches.
 */
import { supabase } from '../lib/supabase';

export type UsageKind = 'screen' | 'action' | 'undo' | 'help_q' | 'help_miss' | 'tour' | 'tip';
export type UsageRow = { kind: UsageKind; detail: string; at: string };

const LOCAL_KEY = 'cc-usage';
export const USAGE_EVENT = 'cc-usage';
const LOCAL_MAX = 1500;
let enabled = false;
let queue: UsageRow[] = [];
let timer: number | undefined;

export function setUsageEnabled(on: boolean) {
  enabled = on;
  if (on && typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    window.addEventListener('pagehide', () => flush());
  }
}

export function localUsage(): UsageRow[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
}

export function track(kind: UsageKind, detail = '') {
  if (!enabled) return;
  const row: UsageRow = { kind, detail: detail.slice(0, 200), at: new Date().toISOString() };
  try {
    const all = localUsage();
    all.push(row);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all.slice(-LOCAL_MAX)));
  } catch { /* storage full/blocked: server copy still goes out */ }
  queue.push(row);
  window.dispatchEvent(new CustomEvent(USAGE_EVENT, { detail: row }));
  window.clearTimeout(timer);
  timer = window.setTimeout(flush, 5000);
}

export async function flush() {
  if (!queue.length) return;
  const batch = queue;
  queue = [];
  const { error } = await supabase.from('usage_log').insert(batch);
  if (error) queue = batch.concat(queue).slice(-200); // retry later, bounded
}
