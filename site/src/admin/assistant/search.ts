/**
 * Forgiving Hebrew search over the FAQ: strips niqqud and punctuation, removes common one-letter
 * prefixes (ו ה ב ל ש מ כ), matches by word start, scores and returns up to 3 answers.
 */
import { FAQ, type Faq } from './faq';

const NIQQUD = /[֑-ׇ]/g;
const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const PREFIX = /^[והבלשמכ]/;
// Short function words that carry no meaning for matching.
const STOP = new Set(['שלום', 'היי', 'הי', 'תודה', 'בבקשה', 'אותו', 'אותה', 'אותם', 'אצלי', 'שלי', 'פה', 'כאן', 'איך', 'מה', 'זה', 'את', 'של', 'על', 'עם', 'אני', 'לי', 'יש', 'אם', 'גם', 'רק', 'כן', 'לא', 'או', 'הוא', 'היא', 'זו', 'כל', 'אפשר', 'צריך', 'רוצה', 'מתי', 'למה']);

export function normalize(s: string): string {
  return s.toLowerCase().replace(NIQQUD, '').replace(/[״"'׳`]/g, '').replace(/[ךםןףץ]/g, (c) => FINALS[c]).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Word variants: as typed, and without one leading prefix letter (for words of 3+ letters). */
function variants(w: string): string[] {
  const out = [w];
  // Strip up to 3 stacked prefix letters ("וכשהמשפחה" → "משפחה"), keeping at least 3 letters.
  let cur = w;
  for (let n = 0; n < 3 && cur.length >= 4 && PREFIX.test(cur); n++) { cur = cur.slice(1); out.push(cur); }
  return out;
}

export function tokens(s: string): string[] {
  return normalize(s).split(' ').filter((w) => w.length >= 2 && !STOP.has(w));
}

type Indexed = { faq: Faq; keys: string[][]; q: string[]; a: string[] };
const INDEX: Indexed[] = FAQ.map((f) => ({
  faq: f,
  keys: f.keys.map((k) => tokens(k).flatMap(variants)),
  q: tokens(f.q).flatMap(variants),
  a: tokens(f.a).flatMap(variants),
}));

/** Does query word `w` match index word `t`? Word-start match, min 2 letters. */
const hit = (w: string, t: string) =>
  t === w || (w.length >= 2 && t.startsWith(w)) || (t.length >= 3 && w.startsWith(t))
  // same 4-letter stem with a different ending ("ויתרה" / "ויתרו", "משפחה" / "משפחות")
  || (w.length >= 5 && t.length >= 5 && w.slice(0, 4) === t.slice(0, 4));

export function search(query: string, limit = 3): Faq[] {
  const words = tokens(query);
  if (!words.length) return [];
  const scored = INDEX.map((ix) => {
    let score = 0;
    let matched = 0;
    for (const w of words) {
      const vs = variants(w);
      const any = (list: string[]) => list.some((t) => vs.some((v) => hit(v, t)));
      // Whole key phrase matched (e.g. "נוצר קשר") counts most; then single key words, question, answer.
      const keyHit = ix.keys.some((k) => k.some((t) => vs.some((v) => hit(v, t))));
      const s = (keyHit ? 3 : 0) + (any(ix.q) ? 2 : 0) + (any(ix.a) ? 0.5 : 0);
      if (s > 0) matched++;
      score += s;
    }
    // Multi-word key phrases fully contained in the query get a bonus.
    const nq = normalize(query);
    for (const k of ix.faq.keys) if (k.includes(' ') && nq.includes(normalize(k))) score += 3;
    // Prefer answers that cover more of the query's words.
    score *= 0.5 + 0.5 * (matched / words.length);
    return { f: ix.faq, score };
  }).filter((r) => r.score >= 2);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((r) => r.f);
}
