/**
 * Demo sample data. All times are relative to the moment the demo is opened, so "today",
 * "overdue" and "waiting" always look right. Names and phones are fictional.
 */
export type Row = Record<string, unknown> & { id: string };
export type Db = Record<string, Row[]>;

let n = 0;
const id = (p: string) => `${p}-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const H = 3_600_000, D = 24 * H;

export function seed(): Db {
  n = 0;
  const now = Date.now();
  const at = (ms: number) => new Date(now + ms).toISOString();
  const day = (d: number, hour: number, min = 0) => { const x = new Date(now + d * D); x.setHours(hour, min, 0, 0); return x.toISOString(); };
  const dateOnly = (d: number) => new Date(now + d * D).toISOString().slice(0, 10);

  const S = ['פנייה חדשה', 'נוצר קשר', 'שיחת התאמה', 'ממתינים להחלטה', 'נסגר (שולם)', 'לא רלוונטי'];
  const KIND = ['open', 'open', 'open', 'open', 'won', 'lost'];
  const stages = S.map((name, i) => ({ id: id('aaaaaaaa'), name, position: i + 1, kind: KIND[i], created_at: at(-90 * D), updated_at: at(-90 * D) }));
  const st = (i: number) => stages[i].id;

  const answers = (o: { age: string; diff: string; routine: string; tried: string; want: string; med?: string; both?: string; more?: string }) => ({
    main_difficulty: o.diff, current_routine: o.routine, tried_so_far: o.tried, desired_change: o.want,
    medical_info: o.med ?? 'אין', both_parents: o.both ?? 'כן, שנינו נוכל להיות שותפים',
    process_understanding: 'כן, מבינים ומוכנים להתחייב', anything_else: o.more ?? 'לא',
  });

  const L = (o: { name: string; created: number; stage: number; age: string; service?: 'sleep' | 'parenting'; follow?: string; priority?: string; contact?: number; client?: string; lost?: string; a: ReturnType<typeof answers> }, k: number) => ({
    id: id('bbbbbbbb'), created_at: at(o.created), updated_at: at(o.created), source: 'website', service: o.service ?? 'sleep',
    stage_id: st(o.stage), priority: o.priority ?? 'normal', next_follow_up_at: o.follow ?? null,
    first_contact_at: o.contact != null ? at(o.contact) : null, parent_name: o.name,
    phone: `050-000-00${10 + k}`, phone_normalized: `97250000${String(10 + k).padStart(4, '0')}`, email: null,
    child_age: o.age, answers: o.a, consent_at: at(o.created), signed_name: o.name.replace('משפחת ', ''),
    duplicate_of: null, client_id: o.client ?? null, lost_reason: o.lost ?? null, notified_at: at(o.created),
  });

  const leads = [
    L({ name: 'משפחת לוי', created: -2 * H, stage: 0, age: '7 חודשים', a: answers({ age: '7', diff: 'מתעורר כל שעתיים בלילה, נרדם רק על הידיים', routine: 'מקלחת ב-19:00, בקבוק, נדנוד עד שנרדם', tried: 'ניסינו להשכיב ער, בוכה הרבה ונשברנו', want: 'שיירדם לבד וישן רצף ארוך יותר' }) }, 1),
    L({ name: 'משפחת אברהם', created: -30 * H, stage: 0, age: 'שנה וחצי', a: answers({ age: '18', diff: 'הירדמות ארוכה מאוד, עד שעה וחצי', routine: 'אמבטיה, סיפור, שוכבים לידה עד שנרדמת', tried: 'שינינו שעות, לא עזר', want: 'הירדמות קצרה ובלי שנצטרך לשכב לידה' }) }, 2),
    L({ name: 'משפחת מזרחי', created: -3 * D, stage: 1, age: '10 חודשים', follow: day(1, 10), contact: -2 * D, a: answers({ age: '10', diff: 'יקיצות מרובות ותנומות קצרות', routine: 'לא קבועה', tried: 'מוצץ, רעש לבן', want: 'שגרה קבועה ולילות רגועים' }) }, 3),
    L({ name: 'משפחת פרץ', created: -6 * D, stage: 2, age: '3 שנים', contact: -5 * D, a: answers({ age: '36', diff: 'יוצא מהמיטה שוב ושוב ומגיע אלינו בלילה', routine: 'מקלחת, שיניים, סיפור', tried: 'טבלת מדבקות', want: 'שיישן במיטה שלו כל הלילה', more: 'יש תינוקת בת 4 חודשים בבית' }) }, 4),
    L({ name: 'משפחת ביטון', created: -10 * D, stage: 3, age: 'שנתיים', contact: -9 * D, priority: 'high', a: answers({ age: '24', diff: 'קימות מוקדמות ב-5:00', routine: 'שינה ב-19:30', tried: 'הזזנו שעת שינה', want: 'שיתעורר לא לפני 6:30' }) }, 5),
    L({ name: 'משפחת אוחיון', created: -25 * D, stage: 4, age: '8 חודשים', contact: -24 * D, a: answers({ age: '8', diff: 'נרדמת רק בהנקה', routine: 'הנקה עד שנרדמת', tried: 'שום דבר עדיין', want: 'הירדמות עצמאית' }) }, 6),
    L({ name: 'משפחת דהן', created: -40 * D, stage: 4, age: 'שנה', contact: -39 * D, a: answers({ age: '12', diff: 'מעבר לחדר שלו', routine: 'ישן איתנו', tried: 'עריסה צמודה', want: 'שיישן בחדר שלו' }) }, 7),
    L({ name: 'משפחת גבאי', created: -20 * D, stage: 5, age: '4 חודשים', contact: -19 * D, lost: 'הגיל צעיר מדי לתהליך, נחזור בעוד חודש', a: answers({ age: '4', diff: 'יקיצות', routine: 'אין', tried: 'אין', want: 'לישון יותר' }) }, 8),
  ];
  const [, , lMizrahi, lPeretz, , lOhayon, lDahan] = leads;

  const C = (name: string, phoneK: number, created: number, fromLead: string | null, tags: string[] = []) => ({
    id: id('cccccccc'), parent_names: name, phone: `050-000-00${10 + phoneK}`, phone_normalized: `97250000${String(10 + phoneK).padStart(4, '0')}`,
    email: null, tags, notes: null, created_from_lead_id: fromLead, created_at: at(created), updated_at: at(created),
  });
  const cOhayon = C('משפחת אוחיון', 6, -22 * D, lOhayon.id, ['תינוקת ראשונה']);
  const cDahan = C('משפחת דהן', 7, -37 * D, lDahan.id);
  const cShoshan = C('משפחת שושן', 9, -15 * D, null, ['הגיעו בהמלצה']);
  lOhayon.client_id = cOhayon.id; lDahan.client_id = cDahan.id;

  const Dl = (client: string, lead: string | null, service: string, amount: number, stage: number, pay: string, paid: number, created: number, closed: number | null) => ({
    id: id('dddddddd'), client_id: client, lead_id: lead, service, title: service === 'sleep' ? 'ייעוץ שינה' : 'הדרכת הורים',
    amount, stage_id: st(stage), expected_close: null, payment_status: pay, paid_amount: paid,
    closed_at: closed != null ? at(closed) : null, lost_reason: null, created_at: at(created), updated_at: at(created),
  });
  const deals = [
    Dl(cOhayon.id, lOhayon.id, 'sleep', 1800, 4, 'paid', 1800, -22 * D, -20 * D),
    Dl(cDahan.id, lDahan.id, 'sleep', 1800, 4, 'partial', 900, -37 * D, -35 * D),
    Dl(cShoshan.id, null, 'parenting', 1200, 3, 'unpaid', 0, -15 * D, null),
  ];

  // Today's weekly call already happened an hour ago (if still today) → "write a summary" tip.
  const earlier = new Date(now - H);
  const todayCall = earlier.toDateString() === new Date(now).toDateString() ? earlier.toISOString() : day(1, 11);
  const P = (client: string, deal: string, service: string, start: number, week: number | null, stage: number | null, next: string) => ({
    id: id('eeeeeeee'), client_id: client, deal_id: deal, service, start_date: dateOnly(start), current_week: week, current_stage: stage,
    next_session_at: next, status: 'active', created_at: at(start * D), updated_at: at(start * D),
  });
  const pOhayon = P(cOhayon.id, deals[0].id, 'sleep', -18, 3, 2, todayCall);
  const pDahan = P(cDahan.id, deals[1].id, 'sleep', -34, 6, 3, day(2, 20, 30));
  const pShoshan = P(cShoshan.id, deals[2].id, 'parenting', -12, null, null, day(4, 21));

  const Ss = (program: string, held: number, kind: string, summary: string) => ({ id: id('ffffffff'), program_id: program, held_at: at(held), kind, summary, created_at: at(held), updated_at: at(held) });
  const sessions = [
    Ss(pOhayon.id, -18 * D, 'intro', 'שיחת פתיחה בזום (שעה וחצי). הוסבר התהליך, נבנתה תוכנית כתובה ב-4 שלבים.'),
    Ss(pOhayon.id, -11 * D, 'weekly', 'שבוע ראשון עבר טוב. הירדמות ירדה מ-40 ל-20 דקות.'),
    Ss(pOhayon.id, -4 * D, 'weekly', 'התחלנו שלב 2. שתי יקיצות בלילה, נרגעת מהר.'),
    Ss(pDahan.id, -34 * D, 'intro', 'שיחת פתיחה. מטרה: מעבר לחדר נפרד.'),
    Ss(pDahan.id, -6 * D, 'weekly', 'ישן בחדר שלו 5 מתוך 7 לילות.'),
    Ss(pShoshan.id, -5 * D, 'parenting', 'מפגש שלישי: גבולות בלי מאבק, תרגול "בחירה מוגבלת".'),
  ];

  const T = (title: string, due: string | null, o: { priority?: string; status?: string; lead?: string; client?: string; created: number }) => ({
    id: id('99999999'), title, details: null, due_at: due, priority: o.priority ?? 'normal', status: o.status ?? 'open',
    lead_id: o.lead ?? null, client_id: o.client ?? null, deal_id: null, completed_at: o.status === 'done' ? at(-1 * D) : null,
    created_at: at(o.created), updated_at: at(o.created),
  });
  const tasks = [
    T('ליצור קשר עם משפחת לוי', day(1, 10), { lead: leads[0].id, created: -2 * H }),
    T('לחזור למשפחת מזרחי', day(1, 10), { lead: lMizrahi.id, created: -2 * D }),
    T('לשלוח סיכום כתוב למשפחת אוחיון', day(-1, 18), { client: cOhayon.id, priority: 'high', created: -3 * D }),
    T('לקבוע שיחת התאמה עם משפחת פרץ', day(0, 20), { lead: lPeretz.id, created: -4 * D }),
    T('להכין תוכנית כתובה למשפחת דהן', day(-30, 12), { client: cDahan.id, status: 'done', created: -33 * D }),
  ];

  const A = (entity: string, entity_id: string, kind: string, body: string, created: number) => ({ id: id('77777777'), entity, entity_id, kind, body, actor: null, created_at: at(created) });
  const activities = [
    A('lead', lMizrahi.id, 'stage_change', 'השלב שונה ל"נוצר קשר"', -2 * D),
    A('lead', lMizrahi.id, 'note', 'דיברנו בוואטסאפ. מעדיפים שיחה ביום חמישי בערב.', -2 * D + H),
    A('lead', lPeretz.id, 'note', 'אבא מתלבט, אמא מאוד רוצה. לקבוע שיחת התאמה עם שניהם.', -5 * D),
    A('lead', lOhayon.id, 'converted', 'הפנייה הפכה למשפחה ולעסקה', -22 * D),
    A('client', cOhayon.id, 'created', 'המשפחה נוצרה מפנייה בשאלון', -22 * D),
    A('program', pOhayon.id, 'progress', 'עבר לשבוע 3', -4 * D),
  ];

  const automations = [
    { id: id('66666666'), key: 'new_lead_task', label: 'פנייה חדשה יוצרת משימה "ליצור קשר" למחרת', enabled: true },
    { id: id('66666666'), key: 'stale_lead_flag', label: 'פנייה שלא טופלה 48 שעות מסומנת בעדיפות גבוהה', enabled: true },
    { id: id('66666666'), key: 'new_lead_push', label: 'התראה בדפדפן/טלפון על פנייה חדשה', enabled: true },
  ];
  const automation_runs = [
    { id: id('55555555'), automation: 'new_lead_task', entity_id: leads[0].id, status: 'ok', attempts: 1, detail: 'task created', ran_at: at(-2 * H) },
    { id: id('55555555'), automation: 'stale_lead_flag', entity_id: leads[4].id, status: 'ok', attempts: 1, detail: 'flagged', ran_at: at(-8 * D) },
  ];

  return {
    pipeline_stages: stages, leads, clients: [cOhayon, cDahan, cShoshan], deals,
    programs: [pOhayon, pDahan, pShoshan], sessions, tasks, activities, automations, automation_runs,
    push_subscriptions: [], usage_log: [], assistant_profile: [], lead_views: [],
    profiles: [{ id: 'demo-user', role: 'owner', full_name: 'קורל (דמו)', assistant_enabled: true }],
  } as unknown as Db;
}
