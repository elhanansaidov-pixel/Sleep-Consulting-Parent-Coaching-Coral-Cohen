/**
 * Guided on-screen tours. Each step can navigate (`path`, a hash route), spotlights the first
 * visible `[data-help="…"]` element, and with `waitClick` advances when that element is clicked.
 */
export type TourStep = { path?: string; target?: string; text: string; waitClick?: boolean };
export type Tour = { id: string; title: string; steps: TourStep[] };

export const TOURS: Tour[] = [
  { id: 'new-lead', title: 'טיפול בפנייה חדשה', steps: [
    { path: '#/leads', target: 'nav-leads', text: 'כל הפניות מהשאלון נמצאות במסך "פניות". החדשות ביותר למעלה.' },
    { target: 'lead-row', text: 'לחצי על שם ההורה כדי לפתוח את הפנייה.', waitClick: true },
    { target: 'lead-whatsapp', text: 'מכאן כותבים להורה בוואטסאפ בלחיצה אחת. יש גם כפתור חיוג.' },
    { target: 'lead-stage', text: 'אחרי שדיברתן, העבירי את השלב ל"נוצר קשר". כך המערכת מודדת זמן תגובה ומפסיקה להזכיר.' },
    { target: 'lead-followup', text: 'רוצה לחזור אליה בעוד כמה ימים? בחרי תאריך מעקב, והפנייה תופיע במייל הבוקר באותו יום.' },
    { target: 'lead-note', text: 'כאן כותבים הערות פנימיות. ההורים לא רואים אותן.' },
  ] },
  { id: 'convert', title: 'הפיכת פנייה למשפחה', steps: [
    { path: '#/leads', target: 'lead-row', text: 'פתחי את הפנייה של המשפחה שמתחילה איתך.', waitClick: true },
    { target: 'lead-convert', text: 'לחיצה כאן יוצרת כרטיס משפחה ועסקה. אחר כך אפשר לרשום סכום.' },
  ] },
  { id: 'deals-drag', title: 'לוח העסקאות', steps: [
    { path: '#/deals', target: 'nav-deals', text: 'במסך "עסקאות" כל משפחה היא כרטיס, לפי שלבים.' },
    { target: 'deal-card', text: 'גוררים כרטיס לעמודה של השלב הבא. בטלפון: לחיצה ארוכה ואז גרירה.' },
    { target: 'deal-open', text: '"פרטים" פותח את העסקה: סכום, שלב ותשלום.' },
  ] },
  { id: 'payment', title: 'רישום תשלום', steps: [
    { path: '#/deals', target: 'deal-open', text: 'לחצי "פרטים" בכרטיס של המשפחה ששילמה.', waitClick: true },
    { target: 'deal-payment', text: 'בחרי סטטוס תשלום: שולם או שולם חלקית.' },
    { target: 'deal-paid', text: 'רשמי כמה שולם בפועל, ולחצי "שמירה". רק סכום ששולם נספר ב"הכנסות בפועל".' },
  ] },
  { id: 'start-program', title: 'פתיחת תהליך ייעוץ שינה', steps: [
    { path: '#/clients', target: 'client-row', text: 'פתחי את כרטיס המשפחה.', waitClick: true },
    { target: 'client-program-sleep', text: 'לחיצה כאן פותחת תהליך ייעוץ שינה של 8 שבועות. יש גם "+ הדרכת הורים".' },
  ] },
  { id: 'program-update', title: 'עדכון תהליך שבועי', steps: [
    { path: '#/programs', target: 'program-row', text: 'במסך "תהליכים" פותחים את התהליך של המשפחה.', waitClick: true },
    { target: 'program-week', text: 'בחרי באיזה שבוע המשפחה (1–8).' },
    { target: 'program-stage', text: 'ובאיזה שלב בתוכנית הכתובה (1–4).' },
    { target: 'program-next', text: 'קבעי את השיחה השבועית הבאה. היא תופיע במייל הבוקר באותו יום.' },
    { target: 'program-session', text: 'אחרי כל שיחה רושמים כאן סיכום קצר. כך כל ההיסטוריה במקום אחד.' },
  ] },
  { id: 'tasks', title: 'משימות', steps: [
    { path: '#/tasks', target: 'task-new', text: 'כותבים משימה, בוחרים מועד ולוחצים "הוספה".' },
    { target: 'task-check', text: 'כשסיימת, מסמנים כאן. המשימות להיום ובאיחור מגיעות גם במייל הבוקר.' },
  ] },
  { id: 'push', title: 'הפעלת התראות בטלפון', steps: [
    { path: '#/settings', target: 'settings-push', text: 'כאן מפעילים התראות במכשיר הזה. צריך להפעיל בכל מכשיר בנפרד.' },
  ] },
  { id: 'dashboard', title: 'לוח הבקרה', steps: [
    { path: '#/dashboard', target: 'dash-range', text: 'בוחרים תקופה: 30 ימים, 90 ימים, 12 חודשים או מתחילת השנה.' },
    { target: 'dash-kpis', text: 'המספרים העיקריים. "הכנסות בפועל" כולל רק כסף ששולם. "תחזית" היא עסקאות פתוחות.' },
  ] },
  { id: 'delete-request', title: 'מחיקה לבקשת הורה', steps: [
    { path: '#/leads', target: 'lead-row', text: 'פתחי את הפנייה של ההורה שביקש למחוק.', waitClick: true },
    { target: 'lead-delete', text: 'לחיצה כאן ואז הקלדת השם מוחקת את הפנייה לצמיתות.' },
  ] },
  { id: 'export', title: 'גיבוי חודשי', steps: [
    { path: '#/leads', target: 'leads-export', text: 'פעם בחודש לוחצים כאן ושומרים את הקובץ במקום מאובטח.' },
  ] },
];

export const tourById = (id: string) => TOURS.find((t) => t.id === id);
