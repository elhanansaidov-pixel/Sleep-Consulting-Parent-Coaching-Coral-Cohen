-- 0006_lead_intake.sql — support for the public submit-lead Edge Function

alter table public.leads add column if not exists notified_at timestamptz;

-- Atomic per-IP-hash counter for the current hour. Only the service role (Edge Function) may call it.
create or replace function public.bump_submit_rate(p_ip_hash text)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.submit_rate (ip_hash, window_start, count)
  values (p_ip_hash, date_trunc('hour', now()), 1)
  on conflict (ip_hash, window_start) do update set count = public.submit_rate.count + 1
  returning count into n;
  -- housekeeping: drop windows older than a day
  delete from public.submit_rate where window_start < now() - interval '1 day';
  return n;
end $$;
revoke all on function public.bump_submit_rate(text) from public, anon, authenticated;
grant execute on function public.bump_submit_rate(text) to service_role;

-- First "open" stage = where new leads start.
create or replace function public.first_open_stage()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.pipeline_stages where kind = 'open' order by position limit 1
$$;
revoke all on function public.first_open_stage() from public, anon, authenticated;
grant execute on function public.first_open_stage() to service_role;
