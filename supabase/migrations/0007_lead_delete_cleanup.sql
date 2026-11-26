-- 0007_lead_delete_cleanup.sql — deleting a lead also removes its timeline entries and
-- notifications (polymorphic rows have no FK). Audit log rows (no PII) are kept.
create or replace function private.cleanup_lead_refs()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.activities    where entity = 'lead' and entity_id = old.id;
  delete from public.notifications where ref_entity = 'lead' and ref_id = old.id;
  return old;
end $$;
revoke all on function private.cleanup_lead_refs() from public, anon, authenticated;
create trigger leads_cleanup_refs after delete on public.leads
  for each row execute function private.cleanup_lead_refs();

-- one-off: remove orphans left by an earlier test deletion
delete from public.notifications n where n.ref_entity = 'lead' and not exists (select 1 from public.leads l where l.id = n.ref_id);
