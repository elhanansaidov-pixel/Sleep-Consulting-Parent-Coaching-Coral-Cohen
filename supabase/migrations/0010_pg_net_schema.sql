-- 0010_pg_net_schema.sql — register pg_net under the `extensions` schema (advisor: extension_in_public).
-- Its functions stay in the `net` schema, so the cron job (net.http_post) is unaffected.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
