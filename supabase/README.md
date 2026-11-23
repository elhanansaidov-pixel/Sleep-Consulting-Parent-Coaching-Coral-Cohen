# Supabase — Coral Cohen CRM

- **Project:** `coral-cohen-crm` (ref `fvkeawbtwbqcvtbqjwem`), region `eu-central-1`, Free plan, org "Coral Cohen".
- **Access from Claude sessions:** Supabase Management API (`api.supabase.com`) with a personal access token stored as an environment network secret (never in the repo).

## Migrations
Apply in order (`migrations/0001…0005`). They are idempotent only on a fresh database.
```bash
# via Management API (what Claude uses)
POST /v1/projects/{ref}/database/query  {"query": "<file contents>"}
```

## Security model
- RLS on every table. `anon` has no grants at all.
- Data access requires a staff profile **and** an MFA-verified session (`aal2`).
- `owner`: full access · `tech_admin`: read all, edit pipeline stages only, no deletes.
- SECURITY DEFINER helpers live in the non-exposed `private` schema.
- `audit_log` stores actor, action, table, row id and **changed field names only**.

## Tests
- `tests/rls.sql` — 21 authorization checks with synthetic users. Ends with `RAISE EXCEPTION`, so everything rolls back; the error message is the PASS/FAIL report. Safe on production.
- `../tests/e2e/admin-auth.cjs` — browser E2E of the login + MFA flow. Create a temporary user with the admin API, run, then delete the user.

## Auth settings
Signup disabled · TOTP MFA enabled · password ≥ 12 chars with lower/upper/digit · Hebrew invite/recovery templates · SMTP via Gmail (`systems.notify1@gmail.com`, app password set in the dashboard) · site URL + redirect allow-list: the workers.dev preview/live URLs and localhost:4321.

## Staff
- Coral — `owner` (invited 2026-11-23) · technical admin — `tech_admin` (invited 2026-11-23).
- Invites are sent with `POST /auth/v1/invite` (secret key fetched at runtime, never stored); then insert the `profiles` row.
