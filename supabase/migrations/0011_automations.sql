-- 0011_automations.sql — stage F: pausable, idempotent, logged automations + push subscriptions

-- ── automation switches (owner can pause; tech_admin can view) ─────────────
create table public.automations (
  key          text primary key,
  label        text not null,
  enabled      boolean not null default true,
  updated_at   timestamptz not null default now()
);
alter table public.automations enable row level security;
revoke all on public.automations from anon;
create policy automations_select on public.automations for select to authenticated using (public.is_staff());
create policy automations_update on public.automations for update to authenticated using (public.is_owner()) with check (public.is_owner());
create trigger automations_updated_at before update on public.automations for each row execute function public.set_updated_at();
insert into public.automations (key, label) values
  ('new_lead_task',  'פנייה חדשה יוצרת משימה "ליצור קשר" למחרת'),
  ('stale_lead_flag','פנייה שלא טופלה 48 שעות מסומנת בעדיפות גבוהה'),
  ('new_lead_push',  'התראה בדפדפן/טלפון על פנייה חדשה');

-- ── run log: one row per (automation, entity) = idempotency + audit ────────
create table public.automation_runs (
  id          bigint generated always as identity primary key,
  automation  text not null references public.automations (key) on delete cascade,
  entity_id   uuid not null,
  status      text not null check (status in ('ok', 'error', 'skipped')),
  attempts    smallint not null default 1,
  detail      text check (char_length(detail) <= 500),
  ran_at      timestamptz not null default now(),
  unique (automation, entity_id)
);
alter table public.automation_runs enable row level security;
revoke all on public.automation_runs from anon;
create policy automation_runs_select on public.automation_runs for select to authenticated using (public.is_staff());
create index automation_runs_at_idx on public.automation_runs (ran_at desc);

create or replace function private.automation_on(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from public.automations where key = p_key), false)
$$;
revoke all on function private.automation_on(text) from public, anon, authenticated;

-- ── A1: new lead → "contact" task due tomorrow 10:00 Israel time ───────────
create or replace function private.auto_new_lead_task()
returns trigger language plpgsql security definer set search_path = '' as $$
declare due timestamptz;
begin
  if not private.automation_on('new_lead_task') then return new; end if;
  -- idempotency: the unique (automation, entity_id) makes a second run a no-op
  insert into public.automation_runs (automation, entity_id, status) values ('new_lead_task', new.id, 'ok')
  on conflict (automation, entity_id) do nothing;
  if not found then return new; end if;
  due := ((date_trunc('day', now() at time zone 'Asia/Jerusalem') + interval '1 day 10 hours') at time zone 'Asia/Jerusalem');
  insert into public.tasks (title, due_at, priority, lead_id)
  values ('ליצור קשר עם ' || new.parent_name, due, 'normal', new.id);
  return new;
exception when others then
  -- never block a lead from being saved because of an automation
  insert into public.automation_runs (automation, entity_id, status, detail)
  values ('new_lead_task', new.id, 'error', left(sqlerrm, 200))
  on conflict (automation, entity_id) do update set status = 'error', attempts = public.automation_runs.attempts + 1, detail = excluded.detail, ran_at = now();
  return new;
end $$;
revoke all on function private.auto_new_lead_task() from public, anon, authenticated;
create trigger leads_auto_task after insert on public.leads
  for each row when (new.duplicate_of is null) execute function private.auto_new_lead_task();

-- ── A2: lead still in the first stage after 48h → flag (once) ──────────────
create or replace function private.flag_stale_leads()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  if not private.automation_on('stale_lead_flag') then return 0; end if;
  for r in
    select l.id, l.parent_name from public.leads l
    where l.stage_id = public.first_open_stage()
      and l.created_at < now() - interval '48 hours'
      and l.duplicate_of is null
      and not exists (select 1 from public.automation_runs a where a.automation = 'stale_lead_flag' and a.entity_id = l.id)
    limit 200
  loop
    insert into public.automation_runs (automation, entity_id, status) values ('stale_lead_flag', r.id, 'ok')
    on conflict (automation, entity_id) do nothing;
    update public.leads set priority = 'high' where id = r.id;
    insert into public.activities (entity, entity_id, kind, body)
    values ('lead', r.id, 'automation', 'סומנה אוטומטית: לא טופלה 48 שעות');
    insert into public.notifications (user_id, kind, ref_entity, ref_id)
    select p.id, 'stale_lead', 'lead', r.id from public.profiles p where p.role = 'owner';
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function private.flag_stale_leads() from public, anon, authenticated;
select cron.schedule('flag-stale-leads', '7 * * * *', $$ select private.flag_stale_leads(); $$);

-- ── push subscriptions (each user manages only their own devices) ──────────
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null unique check (char_length(endpoint) <= 1000),
  p256dh      text not null check (char_length(p256dh) <= 200),
  auth        text not null check (char_length(auth) <= 100),
  user_agent  text check (char_length(user_agent) <= 300),
  created_at  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
create policy push_own_select on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()) and public.is_staff());
create policy push_own_insert on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()) and public.is_staff());
create policy push_own_delete on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));
