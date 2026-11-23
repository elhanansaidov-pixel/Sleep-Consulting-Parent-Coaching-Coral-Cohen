// submit-lead — public endpoint for the website questionnaire.
// Validates input, blocks spam (honeypot + Turnstile + per-IP rate limit), flags duplicates,
// stores the lead with the service role, and emails Coral a minimal notification.
// Never logs personal data.
import { createClient } from 'npm:@supabase/supabase-js@2.119.2';
import nodemailer from 'npm:nodemailer@6.9.16';

const ALLOWED_ORIGINS = new Set([
  'https://coral-cohen-sleep.coral-cohen-site.workers.dev',
  'https://preview-coral-cohen-sleep.coral-cohen-site.workers.dev',
  'http://localhost:4321',
]);
const VERSION_PREVIEW = /^https:\/\/[a-z0-9-]+-coral-cohen-sleep\.coral-cohen-site\.workers\.dev$/;
const RATE_LIMIT_PER_HOUR = 5;

const TEXT_FIELDS = ['parent_name', 'phone', 'email', 'child_age', 'full_name'] as const;
const ANSWER_FIELDS = [
  'main_difficulty', 'current_routine', 'tried_so_far', 'desired_change',
  'medical_info', 'both_parents', 'process_understanding', 'anything_else',
] as const;
const REQUIRED = ['parent_name', 'phone', 'child_age', 'full_name', ...ANSWER_FIELDS] as const;

const env = (k: string) => Deno.env.get(k) ?? '';

