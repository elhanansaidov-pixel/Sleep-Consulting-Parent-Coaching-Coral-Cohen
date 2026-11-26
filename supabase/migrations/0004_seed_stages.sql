-- 0004_seed_stages.sql — default pipeline (editable later from the CRM settings)
insert into public.pipeline_stages (name, position, kind) values
  ('פנייה חדשה',     1, 'open'),
  ('נוצר קשר',       2, 'open'),
  ('שיחת התאמה',     3, 'open'),
  ('ממתינים להחלטה', 4, 'open'),
  ('נסגר (שולם)',    5, 'won'),
  ('לא רלוונטי',     6, 'lost');
