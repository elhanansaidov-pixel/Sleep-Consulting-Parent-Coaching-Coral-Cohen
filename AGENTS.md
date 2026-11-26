# AGENTS.md — guidance for AI agents (Codex, Claude Code, others)

## Project
Hebrew (RTL) landing page for **Coral Cohen — sleep consulting & parent coaching**, plus a private lead CRM.
Source of truth: `docs/brief.md`, `docs/questionnaire.md`, `docs/decisions.md`, `docs/copy.md`.

## Stack
- `site/` — Astro 5 (static output), TypeScript, plain CSS with design tokens, GSAP ScrollTrigger + Lenis.
- `supabase/` — Postgres migrations (RLS on every table) and the `submit-lead` Edge Function.
- Hosting: Cloudflare Pages. Merging to `main` publishes to production — **only with explicit owner approval**.

## Hard rules
- Never remove or reword questionnaire questions (`docs/questionnaire.md`).
- Never invent testimonials, credentials, statistics or outcome promises in copy.
- Lead data includes information about minors: it must never be readable by the anon role; only the admin user may read/update/delete.
- No secrets in the repo. No third-party tracking pixels or cookies.
- Keep dependencies minimal; do not add frameworks or UI libraries without a P0/P1 reason.

## Code review focus (for Codex reviews)
Priority order:
- **P0 — Security:** Supabase RLS policies, Edge Function input validation (schema, lengths, honeypot, Turnstile verification, rate limit), secrets exposure, CSP and security headers, XSS in the admin view (all lead text is untrusted user input).
- **P1 — Correctness & accessibility:** multi-step form (validation, required fields, autosave/restore, submit/error/success states), RTL layout bugs, WCAG 2.1 AA / Israeli Standard 5568 (labels, focus order and visibility, contrast, `prefers-reduced-motion`, error announcements).
- **P2 — Performance:** LCP < 2.5s mobile, CLS < 0.05, lazy-loaded video, image formats, JS bundle size.
- **P3 — Maintainability / nits.**

Report each finding as: severity (P0–P3), `file:line`, problem, concrete fix.

## Commands (once scaffolded)
```bash
cd site && npm ci && npm run check && npm run build && npm run test
```
