-- supabase/tests/automations.sql — automation behaviour with synthetic data; fully rolled back.
do $$
declare l1 uuid; l2 uuid; l3 uuid; n int; t timestamptz; r text := '';
begin
  -- A1: new lead creates exactly one "contact" task due tomorrow 10:00 Israel time
  insert into public.leads (parent_name, phone, phone_normalized, consent_at, signed_name, stage_id)
  values ('אוטו-בדיקה', '0500000099', '972500000099', now(), 'x', public.first_open_stage()) returning id into l1;
  select count(*), max(due_at) into n, t from public.tasks where lead_id = l1;
  r := r || format(E'\n%s new lead → tasks = %s (expect 1)', case when n = 1 then 'PASS' else 'FAIL' end, n);
  r := r || format(E'\n%s due at 10:00 Israel = %s', case when to_char(t at time zone 'Asia/Jerusalem', 'HH24:MI') = '10:00' then 'PASS' else 'FAIL' end, to_char(t at time zone 'Asia/Jerusalem', 'DD/MM HH24:MI'));

  -- duplicates do not get a task
  insert into public.leads (parent_name, phone, phone_normalized, consent_at, signed_name, stage_id, duplicate_of)
  values ('אוטו-בדיקה', '0500000099', '972500000099', now(), 'x', public.first_open_stage(), l1) returning id into l2;
  select count(*) into n from public.tasks where lead_id = l2;
  r := r || format(E'\n%s duplicate lead → tasks = %s (expect 0)', case when n = 0 then 'PASS' else 'FAIL' end, n);

  -- paused automation does nothing
  update public.automations set enabled = false where key = 'new_lead_task';
  insert into public.leads (parent_name, phone, phone_normalized, consent_at, signed_name, stage_id)
  values ('אוטו-בדיקה 3', '0500000098', '972500000098', now(), 'x', public.first_open_stage()) returning id into l3;
  select count(*) into n from public.tasks where lead_id = l3;
  r := r || format(E'\n%s paused automation → tasks = %s (expect 0)', case when n = 0 then 'PASS' else 'FAIL' end, n);
  update public.automations set enabled = true where key = 'new_lead_task';

  -- A2: stale lead flagged once
  update public.leads set created_at = now() - interval '3 days' where id = l1;
  n := private.flag_stale_leads();
  r := r || format(E'\n%s stale run 1 flagged = %s (expect 1)', case when n = 1 then 'PASS' else 'FAIL' end, n);
  select count(*) into n from public.leads where id = l1 and priority = 'high';
  r := r || format(E'\n%s stale lead priority high = %s', case when n = 1 then 'PASS' else 'FAIL' end, n);
  n := private.flag_stale_leads();
  r := r || format(E'\n%s stale run 2 flagged = %s (expect 0, idempotent)', case when n = 0 then 'PASS' else 'FAIL' end, n);
  select count(*) into n from public.activities where entity_id = l1 and kind = 'automation';
  r := r || format(E'\n%s automation activity logged = %s (expect 1)', case when n = 1 then 'PASS' else 'FAIL' end, n);
  select count(*) into n from public.automation_runs where entity_id = l1;
  r := r || format(E'\n%s run log rows for lead = %s (expect 2)', case when n = 2 then 'PASS' else 'FAIL' end, n);

  raise exception 'AUTOMATION TEST REPORT (rolled back):%', r;
end $$;
