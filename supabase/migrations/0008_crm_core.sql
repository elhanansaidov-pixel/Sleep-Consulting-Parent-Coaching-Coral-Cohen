-- 0008_crm_core.sql — stage D: lead → family conversion, deal/task helpers, retention

-- Convert a lead into a family (client) + an open deal, atomically.
-- SECURITY INVOKER: runs with the caller's RLS (only the owner can insert/update).
create or replace function public.convert_lead(p_lead uuid, p_amount numeric default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  l public.leads%rowtype;
  c_id uuid;
begin
  select * into l from public.leads where id = p_lead;
  if not found then raise exception 'lead not found' using errcode = 'P0002'; end if;
  if l.client_id is not null then return l.client_id; end if;

  -- reuse an existing family with the same phone, if any
  select id into c_id from public.clients where phone_normalized = l.phone_normalized limit 1;
  if c_id is null then
    insert into public.clients (parent_names, phone, phone_normalized, email, created_from_lead_id)
    values (l.parent_name, l.phone, l.phone_normalized, l.email, l.id)
    returning id into c_id;
    insert into public.activities (entity, entity_id, kind, body)
    values ('client', c_id, 'created', 'המשפחה נוצרה מפנייה בשאלון');
  end if;

  update public.leads set client_id = c_id where id = l.id;
  insert into public.deals (client_id, lead_id, service, amount, stage_id, title)
  values (c_id, l.id, l.service, p_amount, l.stage_id,
          case l.service when 'sleep' then 'ייעוץ שינה' else 'הדרכת הורים' end);
  insert into public.activities (entity, entity_id, kind, body)
  values ('lead', l.id, 'converted', 'הפנייה הפכה למשפחה ולעסקה');
  return c_id;
end $$;
revoke all on function public.convert_lead(uuid, numeric) from public, anon;
grant execute on function public.convert_lead(uuid, numeric) to authenticated;

-- Deals: stamp closed_at when entering a won/lost stage, clear it when reopened.
create or replace function private.deal_stage_stamp()
returns trigger language plpgsql set search_path = '' as $$
declare k public.stage_kind;
begin
  if new.stage_id is distinct from old.stage_id then
    select kind into k from public.pipeline_stages where id = new.stage_id;
    new.closed_at := case when k in ('won', 'lost') then now() else null end;
  end if;
  return new;
end $$;
revoke all on function private.deal_stage_stamp() from public, anon, authenticated;
create trigger deals_stage_stamp before update on public.deals
  for each row execute function private.deal_stage_stamp();

-- Tasks: stamp completed_at.
create or replace function private.task_done_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then new.completed_at := now(); end if;
  if new.status <> 'done' then new.completed_at := null; end if;
  return new;
end $$;
revoke all on function private.task_done_stamp() from public, anon, authenticated;
create trigger tasks_done_stamp before update on public.tasks
  for each row execute function private.task_done_stamp();

-- Deleting a client/deal/program removes their timeline rows (polymorphic, no FK).
create or replace function private.cleanup_entity_refs()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.activities    where entity::text = tg_argv[0] and entity_id = old.id;
  delete from public.notifications where ref_entity::text = tg_argv[0] and ref_id = old.id;
  return old;
end $$;
revoke all on function private.cleanup_entity_refs() from public, anon, authenticated;
create trigger clients_cleanup_refs  after delete on public.clients  for each row execute function private.cleanup_entity_refs('client');
create trigger deals_cleanup_refs    after delete on public.deals    for each row execute function private.cleanup_entity_refs('deal');
create trigger programs_cleanup_refs after delete on public.programs for each row execute function private.cleanup_entity_refs('program');

-- Retention (privacy policy): leads that never became a family are deleted 12 months after submission.
create or replace function private.purge_old_leads()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.leads where client_id is null and created_at < now() - interval '12 months';
  get diagnostics n = row_count;
  insert into public.audit_log (actor, action, table_name, changed_fields)
  values (null, 'retention_purge', 'leads', array[n::text]);
  return n;
end $$;
revoke all on function private.purge_old_leads() from public, anon, authenticated;

create index if not exists tasks_client_idx on public.tasks (client_id);
create index if not exists tasks_lead_idx   on public.tasks (lead_id);
create index if not exists deals_lead_idx   on public.deals (lead_id);
