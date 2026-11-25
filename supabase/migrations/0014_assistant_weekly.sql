-- 0014_assistant_weekly — data for the weekly assistant summary (read by a scheduled Claude session
-- through the Management API). Counts and codes only; never touches leads/clients content.
-- Additive: two functions in the private schema, not callable by anon/authenticated.

create or replace function private.assistant_weekly_report(p_days int default 7)
returns jsonb language sql stable security definer set search_path = '' as $$
  with users as (
    select p.id, p.full_name, p.role from public.profiles p where p.assistant_enabled
  ),
  win as (
    select now() - make_interval(days => p_days) as cur_start,
           now() - make_interval(days => 2 * p_days) as prev_start
  ),
  rows as (
    select u.id as user_id, l.kind, l.detail, l.at,
           case when l.at >= w.cur_start then 'cur' else 'prev' end as period
    from users u join public.usage_log l on l.user_id = u.id, win w
    where l.at >= w.prev_start
  ),
  per_user as (
    select u.id, u.full_name, u.role,
      (select jsonb_object_agg(period, n) from (select period, count(*) n from rows r where r.user_id = u.id and r.kind = 'action' group by period) x) as actions,
      (select jsonb_object_agg(period, n) from (select period, count(*) n from rows r where r.user_id = u.id and r.kind = 'undo' group by period) x) as fixes,
      (select jsonb_object_agg(period, n) from (select period, count(*) n from rows r where r.user_id = u.id and r.kind = 'help_q' group by period) x) as questions,
      (select jsonb_object_agg(period, n) from (select period, count(distinct (r.at at time zone 'Asia/Jerusalem')::date) n from rows r where r.user_id = u.id group by period) x) as active_days,
      (select jsonb_object_agg(detail, n) from (select detail, count(*) n from rows r where r.user_id = u.id and r.period = 'cur' and r.kind = 'screen' group by detail) x) as screens,
      (select jsonb_object_agg(split_part(detail, ':', 1) || ':' || split_part(detail, ':', 2), n) from (select detail, count(*) n from rows r where r.user_id = u.id and r.period = 'cur' and r.kind = 'action' group by detail) x) as actions_by_kind,
      (select jsonb_object_agg(detail, n) from (select detail, count(*) n from rows r where r.user_id = u.id and r.period = 'cur' and r.kind = 'undo' group by detail) x) as fixes_by_topic,
      (select jsonb_object_agg(detail, n) from (select split_part(detail, ',', 1) as detail, count(*) n from rows r where r.user_id = u.id and r.period = 'cur' and r.kind = 'help_q' group by 1) x) as questions_by_faq,
      -- questions this week about a FAQ entry already asked before this week (= repeat questions)
      (select count(*) from rows r where r.user_id = u.id and r.period = 'cur' and r.kind = 'help_q'
         and exists (select 1 from public.usage_log o, win w where o.user_id = u.id and o.kind = 'help_q' and o.at < w.cur_start
                     and split_part(o.detail, ',', 1) = split_part(r.detail, ',', 1))) as repeat_questions_cur,
      (select count(*) from rows r, win w where r.user_id = u.id and r.period = 'prev' and r.kind = 'help_q'
         and exists (select 1 from public.usage_log o where o.user_id = u.id and o.kind = 'help_q' and o.at < w.prev_start
                     and split_part(o.detail, ',', 1) = split_part(r.detail, ',', 1))) as repeat_questions_prev,
      (select coalesce(jsonb_agg(distinct detail), '[]'::jsonb) from rows r where r.user_id = u.id and r.period = 'cur' and r.kind = 'help_miss') as unanswered,
      (select jsonb_object_agg(detail, n) from (select detail, count(*) n from rows r where r.user_id = u.id and r.period = 'cur' and r.kind = 'tour' group by detail) x) as tours,
      (select jsonb_object_agg(detail, n) from (select regexp_replace(detail, ':\d{4}-\d{2}(-\d{2})?', '') as detail, count(*) n from rows r where r.user_id = u.id and r.period = 'cur' and r.kind = 'tip' group by 1) x) as tips,
      (select ap.profile from public.assistant_profile ap where ap.user_id = u.id) as profile,
      (select ap.snapshots -> -1 from public.assistant_profile ap where ap.user_id = u.id) as last_snapshot
    from users u
  )
  select jsonb_build_object(
    'generated_at', now(),
    'days', p_days,
    'users', coalesce((select jsonb_agg(to_jsonb(pu)) from per_user pu), '[]'::jsonb)
  );
$$;

-- Append one weekly snapshot (keeps the last 52).
create or replace function private.assistant_save_snapshot(p_user uuid, p_snapshot jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.assistant_profile (user_id, snapshots) values (p_user, jsonb_build_array(p_snapshot))
  on conflict (user_id) do update
    set snapshots = (
      select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)
      from (select e, ord from jsonb_array_elements(public.assistant_profile.snapshots || jsonb_build_array(p_snapshot)) with ordinality as t(e, ord)) s
      where ord > jsonb_array_length(public.assistant_profile.snapshots) + 1 - 52
    );
end;
$$;

revoke all on function private.assistant_weekly_report(int) from public, anon, authenticated;
revoke all on function private.assistant_save_snapshot(uuid, jsonb) from public, anon, authenticated;
