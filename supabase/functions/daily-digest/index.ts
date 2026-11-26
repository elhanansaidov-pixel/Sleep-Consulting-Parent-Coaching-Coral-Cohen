// daily-digest — morning email to the owner: today's tasks, overdue tasks, today's sessions,
// and new leads still waiting for a first contact. Triggered by pg_cron (see migration 0009).
// Protected by a shared key (x-digest-key) stored in Supabase Vault + function secrets.
import { createClient } from 'npm:@supabase/supabase-js@2.119.2';
import nodemailer from 'npm:nodemailer@6.9.16';

const env = (k: string) => Deno.env.get(k) ?? '';
const TZ = 'Asia/Jerusalem';
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function timingSafeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** [start, end) of "today" in Israel, as ISO strings. */
function todayRange() {
  const now = new Date();
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const offsetMin = (() => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' }).formatToParts(now);
    const m = parts.find((p) => p.type === 'timeZoneName')?.value.match(/GMT([+-]\d+)(?::(\d+))?/);
    return m ? Number(m[1]) * 60 + Math.sign(Number(m[1])) * Number(m[2] ?? 0) : 120;
  })();
  const start = new Date(Date.parse(`${ymd}T00:00:00Z`) - offsetMin * 60_000);
  return { start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString(), label: ymd };
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const date = (iso: string) => new Date(iso).toLocaleDateString('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric' });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  if (!timingSafeEqual(req.headers.get('x-digest-key') ?? '', env('DIGEST_KEY'))) return new Response('forbidden', { status: 403 });

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { start, end } = todayRange();

  const [{ data: today }, { data: overdue }, { data: sessions }, { data: firstStage }] = await Promise.all([
    db.from('tasks').select('title,due_at').eq('status', 'open').gte('due_at', start).lt('due_at', end).order('due_at'),
    db.from('tasks').select('title,due_at').eq('status', 'open').lt('due_at', start).order('due_at'),
    db.from('programs').select('next_session_at,service,current_week,clients(parent_names)').eq('status', 'active').gte('next_session_at', start).lt('next_session_at', end).order('next_session_at'),
    db.rpc('first_open_stage'),
  ]);
  const { count: waiting } = await db.from('leads').select('id', { count: 'exact', head: true }).eq('stage_id', firstStage as string);

  const nothing = !today?.length && !overdue?.length && !sessions?.length && !waiting;
  if (nothing) return new Response(JSON.stringify({ ok: true, sent: false }), { headers: { 'Content-Type': 'application/json' } });

  const li = (s: string) => `<li style="margin:0 0 6px">${s}</li>`;
  const block = (title: string, items: string[]) =>
    items.length ? `<h3 style="font-weight:500;margin:20px 0 8px">${title}</h3><ul style="margin:0;padding-inline-start:18px">${items.join('')}</ul>` : '';

  const html = `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#23201c;text-align:right">
<p style="color:#6b6157;margin:0 0 16px;direction:ltr;text-align:right">coral cohen</p>
<h2 style="font-weight:500;margin:0 0 4px">בוקר טוב, קורל</h2>
<p style="color:#6b6157;margin:0 0 8px">הסיכום של היום.</p>
${block('שיחות ומפגשים היום', (sessions ?? []).map((s: any) => li(`${time(s.next_session_at)} · ${esc(s.clients?.parent_names ?? '')} · ${s.service === 'sleep' ? `ייעוץ שינה, שבוע ${s.current_week ?? '—'}` : 'הדרכת הורים'}`)))}
${block('משימות להיום', (today ?? []).map((t: any) => li(`${esc(t.title)}${t.due_at ? ` · ${time(t.due_at)}` : ''}`)))}
${block('משימות באיחור', (overdue ?? []).map((t: any) => li(`${esc(t.title)} · מ-${date(t.due_at)}`)))}
${waiting ? `<h3 style="font-weight:500;margin:20px 0 8px">פניות שממתינות לקשר ראשון</h3><p style="margin:0">${waiting} פניות בשלב "פנייה חדשה".</p>` : ''}
<p style="margin:24px 0 0"><a href="${env('ADMIN_URL')}" style="background:#1e2230;color:#fefaf4;padding:12px 22px;border-radius:6px;text-decoration:none;display:inline-block">כניסה למערכת</a></p></div>`;

  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: env('SMTP_USER'), pass: env('SMTP_PASSWORD') } });
  await transport.sendMail({
    from: { name: 'קורל כהן - מערכת ניהול', address: env('SMTP_USER') },
    to: env('NOTIFY_TO'),
    subject: `סיכום יומי: ${(today?.length ?? 0) + (sessions?.length ?? 0)} להיום${overdue?.length ? `, ${overdue.length} באיחור` : ''}`,
    html,
  });
  return new Response(JSON.stringify({ ok: true, sent: true }), { headers: { 'Content-Type': 'application/json' } });
});
