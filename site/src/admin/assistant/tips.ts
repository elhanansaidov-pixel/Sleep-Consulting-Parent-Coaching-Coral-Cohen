/**
 * Proactive tips: simple rules over today's data (counts only) and the learning profile.
 * One bubble at a time, by priority. A dismissed tip does not come back (data alerts are keyed per
 * day, so e.g. "overdue tasks" can return on another day; habit tips are keyed permanently).
 */
import { supabase } from '../lib/supabase';
import type { Profile } from './profile';
import { localUsage } from './usage';

export type Tip = { key: string; text: string; tour?: string; href?: string; priority: number };
export type DataSnapshot = { waitingLeads: number; overdueTasks: number; sessionsWithoutSummary: number; deals: number; leads: number };

const DISMISSED = 'cc-tips-dismissed';
const day = () => new Date().toISOString().slice(0, 10);
export const TOPIC_LABEL: Record<string, string> = {
  'new-lead': 'טיפול בפנייה', convert: 'הפיכה למשפחה', 'deals-drag': 'לוח העסקאות', payment: 'רישום תשלום',
  'start-program': 'פתיחת תהליך', 'program-update': 'עדכון תהליך', tasks: 'משימות', push: 'התראות',
  dashboard: 'לוח הבקרה', 'delete-request': 'מחיקה לבקשת הורה', export: 'גיבוי',
};

export function dismissed(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED) || '[]')); } catch { return new Set(); }
}
export function dismiss(key: string) {
  const s = dismissed(); s.add(key);
  try { localStorage.setItem(DISMISSED, JSON.stringify([...s].slice(-300))); } catch { /* ignore */ }
}

/** Counts only — no names or content leave the database query. */
export async function loadSnapshot(): Promise<DataSnapshot> {
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const head = { count: 'exact' as const, head: true };
  const { data: first } = await supabase.from('pipeline_stages').select('id').eq('kind', 'open').order('position').limit(1).maybeSingle();
  const [waiting, overdue, todays, deals, leads] = await Promise.all([
    supabase.from('leads').select('id', head).or(first ? `stage_id.eq.${first.id},stage_id.is.null` : 'stage_id.is.null').lt('created_at', dayAgo),
    supabase.from('tasks').select('id', head).eq('status', 'open').lt('due_at', now.toISOString()),
    supabase.from('programs').select('id, sessions(held_at)').eq('status', 'active').gte('next_session_at', dayStart.toISOString()).lt('next_session_at', now.toISOString()),
    supabase.from('deals').select('id', head),
    supabase.from('leads').select('id', head),
  ]);
  const progs = ((todays as { data?: { sessions?: { held_at: string }[] }[] }).data ?? []);
  const sessionsWithoutSummary = progs.filter((p) => !(p.sessions ?? []).some((s) => new Date(s.held_at) >= dayStart)).length;
  return {
    waitingLeads: waiting.count ?? 0, overdueTasks: overdue.count ?? 0, sessionsWithoutSummary,
    deals: deals.count ?? 0, leads: leads.count ?? 0,
  };
}

export function pickTip(data: DataSnapshot | null, profile: Profile): Tip | null {
  const rows = localUsage();
  const today = new Date().toDateString();
  const todayRows = rows.filter((r) => new Date(r.at).toDateString() === today);
  const learned = new Set(profile.learned);
  const tips: Tip[] = [];
  const d = day();

  if (data?.waitingLeads) tips.push({ key: `waiting:${d}`, priority: 100, tour: learned.has('new-lead') ? undefined : 'new-lead', href: '#/leads',
    text: data.waitingLeads === 1 ? 'יש פנייה אחת שממתינה יותר מיום. כדאי לחזור אליה היום.' : `יש ${data.waitingLeads} פניות שממתינות יותר מיום. כדאי לחזור אליהן היום.` });
  if (data?.overdueTasks) tips.push({ key: `overdue:${d}`, priority: 90, href: '#/tasks', tour: learned.has('tasks') ? undefined : 'tasks',
    text: data.overdueTasks === 1 ? 'יש משימה אחת באיחור.' : `יש ${data.overdueTasks} משימות באיחור.` });
  // After the user's usual working hour, remind about today's session summary.
  const afterHabit = profile.medianHour == null || new Date().getHours() >= profile.medianHour;
  if (data?.sessionsWithoutSummary && afterHabit) tips.push({ key: `summary:${d}`, priority: 80, tour: 'program-update', href: '#/programs',
    text: 'עוד לא רשמת סיכום לשיחה של היום. שתי שורות מספיקות.' });

  const fixesToday = todayRows.filter((r) => r.kind === 'undo');
  if (fixesToday.length >= 3) {
    const top = Object.entries(fixesToday.reduce<Record<string, number>>((m, r) => ({ ...m, [r.detail]: (m[r.detail] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0][0];
    tips.push({ key: `fixes:${d}`, priority: 70, tour: TOPIC_LABEL[top] ? top : undefined,
      text: 'שמתי לב שתיקנת כמה דברים היום. זה לגמרי בסדר. רוצה שאראה לך שוב איך זה עובד?' });
  }
  for (const t of profile.struggling) if (TOPIC_LABEL[t]) tips.push({ key: `struggle:${t}:${d}`, priority: 60, tour: t,
    text: `נראה ש"${TOPIC_LABEL[t]}" עוד לא לגמרי נוח. אראה לך על המסך? זה לוקח פחות מדקה.` });

  const stageMovesToday = todayRows.filter((r) => r.kind === 'action' && r.detail.startsWith('update:leads:') && r.detail.includes('stage_id')).length;
  if (stageMovesToday >= 5) tips.push({ key: 'filter-by-stage', priority: 50, href: '#/leads',
    text: 'את מעדכנת הרבה פניות אחת-אחת. במסך "פניות" אפשר לסנן לפי שלב, ולראות רק את מה שצריך טיפול.' });

  if (typeof Notification !== 'undefined' && Notification.permission !== 'granted' && !learned.has('push'))
    tips.push({ key: 'push', priority: 40, tour: 'push', text: 'כדאי להפעיל התראות במכשיר הזה, כדי לדעת מיד על כל פנייה חדשה.' });

  const visited = new Set(rows.filter((r) => r.kind === 'screen').map((r) => r.detail));
  if (data?.deals && !visited.has('deals')) tips.push({ key: 'try-deals', priority: 30, tour: 'deals-drag',
    text: 'עוד לא ניסית את לוח העסקאות. שם רואים בבת אחת את כל המשפחות לפי שלבים.' });

  const lastExport = rows.filter((r) => r.kind === 'action' && r.detail.startsWith('export:')).at(-1);
  if (data?.leads && (!lastExport || Date.now() - new Date(lastExport.at).getTime() > 30 * 86_400_000) && profile.counts.days >= 7)
    tips.push({ key: `export:${d.slice(0, 7)}`, priority: 20, tour: 'export', text: 'הגיע הזמן לגיבוי החודשי: "ייצוא ל-CSV" במסך הפניות.' });

  const gone = dismissed();
  return tips.filter((t) => !gone.has(t.key)).sort((a, b) => b.priority - a.priority)[0] ?? null;
}
