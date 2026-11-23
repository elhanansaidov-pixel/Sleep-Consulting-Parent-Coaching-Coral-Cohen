-- 0005_hardening.sql — clear security-advisor warnings:
-- * SECURITY DEFINER helpers move to a non-exposed schema (no /rest/v1/rpc access)
-- * lead-view logging becomes an RLS-protected insert instead of a SECURITY DEFINER RPC

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.my_role()
returns public.app_role language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = (select auth.uid())
$$;
revoke all on function private.my_role() from public, anon;
grant execute on function private.my_role() to authenticated;

create or replace function public.is_staff()
returns boolean language sql stable set search_path = '' as $$
  select public.mfa_ok() and private.my_role() is not null
$$;

create or replace function public.is_owner()
returns boolean language sql stable set search_path = '' as $$
  select public.mfa_ok() and private.my_role() = 'owner'
$$;

drop function public.my_role();
drop function public.log_lead_view(uuid);

-- lead views: staff insert their own view events; a trigger mirrors them into audit_log
create table public.lead_views (
  id       bigint generated always as identity primary key,
  lead_id  uuid not null references public.leads (id) on delete cascade,
  actor    uuid not null default auth.uid(),
  at       timestamptz not null default now()
);
alter table public.lead_views enable row level security;
revoke all on public.lead_views from anon;
create policy lead_views_insert on public.lead_views for insert to authenticated
  with check (public.is_staff() and actor = (select auth.uid()));
create policy lead_views_select on public.lead_views for select to authenticated
  using (public.is_staff());

create or replace function private.lead_view_to_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor, action, table_name, row_id)
  values (new.actor, 'view', 'leads', new.lead_id);
  return new;
end $$;
revoke all on function private.lead_view_to_audit() from public, anon, authenticated;
create trigger lead_views_audit after insert on public.lead_views
  for each row execute function private.lead_view_to_audit();

-- audit_row is only ever used by triggers: move it out of the exposed schema too
create or replace function private.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  fields text[];
  rid uuid;
begin
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into fields
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key <> 'updated_at';
    rid := new.id;
  elsif tg_op = 'INSERT' then
    rid := new.id;
  else
    rid := old.id;
  end if;
  insert into public.audit_log (actor, action, table_name, row_id, changed_fields)
  values ((select auth.uid()), lower(tg_op), tg_table_name, rid, fields);
  return coalesce(new, old);
end $$;
revoke all on function private.audit_row() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['leads','clients','deals','programs','pipeline_stages','profiles'] loop
    execute format('drop trigger %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function private.audit_row()', t, t);
  end loop;
end $$;
drop function public.audit_row();

-- submit_rate: explicit deny-all policy documents intent (service role bypasses RLS)
create policy submit_rate_none on public.submit_rate for all to authenticated using (false) with check (false);
