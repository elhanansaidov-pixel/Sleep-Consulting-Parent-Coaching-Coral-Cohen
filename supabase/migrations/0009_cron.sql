-- 0009_cron.sql — scheduled jobs (pg_cron + pg_net). Requires:
--   create extension pg_cron; create extension pg_net;
--   vault secret 'digest_key' (same value as the DIGEST_KEY function secret; created outside the repo)

-- Daily digest to the owner, 05:30 UTC (07:30 Israel winter / 08:30 summer)
select cron.schedule(
  'daily-digest',
  '30 5 * * *',
  $$
  select net.http_post(
    url := 'https://fvkeawbtwbqcvtbqjwem.supabase.co/functions/v1/daily-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-digest-key', (select decrypted_secret from vault.decrypted_secrets where name = 'digest_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Retention: purge leads that never became a family after 12 months (03:15 UTC daily)
select cron.schedule('purge-old-leads', '15 3 * * *', $$ select private.purge_old_leads(); $$);
