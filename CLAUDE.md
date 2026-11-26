# CLAUDE.md

## שפה — כלל מחייב
**מדברים עם בעל הפרויקט בעברית בלבד.** כל הודעה, סיכום, שאלה, הסבר ודיווח — בעברית, ללא יוצא מן הכלל.
אנגלית מותרת רק בתוך קוד, פקודות, שמות קבצים, הודעות commit, ותיאורי Pull Request.

Read `AGENTS.md` first — the same rules apply to Claude Code.

Workflow:
- Each stage on its own branch + PR → Cloudflare preview URL → `@codex review` → fix → owner approval → merge.
- Record every non-trivial decision in `docs/decisions.md`.
- Higgsfield source assets go to `assets/source/` (originals) and optimized versions to `site/public/`.
- User-facing communication is in Hebrew.
