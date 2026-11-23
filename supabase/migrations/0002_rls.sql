-- 0002_rls.sql — authorization, enforced in the database.
-- Data access requires: a staff profile AND an MFA-verified session (aal2).
--   owner       → full read/write/delete
--   tech_admin  → read everything; may edit pipeline stages only; no deletes
--   anon        → nothing (writes from the website go through the submit-lead Edge Function)

-- ── role helpers ─────────────────────────────────────────────────────────
create or replace function public.mfa_ok()
returns boolean language sql stable set search_path = '' as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
$$;

create or replace function public.my_role()
returns public.app_role language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = (select auth.uid())
$$;

create or replace function public.is_staff()
returns boolean language sql stable set search_path = '' as $$
  select public.mfa_ok() and public.my_role() is not null
$$;

create or replace function public.is_owner()
returns boolean language sql stable set search_path = '' as $$
  select public.mfa_ok() and public.my_role() = 'owner'
$$;

-- ── lock down default grants ─────────────────────────────────────────────
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon, public;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon, public;

grant execute on function public.mfa_ok(), public.my_role(), public.is_staff(), public.is_owner() to authenticated;

-- submit_rate is service-role only
revoke all on public.submit_rate from authenticated;

-- ── profiles ─────────────────────────────────────────────────────────────
-- A user may read their own profile (needed before MFA to know the role); staff read all.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_staff());
-- no insert/update/delete policies: profiles are managed by migrations / service role.

-- ── standard business tables ─────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['clients','leads','deals','programs','sessions','tasks','activities'] loop
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_staff())', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.is_owner())', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.is_owner()) with check (public.is_owner())', t, t);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (public.is_owner())', t, t);
  end loop;
end $$;

-- ── pipeline stages: settings editable by both staff roles; delete by owner ──
create policy pipeline_stages_select on public.pipeline_stages for select to authenticated using (public.is_staff());
create policy pipeline_stages_insert on public.pipeline_stages for insert to authenticated with check (public.is_staff());
create policy pipeline_stages_update on public.pipeline_stages for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy pipeline_stages_delete on public.pipeline_stages for delete to authenticated using (public.is_owner());

-- ── notifications: each user sees and marks only their own ───────────────
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and public.is_staff());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid()) and public.is_staff())
  with check (user_id = (select auth.uid()));

-- ── audit log: readable by staff, written only by triggers ───────────────
create policy audit_log_select on public.audit_log for select to authenticated using (public.is_staff());
revoke insert, update, delete on public.audit_log from authenticated;
