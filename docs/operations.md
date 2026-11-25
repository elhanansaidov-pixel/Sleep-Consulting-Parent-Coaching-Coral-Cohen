# תחזוקה, פריסה וחזרה לאחור — קורל כהן (אתר + CRM)

> מסמך לבעל הפרויקט / מתחזק טכני. מדריך השימוש לקורל: `docs/coral-guide.md` (וגם בתוך המערכת: מסך "מדריך").

## 1. מפת המערכת
| רכיב | איפה | הערות |
|---|---|---|
| דף נחיתה + CRM (`/admin`) | Cloudflare Workers (static assets), Worker `coral-cohen-sleep` | חשבון Cloudflare של בעל הפרויקט |
| כתובת ראשית | https://coral-cohen-sleep.coral-cohen-site.workers.dev | ‏Production |
| תצוגה מקדימה | https://preview-coral-cohen-sleep.coral-cohen-site.workers.dev | ‏`noindex` אוטומטי |
| בסיס נתונים + Auth + Functions | Supabase, ארגון "Coral Cohen", פרויקט `coral-cohen-crm` (`fvkeawbtwbqcvtbqjwem`), פרנקפורט, Free | פרטים: `supabase/README.md` |
| מיילים | Gmail SMTP: `systems.notify1@gmail.com` (סיסמת אפליקציה `coral-crm`) | Auth + התראות + מייל בוקר |
| הגנת ספאם | Cloudflare Turnstile, widget `coral-cohen-questionnaire` | סוד ב-Supabase |
| קוד | GitHub: `elhanansaidov-pixel/Sleep-Consulting-Parent-Coaching-Coral-Cohen` | ענף עבודה: `claude/admiring-knuth-pi1u07` |

## 2. פריסה (Deploy)
```bash
cd site
npm ci
npm run check && npm run build
npx wrangler versions upload --preview-alias preview   # תצוגה מקדימה בלבד
npx wrangler deploy                                     # Production — רק באישור בעל הפרויקט
```
- Cloudflare מגביל קצב העלאות; בשגיאת "Retry-After" ממתינים 1–3 דקות.
- Edge Functions: `POST /v1/projects/{ref}/functions/deploy?slug=<name>` (ראו `supabase/README.md`).
- מיגרציות: מריצים לפי הסדר `supabase/migrations/00NN_*.sql`. אחרי כל מיגרציה: `tests/rls.sql` + `tests/automations.sql` + Security Advisor.

## 3. חזרה לאחור (Rollback)
| מה נשבר | מה עושים |
|---|---|
| גרסת אתר/CRM | `npx wrangler deployments list` → `npx wrangler rollback <version-id>` (מיידי, ללא בנייה מחדש) |
| Edge Function | פריסה מחדש של הקובץ מהקומיט התקין האחרון (`git checkout <sha> -- supabase/functions/<name>`) |
| מיגרציה | אין rollback אוטומטי. כותבים מיגרציה הפוכה (drop/alter), בודקים קודם בטרנזקציה עם `ROLLBACK` |
| אוטומציה מתנהגת לא נכון | מסך הגדרות → מתג כיבוי (מיידי). או: `update public.automations set enabled=false where key='...'` |
| מייל בוקר | `select cron.unschedule('daily-digest');` (להחזרה: להריץ שוב את `0009_cron.sql`) |

## 4. סודות ומפתחות (ערכים לא נשמרים במאגר)
| סוד | איפה | רוטציה |
|---|---|---|
| `SMTP_PASSWORD` | Supabase → Edge Functions → Secrets **וגם** Auth → SMTP | Google → App passwords → ליצור חדשה, להחליף בשני המקומות, למחוק את הישנה |
| `TURNSTILE_SECRET` | Supabase secrets | Cloudflare → Turnstile → Rotate secret → לעדכן ב-Supabase |
| `VAPID_*` | Supabase secrets + מפתח ציבורי ב-`site/src/admin/lib/config.ts` | החלפה מנתקת את כל המכשירים הרשומים — צריך להפעיל התראות מחדש |
| `DIGEST_KEY` | Supabase secrets + Vault `digest_key` | ליצור ערך חדש ולעדכן בשניהם |
| `IP_HASH_SALT` | Supabase secrets | לא חובה |
| מפתח Supabase PAT (לסשנים של Claude) | הגדרות הסביבה ב-claude.ai (Network secrets) | למחוק בסיום העבודה |

## 5. גיבויים ושמירת מידע
- בתוכנית החינמית אין PITR. גיבוי: קורל מייצאת CSV פעם בחודש (מסך פניות). לגיבוי מלא: Supabase Pro (~25$/חודש) — החלטה עסקית.
- פניות שלא הפכו למשפחה נמחקות אחרי 12 חודשים (`purge-old-leads`).
- הפרויקט החינמי עלול להיות מושהה אחרי 7 ימי חוסר פעילות. בפועל מייל הבוקר וה-cron השעתי שומרים אותו פעיל; אם הושהה — Dashboard → Restore.

## 6. משתמשים
- הזמנת משתמש: `POST /auth/v1/invite` (מפתח secret נשלף בזמן ריצה) + שורת `profiles` עם תפקיד (`owner`/`tech_admin`).
- איפוס MFA (טלפון אבד): `delete from auth.mfa_factors where user_id = '<id>';` — בכניסה הבאה המשתמש מגדיר מחדש.
- הרשמה עצמית חסומה; סיסמה ≥ 12 תווים; MFA חובה לגישה לנתונים.

## 7. בדיקות
| בדיקה | איך |
|---|---|
| הרשאות (21) | `tests/rls.sql` דרך Management API (מסתיים ב-RAISE → הכול מתבטל) |
| אוטומציות (9) | `tests/automations.sql` (אותו מנגנון) |
| E2E | `tests/e2e/*.cjs` עם משתמש סינתטי שנמחק בסוף |
| נגישות | `tests/e2e/a11y.cjs` (axe, 23 מסכים) |
| ביצועים/SEO | Lighthouse על הכתובת הראשית |

## 8. ניקוי פתוח (לבצע ידנית)
- [ ] אחרי שקורל נכנסת: להחזיר תוקף קישורי מייל לשעה (`mailer_otp_exp = 3600`).
- [ ] בסוף העבודה: למחוק את מפתח ה-Supabase מ-Network secrets של סביבת Default ב-claude.ai, ואת הכתובות הזמניות מרשימת ה-allowed hosts אם אין בהן צורך.
- [ ] אם יירכש דומיין: לעדכן `site` ב-`astro.config.mjs`, `robots.txt`, `ALLOWED_ORIGINS` ב-`submit-lead`, Turnstile domains, ו-Auth redirect URLs.
