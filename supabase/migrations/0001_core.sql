-- 0001_core.sql — Coral Cohen CRM: core schema
-- Every table has RLS enabled (policies in 0002). The anon role gets no access at all.

-- ── enums ────────────────────────────────────────────────────────────────
create type public.app_role       as enum ('owner', 'tech_admin');
create type public.service_kind   as enum ('sleep', 'parenting');
create type public.stage_kind     as enum ('open', 'won', 'lost');
create type public.priority_level as enum ('low', 'normal', 'high');
create type public.payment_status as enum ('unpaid', 'partial', 'paid');
create type public.program_status as enum ('active', 'paused', 'completed');
create type public.session_kind   as enum ('intro', 'weekly', 'parenting');
create type public.task_status    as enum ('open', 'done', 'cancelled');
create type public.entity_kind    as enum ('lead', 'client', 'deal', 'program', 'task');

-- ── helpers ──────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── profiles (one row per staff user) ────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  role        public.app_role not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── pipeline stages (editable) ───────────────────────────────────────────
create table public.pipeline_stages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  position    smallint not null,
  kind        public.stage_kind not null default 'open',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (position)
);

-- ── clients (families) ───────────────────────────────────────────────────
create table public.clients (
  id                    uuid primary key default gen_random_uuid(),
  parent_names          text not null check (char_length(parent_names) <= 200),
  phone                 text check (char_length(phone) <= 30),
  phone_normalized      text,
  email                 text check (char_length(email) <= 200),
  tags                  text[] not null default '{}',
  notes                 text check (char_length(notes) <= 10000),
  created_from_lead_id  uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── leads (questionnaire submissions) ────────────────────────────────────
create table public.leads (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  source             text not null default 'website_sleep_form' check (char_length(source) <= 60),
  service            public.service_kind not null default 'sleep',
  stage_id           uuid references public.pipeline_stages (id) on delete set null,
  priority           public.priority_level not null default 'normal',
  next_follow_up_at  timestamptz,
  first_contact_at   timestamptz,
  parent_name        text not null check (char_length(parent_name) <= 200),
  phone              text not null check (char_length(phone) <= 30),
  phone_normalized   text not null,
  email              text check (char_length(email) <= 200),
  child_age          text check (char_length(child_age) <= 100),
  answers            jsonb not null default '{}'::jsonb,
  consent_at         timestamptz not null,
  signed_name        text not null check (char_length(signed_name) <= 200),
  duplicate_of       uuid references public.leads (id) on delete set null,
  client_id          uuid references public.clients (id) on delete set null,
  lost_reason        text check (char_length(lost_reason) <= 500)
);
alter table public.clients
  add constraint clients_created_from_lead_fk
  foreign key (created_from_lead_id) references public.leads (id) on delete set null;

-- ── deals ────────────────────────────────────────────────────────────────
create table public.deals (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients (id) on delete cascade,
  lead_id         uuid references public.leads (id) on delete set null,
  service         public.service_kind not null,
  title           text check (char_length(title) <= 200),
  amount          numeric(10,2) check (amount >= 0),
  stage_id        uuid references public.pipeline_stages (id) on delete set null,
  expected_close  date,
  payment_status  public.payment_status not null default 'unpaid',
  paid_amount     numeric(10,2) not null default 0 check (paid_amount >= 0),
  closed_at       timestamptz,
  lost_reason     text check (char_length(lost_reason) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── programs (the actual coaching process) ───────────────────────────────
create table public.programs (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients (id) on delete cascade,
  deal_id          uuid references public.deals (id) on delete set null,
  service          public.service_kind not null,
  start_date       date not null default current_date,
  current_week     smallint check (current_week between 1 and 8),
  current_stage    smallint check (current_stage between 1 and 4),
  next_session_at  timestamptz,
  status           public.program_status not null default 'active',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.sessions (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs (id) on delete cascade,
  held_at     timestamptz not null default now(),
  kind        public.session_kind not null,
  summary     text check (char_length(summary) <= 10000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── tasks ────────────────────────────────────────────────────────────────
create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(title) between 1 and 300),
  details       text check (char_length(details) <= 5000),
  due_at        timestamptz,
  priority      public.priority_level not null default 'normal',
  status        public.task_status not null default 'open',
  lead_id       uuid references public.leads (id) on delete cascade,
  client_id     uuid references public.clients (id) on delete cascade,
  deal_id       uuid references public.deals (id) on delete cascade,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── activity timeline ────────────────────────────────────────────────────
create table public.activities (
  id          uuid primary key default gen_random_uuid(),
  entity      public.entity_kind not null,
  entity_id   uuid not null,
  kind        text not null check (char_length(kind) <= 40),
  body        text check (char_length(body) <= 10000),
  actor       uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

-- ── in-app notifications ─────────────────────────────────────────────────
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (char_length(kind) <= 40),
  ref_entity  public.entity_kind,
  ref_id      uuid,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- ── audit log (field names only, never values) ───────────────────────────
create table public.audit_log (
  id              bigint generated always as identity primary key,
  at              timestamptz not null default now(),
  actor           uuid,
  action          text not null,
  table_name      text not null,
  row_id          uuid,
  changed_fields  text[]
);

-- ── submission rate limiting (service role only) ─────────────────────────
create table public.submit_rate (
  ip_hash       text not null,
  window_start  timestamptz not null,
  count         integer not null default 0,
  primary key (ip_hash, window_start)
);

-- ── indexes ──────────────────────────────────────────────────────────────
create index leads_stage_idx        on public.leads (stage_id);
create index leads_created_idx      on public.leads (created_at desc);
create index leads_followup_idx     on public.leads (next_follow_up_at) where next_follow_up_at is not null;
create index leads_phone_idx        on public.leads (phone_normalized);
create index clients_phone_idx      on public.clients (phone_normalized);
create index deals_stage_idx        on public.deals (stage_id);
create index deals_client_idx       on public.deals (client_id);
create index programs_client_idx    on public.programs (client_id);
create index programs_status_idx    on public.programs (status);
create index sessions_program_idx   on public.sessions (program_id, held_at desc);
create index tasks_due_idx          on public.tasks (status, due_at);
create index activities_entity_idx  on public.activities (entity, entity_id, created_at desc);
create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);
create index audit_at_idx           on public.audit_log (at desc);

-- ── updated_at triggers ──────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['profiles','pipeline_stages','clients','leads','deals','programs','sessions','tasks'] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ── enable RLS everywhere ────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['profiles','pipeline_stages','clients','leads','deals','programs','sessions','tasks','activities','notifications','audit_log','submit_rate'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
