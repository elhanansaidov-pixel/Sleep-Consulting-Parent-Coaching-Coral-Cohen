// Source of truth: docs/questionnaire.md — do not remove or reword questions.

export type Field = {
  id: string;
  num: number;
  label: string;
  hint?: string;
  type: 'text' | 'tel' | 'email' | 'textarea';
  required: boolean;
  autocomplete?: string;
  list?: string[];
};

export type Step = { title: string; fields: Field[] };

export const intro = {
  title: 'טופס התאמה ראשוני לתהליך ייעוץ שינה',
  subtitle: 'קורל כהן | ייעוץ שינה והדרכת הורים',
  greeting: 'היי, נעים להכיר🤍',
  body: 'כדי לבדוק אם תהליך ייעוץ השינה מתאים לצרכים שלכם, אשמח שתענו על כמה שאלות קצרות. המידע ישמש לצורך בדיקת התאמה ויצירת קשר בלבד. מילוי הטופס אינו מבטיח קבלה לתהליך ואינו מהווה ייעוץ או אבחון.',
};

export const steps: Step[] = [
  {
    title: 'פרטים',
    fields: [
      { id: 'parent_name', num: 1, label: 'שם ההורה/ההורים:', type: 'text', required: true, autocomplete: 'name' },
      { id: 'phone', num: 2, label: 'טלפון ליצירת קשר:', type: 'tel', required: true, autocomplete: 'tel' },
      { id: 'email', num: 3, label: 'כתובת דוא״ל (לא חובה):', type: 'email', required: false, autocomplete: 'email' },
      { id: 'child_age', num: 4, label: 'גיל הילד/ה:', hint: 'אפשר לציין גיל בחודשים או בשנים', type: 'text', required: true },
    ],
  },
  {
    title: 'השינה היום',
    fields: [
      { id: 'main_difficulty', num: 5, label: 'מה הקושי המרכזי סביב השינה כרגע?', hint: 'למשל: הירדמות, יקיצות, תנומות יום, מעבר למיטה', type: 'textarea', required: true },
      { id: 'current_routine', num: 6, label: 'איך נראית שגרת הערב והשינה כיום?', type: 'textarea', required: true },
      { id: 'tried_so_far', num: 7, label: 'מה ניסיתם עד היום, ומה עזר או לא עזר?', type: 'textarea', required: true },
    ],
  },
  {
    title: 'מטרות ורקע',
    fields: [
      { id: 'desired_change', num: 8, label: 'מה הייתם רוצים שישתנה בעקבות התהליך?', type: 'textarea', required: true },
      { id: 'medical_info', num: 9, label: 'האם יש מידע רפואי או התפתחותי רלוונטי שחשוב שאדע לצורך בדיקת התאמה?', hint: 'אין צורך לפרט מעבר למה שרלוונטי כרגע', type: 'textarea', required: true },
      { id: 'both_parents', num: 10, label: 'האם שני ההורים/המבוגרים המטפלים המרכזיים יכולים להיות שותפים לתהליך?', type: 'textarea', required: true },
    ],
  },
  {
    title: 'התהליך והסכמה',
    fields: [
      {
        id: 'process_understanding', num: 11, label: 'האם אתם מבינים שהתהליך כולל:', type: 'textarea', required: true,
        list: [
          'שיחת היכרות ראשונית בזום (כ־90 דקות).',
          'מילוי יומן שינה באופן יומיומי.',
          'קבלת משוב על יומן השינה בשעות המענה שהוגדרו מראש, בדרך כלל בבוקר ועד 11:00.',
          'שיחה שבועית, לרוב טלפונית, ועד שעה.',
          'ליווי לאורך תקופה של כשמונה שבועות, בהתאם לתוכנית שתיקבע.',
        ],
      },
      { id: 'anything_else', num: 12, label: 'האם יש משהו נוסף שחשוב לך שאדע לפני שיחת ההתאמה?', hint: 'אם אין, אפשר לכתוב "אין"', type: 'textarea', required: true },
    ],
  },
];

export const consent = {
  title: 'הצהרת פרטיות והסכמה ליצירת קשר',
  lines: [
    'אני מאשר/ת שמסרתי את הפרטים מרצוני, ושניתן ליצור איתי קשר לצורך בדיקת התאמה לתהליך ייעוץ שינה.',
    'ידוע לי שהטופס אינו מבטיח קבלה לתהליך, ושפרטי הילד והמשפחה יישמרו בדיסקרטיות וישמשו רק לצורך בדיקת ההתאמה והליווי, ככל שיתחיל.',
  ],
  checkbox: 'קראתי ואני מאשר/ת את ההצהרה',
  nameLabel: 'שם מלא:',
};

export const thanks = 'תודה ששיתפתם אותי. אחזור אליכם לאחר שאעבור על הפרטים 🤍';

export const WHATSAPP_URL =
  'https://wa.me/972544277875?text=' +
  encodeURIComponent('היי קורל, הגעתי מהאתר ואשמח לשמוע על תהליך ייעוץ השינה 🤍');

export const WHATSAPP_PARENTING_URL =
  'https://wa.me/972544277875?text=' +
  encodeURIComponent('היי קורל, הגעתי מהאתר ואשמח לשמוע על הדרכת הורים 🤍');

export const CONTACT_EMAIL = 'coral12007@walla.co.il';
