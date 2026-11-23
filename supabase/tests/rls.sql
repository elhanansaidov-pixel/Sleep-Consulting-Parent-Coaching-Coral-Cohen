-- supabase/tests/rls.sql — authorization tests with synthetic data.
-- The whole block ends with RAISE EXCEPTION, so EVERYTHING is rolled back; the
-- exception message carries the PASS/FAIL report. Safe to run against production.
do $$
declare
  owner_id uuid := gen_random_uuid();
  tech_id  uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  lead_id  uuid;
  stage_id uuid;
  n int;
  report text := '';
  ok boolean;

begin
  -- synthetic users + profiles
  insert into auth.users (id, email, aud, role) values
    (owner_id, 'rls-owner@test.invalid', 'authenticated', 'authenticated'),
    (tech_id,  'rls-tech@test.invalid',  'authenticated', 'authenticated'),
    (stranger, 'rls-x@test.invalid',     'authenticated', 'authenticated');
  insert into public.profiles (id, full_name, role) values
    (owner_id, 'Test Owner', 'owner'), (tech_id, 'Test Tech', 'tech_admin');
  select id into stage_id from public.pipeline_stages order by position limit 1;
  insert into public.leads (parent_name, phone, phone_normalized, consent_at, signed_name, stage_id, answers)
  values ('בדיקה', '0500000000', '972500000000', now(), 'בדיקה', stage_id, '{"q5":"synthetic"}')
  returning id into lead_id;

  -- 1. anon cannot read leads
  execute 'set local role anon';
  begin
    execute 'select count(*) from public.leads' into n; ok := false;
  exception when insufficient_privilege then ok := true; end;
  report := report || format(E'\n%s anon read leads → denied', case when ok then 'PASS' else 'FAIL' end);

  -- 2. anon cannot insert leads
  begin
    execute $q$insert into public.leads (parent_name, phone, phone_normalized, consent_at, signed_name) values ('x','1','1',now(),'x')$q$; ok := false;
  exception when insufficient_privilege then ok := true; end;
  report := report || format(E'\n%s anon insert lead → denied', case when ok then 'PASS' else 'FAIL' end);

  -- 3. anon cannot log lead views
  begin
    execute format('insert into public.lead_views (lead_id, actor) values (%L, %L)', lead_id, owner_id); ok := false;
  exception when insufficient_privilege then ok := true; end;
  report := report || format(E'\n%s anon insert lead_view → denied', case when ok then 'PASS' else 'FAIL' end);
  execute 'reset role';

  -- helper: become an authenticated user with given aal
  -- 4. signed-in user without a staff profile sees nothing
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'select count(*) from public.leads' into n;
  report := report || format(E'\n%s non-staff user sees leads = %s (expect 0)', case when n = 0 then 'PASS' else 'FAIL' end, n);

  -- 5. tech_admin WITHOUT MFA (aal1) sees nothing
  perform set_config('request.jwt.claims', json_build_object('sub', tech_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'select count(*) from public.leads' into n;
  report := report || format(E'\n%s tech_admin aal1 sees leads = %s (expect 0)', case when n = 0 then 'PASS' else 'FAIL' end, n);

  -- 6. tech_admin WITH MFA reads
  perform set_config('request.jwt.claims', json_build_object('sub', tech_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'select count(*) from public.leads where id = $1' into n using lead_id;
  report := report || format(E'\n%s tech_admin aal2 reads lead = %s (expect 1)', case when n = 1 then 'PASS' else 'FAIL' end, n);

  -- 7. tech_admin cannot update / delete leads (0 rows affected)
  execute 'update public.leads set priority = ''high'' where id = $1' using lead_id; get diagnostics n = row_count;
  report := report || format(E'\n%s tech_admin update lead rows = %s (expect 0)', case when n = 0 then 'PASS' else 'FAIL' end, n);
  execute 'delete from public.leads where id = $1' using lead_id; get diagnostics n = row_count;
  report := report || format(E'\n%s tech_admin delete lead rows = %s (expect 0)', case when n = 0 then 'PASS' else 'FAIL' end, n);

  -- 8. tech_admin cannot insert business rows
  begin
    execute $q$insert into public.clients (parent_names) values ('x')$q$; ok := false;
  exception when insufficient_privilege then ok := true; end;
  report := report || format(E'\n%s tech_admin insert client → denied', case when ok then 'PASS' else 'FAIL' end);

  -- 9. tech_admin may edit pipeline stage names (settings)
  execute 'update public.pipeline_stages set name = name where id = $1' using stage_id; get diagnostics n = row_count;
  report := report || format(E'\n%s tech_admin edit stage rows = %s (expect 1)', case when n = 1 then 'PASS' else 'FAIL' end, n);

  -- 10. tech_admin cannot touch submit_rate
  begin
    execute 'select count(*) from public.submit_rate' into n; ok := false;
  exception when insufficient_privilege then ok := true; end;
  report := report || format(E'\n%s tech_admin read submit_rate → denied', case when ok then 'PASS' else 'FAIL' end);

  -- 11. tech_admin can log a view as themselves, but not spoof another actor
  execute format('insert into public.lead_views (lead_id) values (%L)', lead_id);
  report := report || E'\nPASS tech_admin insert own lead_view → allowed';
  begin
    execute format('insert into public.lead_views (lead_id, actor) values (%L, %L)', lead_id, owner_id); ok := false;
  exception when insufficient_privilege then ok := true; end;
  report := report || format(E'\n%s tech_admin spoof lead_view actor → denied', case when ok then 'PASS' else 'FAIL' end);

  -- 12. owner WITHOUT MFA sees nothing
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'select count(*) from public.leads' into n;
  report := report || format(E'\n%s owner aal1 sees leads = %s (expect 0)', case when n = 0 then 'PASS' else 'FAIL' end, n);

  -- 13. owner WITH MFA: read, update, insert, delete
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'update public.leads set priority = ''high'' where id = $1' using lead_id; get diagnostics n = row_count;
  report := report || format(E'\n%s owner update lead rows = %s (expect 1)', case when n = 1 then 'PASS' else 'FAIL' end, n);
  execute $q$insert into public.clients (parent_names) values ('משפחת בדיקה')$q$; get diagnostics n = row_count;
  report := report || format(E'\n%s owner insert client rows = %s (expect 1)', case when n = 1 then 'PASS' else 'FAIL' end, n);

  -- 14. audit row stores field names, not values
  execute $q$select count(*) from public.audit_log where table_name = 'leads' and action = 'update' and changed_fields = array['priority']$q$ into n;
  report := report || format(E'\n%s audit update recorded field names only = %s (expect 1)', case when n = 1 then 'PASS' else 'FAIL' end, n);
  execute 'select count(*) from public.audit_log where action = ''view'' and row_id = $1' into n using lead_id;
  report := report || format(E'\n%s audit view recorded = %s (expect 1)', case when n = 1 then 'PASS' else 'FAIL' end, n);

  -- 15. nobody can write to audit_log directly
  begin
    execute $q$insert into public.audit_log (action, table_name) values ('fake','x')$q$; ok := false;
  exception when insufficient_privilege then ok := true; end;
  report := report || format(E'\n%s owner direct audit insert → denied', case when ok then 'PASS' else 'FAIL' end);

  -- 16. helper functions are not reachable as RPC by anon
  execute 'reset role';
  execute 'set local role anon';
  begin
    execute 'select private.my_role()'; ok := false;
  exception when insufficient_privilege then ok := true; end;
  report := report || format(E'\n%s anon private.my_role() → denied', case when ok then 'PASS' else 'FAIL' end);
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);

  execute 'delete from public.leads where id = $1' using lead_id; get diagnostics n = row_count;
  report := report || format(E'\n%s owner delete lead rows = %s (expect 1)', case when n = 1 then 'PASS' else 'FAIL' end, n);

  execute 'reset role';
  raise exception 'RLS TEST REPORT (rolled back):%', report;
end $$;