function cors(origin: string | null): Record<string, string> {
  const ok = origin && (ALLOWED_ORIGINS.has(origin) || VERSION_PREVIEW.test(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin! : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '972' + d.slice(1);
  return d;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

type Payload = Record<string, unknown>;

function validate(p: Payload): { ok: true; data: Record<string, string> } | { ok: false; field: string } {
  const data: Record<string, string> = {};
  for (const k of [...TEXT_FIELDS, ...ANSWER_FIELDS]) {
    const v = p[k];
    if (v !== undefined && typeof v !== 'string') return { ok: false, field: k };
    const s = (v as string | undefined)?.trim() ?? '';
    const max = (ANSWER_FIELDS as readonly string[]).includes(k) ? 3000 : 200;
    if (s.length > max) return { ok: false, field: k };
    data[k] = s;
  }
  for (const k of REQUIRED) if (!data[k]) return { ok: false, field: k };
  const digits = data.phone.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) return { ok: false, field: 'phone' };
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) return { ok: false, field: 'email' };
  if (p.consent !== true) return { ok: false, field: 'consent' };
  return { ok: true, data };
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const form = new FormData();
  form.append('secret', env('TURNSTILE_SECRET'));
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const out = await res.json().catch(() => ({}));
  const host = String(out?.hostname ?? '');
  return out?.success === true && (host === 'localhost' || host.endsWith('coral-cohen-site.workers.dev'));
}

async function notify(lead: { id: string; parent_name: string; phone: string; child_age: string; duplicate: boolean }) {
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: env('SMTP_USER'), pass: env('SMTP_PASSWORD') },
  });
  const link = `${env('ADMIN_URL')}#/leads/${lead.id}`;
  const html = `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#23201c;text-align:right">
<p style="color:#6b6157;margin:0 0 16px;direction:ltr;text-align:right">coral cohen</p>
<h2 style="font-weight:500;margin:0 0 12px">פנייה חדשה מהאתר${lead.duplicate ? ' (פנייה חוזרת)' : ''}</h2>
<p style="margin:0 0 6px"><b>שם:</b> ${escapeHtml(lead.parent_name)}</p>
<p style="margin:0 0 6px"><b>טלפון:</b> <span dir="ltr">${escapeHtml(lead.phone)}</span></p>
<p style="margin:0 0 20px"><b>גיל הילד/ה:</b> ${escapeHtml(lead.child_age)}</p>
<p style="margin:0 0 24px"><a href="${link}" style="background:#1e2230;color:#fefaf4;padding:12px 22px;border-radius:6px;text-decoration:none;display:inline-block">לצפייה בפנייה המלאה</a></p>
<p style="color:#6b6157;font-size:13px;margin:0">התשובות המלאות לשאלון זמינות רק בתוך המערכת.</p></div>`;
  await transport.sendMail({
    from: { name: 'קורל כהן - מערכת ניהול', address: env('SMTP_USER') },
    to: env('NOTIFY_TO'),
    subject: `פנייה חדשה מהאתר: ${lead.parent_name}`,
    html,
    text: `פנייה חדשה מהאתר\nשם: ${lead.parent_name}\nטלפון: ${lead.phone}\nגיל: ${lead.child_age}\n${link}`,
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const h = cors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (req.method !== 'POST') return json(405, { error: 'method' }, h);
  if (h['Access-Control-Allow-Origin'] === 'null') return json(403, { error: 'origin' }, h);

  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > 64_000) return json(413, { error: 'too_large' }, h);

  let p: Payload;
  try { p = await req.json(); } catch { return json(400, { error: 'bad_json' }, h); }
  if (typeof p !== 'object' || p === null) return json(400, { error: 'bad_json' }, h);

  // Honeypot: pretend success so bots learn nothing.
  if (typeof p.website === 'string' && p.website.trim() !== '') return json(200, { ok: true }, h);

  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  const ipHash = await sha256(env('IP_HASH_SALT') + ip);
  const { data: count, error: rateErr } = await db.rpc('bump_submit_rate', { p_ip_hash: ipHash });
  if (rateErr) { console.error('rate_limit_error'); return json(500, { error: 'server' }, h); }
  if ((count as number) > RATE_LIMIT_PER_HOUR) return json(429, { error: 'rate_limited' }, h);

  const v = validate(p);
  if (!v.ok) return json(400, { error: 'invalid', field: v.field }, h);

  if (!(await verifyTurnstile(String(p.turnstile_token ?? ''), ip))) return json(400, { error: 'captcha' }, h);

  const d = v.data;
  const phoneNorm = normalizePhone(d.phone);
  const { data: prev } = await db.from('leads').select('id').eq('phone_normalized', phoneNorm)
    .is('duplicate_of', null).order('created_at', { ascending: true }).limit(1).maybeSingle();
  const { data: stageId } = await db.rpc('first_open_stage');

  const answers: Record<string, string> = {};
  for (const k of ANSWER_FIELDS) answers[k] = d[k];

  const { data: lead, error } = await db.from('leads').insert({
    source: 'website_sleep_form',
    service: 'sleep',
    stage_id: stageId,
    parent_name: d.parent_name,
    phone: d.phone,
    phone_normalized: phoneNorm,
    email: d.email || null,
    child_age: d.child_age,
    answers,
    consent_at: new Date().toISOString(),
    signed_name: d.full_name,
    duplicate_of: prev?.id ?? null,
  }).select('id').single();
  if (error || !lead) { console.error('insert_error', error?.code); return json(500, { error: 'server' }, h); }

  await db.from('activities').insert({ entity: 'lead', entity_id: lead.id, kind: 'created', body: 'פנייה חדשה מהשאלון באתר', actor: null });
  const { data: staff } = await db.from('profiles').select('id').eq('role', 'owner');
  if (staff?.length) {
    await db.from('notifications').insert(staff.map((s) => ({ user_id: s.id, kind: 'new_lead', ref_entity: 'lead', ref_id: lead.id })));
  }

  try {
    await notify({ id: lead.id, parent_name: d.parent_name, phone: d.phone, child_age: d.child_age, duplicate: !!prev });
    await db.from('leads').update({ notified_at: new Date().toISOString() }).eq('id', lead.id);
  } catch (e) {
    console.error('notify_failed', (e as Error)?.name ?? 'error'); // lead is saved; email can be retried
  }

  return json(200, { ok: true }, h);
});
