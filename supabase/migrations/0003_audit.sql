-- 0003_audit.sql — audit trail (who did what, which fields — never the values)

create or replace function public.audit_row()
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

do $$
declare t text;
begin
  foreach t in array array['leads','clients','deals','programs','pipeline_stages','profiles'] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
  end loop;
end $$;

-- Record that a staff member opened a lead (reading sensitive answers).
create or replace function public.log_lead_view(p_lead_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.audit_log (actor, action, table_name, row_id)
  values ((select auth.uid()), 'view', 'leads', p_lead_id);
end $$;

revoke all on function public.audit_row() from public, anon, authenticated;
revoke all on function public.log_lead_view(uuid) from public, anon;
grant execute on function public.log_lead_view(uuid) to authenticated;
