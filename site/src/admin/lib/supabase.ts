import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'cc-crm-auth',
  },
});

export type Role = 'owner' | 'tech_admin';

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'בעלת העסק',
  tech_admin: 'מנהל טכני',
};

/** Hebrew messages for the auth errors users actually hit. Never echo raw server text. */
export function authErrorMessage(err: unknown): string {
  const msg = (err as { message?: string })?.message?.toLowerCase() ?? '';
  if (msg.includes('invalid login credentials')) return 'המייל או הסיסמה שגויים.';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.';
  if (msg.includes('invalid totp') || msg.includes('invalid code') || msg.includes('expired')) return 'הקוד שגוי או שפג תוקפו. נסו את הקוד הבא מהאפליקציה.';
  if (msg.includes('network') || msg.includes('fetch')) return 'אין חיבור לשרת. בדקו את החיבור ונסו שוב.';
  return 'משהו השתבש. נסו שוב.';
}
