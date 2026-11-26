-- 0013_assistant — in-app learning assistant (pilot). Additive only: new tables + one profile flag.
-- Privacy: usage_log stores event kinds and short non-personal codes only (screen ids, action ids,
-- FAQ ids, or the exact wording of an unanswered help question). Never names, phones or lead content.

-- Pilot flag: the assistant UI is shown only to profiles with this flag.
alter table public.profiles add column if not exists assistant_enabled boolean not null default false;

create table public.usage_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  at         timestamptz not null default now(),
  kind       text not null check (kind in ('screen', 'action', 'undo', 'help_q', 'help_miss', 'tour', 'tip')),
  detail     text check (char_length(detail) <= 200)
);
create index usage_log_user_at_idx on public.usage_log (user_id, at desc);
create index usage_log_kind_at_idx on public.usage_log (kind, at desc);
alter table public.usage_log enable row level security;

-- Each staff user can only add rows of their own; only the technical admin reads them.
create policy usage_log_insert on public.usage_log for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_staff());
create policy usage_log_select on public.usage_log for select to authenticated
  using (public.is_staff() and private.my_role() = 'tech_admin');

create table public.assistant_profile (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  profile    jsonb not null default '{}'::jsonb,
  snapshots  jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.assistant_profile enable row level security;
create policy assistant_profile_own_select on public.assistant_profile for select to authenticated
  using ((user_id = (select auth.uid()) and public.is_staff()) or (public.is_staff() and private.my_role() = 'tech_admin'));
create policy assistant_profile_own_insert on public.assistant_profile for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_staff());
create policy assistant_profile_own_update on public.assistant_profile for update to authenticated
  using (user_id = (select auth.uid()) and public.is_staff()) with check (user_id = (select auth.uid()));
create trigger assistant_profile_updated_at before update on public.assistant_profile
  for each row execute function public.set_updated_at();

grant select, insert on public.usage_log to authenticated;
grant select, insert, update on public.assistant_profile to authenticated;

-- Retention: usage rows older than 12 months are removed with the existing nightly purge.
create or replace function private.purge_old_usage()
returns void language sql security definer set search_path = '' as $$
  delete from public.usage_log where at < now() - interval '12 months';
$$;
revoke all on function private.purge_old_usage() from public, anon, authenticated;
select cron.schedule('purge-old-usage', '25 3 * * *', 'select private.purge_old_usage()');
