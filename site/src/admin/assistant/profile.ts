/**
 * Learning profile, computed from the usage log and synced to `assistant_profile`:
 * - learned:   a topic done successfully 3 times in a row (no fix, no help question about it in between) → no more tips on it
 * - struggling: in the last 7 days ≥3 fixes, or ≥2 help questions, or a tour left midway twice → prioritised, tour offered again
 * - habits:    median hour of the user's actions (tips/reminders follow the habit, not a fixed time)
 * - shortcuts: most-opened screens
 */
import { supabase } from '../lib/supabase';
import { FAQ } from './faq';
import { topicOf } from './instrument';
import { localUsage, type UsageRow } from './usage';

export type Profile = {
  learned: string[];
  struggling: string[];
  medianHour: number | null;
  shortcuts: string[];
  counts: { actions: number; fixes: number; questions: number; misses: number; toursDone: number; days: number };
  updated: string;
};

const WEEK = 7 * 86_400_000;
const faqTopic = new Map(FAQ.map((f) => [f.id, f.tour ?? null]));

export function computeProfile(rows: UsageRow[] = localUsage()): Profile {
  const now = Date.now();
  const streak: Record<string, number> = {};
  const learned = new Set<string>();
  const fixes7: Record<string, number> = {};
  const asks7: Record<string, number> = {};
  const exits7: Record<string, number> = {};
  const hours: number[] = [];
  const screens: Record<string, number> = {};
  const days = new Set<string>();
  const counts = { actions: 0, fixes: 0, questions: 0, misses: 0, toursDone: 0, days: 0 };

  for (const r of rows) {
    const t = new Date(r.at);
    const recent = now - t.getTime() < WEEK;
    days.add(t.toDateString());
    if (r.kind === 'screen') { screens[r.detail] = (screens[r.detail] ?? 0) + 1; continue; }
    if (r.kind === 'action') {
      counts.actions++;
      hours.push(t.getHours() + t.getMinutes() / 60);
      const topic = topicOf(r.detail);
      if (topic) { streak[topic] = (streak[topic] ?? 0) + 1; if (streak[topic] >= 3) learned.add(topic); }
    } else if (r.kind === 'undo') {
      counts.fixes++;
      streak[r.detail] = 0;
      learned.delete(r.detail);
      if (recent) fixes7[r.detail] = (fixes7[r.detail] ?? 0) + 1;
    } else if (r.kind === 'help_q') {
      counts.questions++;
      for (const id of r.detail.split(',').slice(0, 1)) { // the top answer is the topic asked about
        const topic = faqTopic.get(id);
        if (!topic) continue;
        streak[topic] = 0;
        learned.delete(topic);
        if (recent) asks7[topic] = (asks7[topic] ?? 0) + 1;
      }
    } else if (r.kind === 'help_miss') {
      counts.misses++;
    } else if (r.kind === 'tour') {
      const [id, how] = r.detail.split(':');
      if (how === 'done') counts.toursDone++;
      if (how?.startsWith('exit') && recent) exits7[id] = (exits7[id] ?? 0) + 1;
    }
  }

  const struggling = new Set<string>();
  for (const [k, n] of Object.entries(fixes7)) if (n >= 3) struggling.add(k);
  for (const [k, n] of Object.entries(asks7)) if (n >= 2) struggling.add(k);
  for (const [k, n] of Object.entries(exits7)) if (n >= 2) struggling.add(k);
  for (const k of struggling) learned.delete(k);

  hours.sort((a, b) => a - b);
  const medianHour = hours.length >= 5 ? Math.round(hours[Math.floor(hours.length / 2)]) : null;
  const shortcuts = Object.entries(screens).filter(([k]) => k !== 'help').sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 3);
  counts.days = days.size;
  return { learned: [...learned], struggling: [...struggling], medianHour, shortcuts, counts, updated: new Date().toISOString() };
}

let lastSync = 0;
/** Upsert the computed profile (at most once a minute unless forced). */
export async function syncProfile(force = false) {
  if (!force && Date.now() - lastSync < 60_000) return;
  lastSync = Date.now();
  const profile = computeProfile();
  await supabase.from('assistant_profile').upsert({ profile }, { onConflict: 'user_id' });
}
