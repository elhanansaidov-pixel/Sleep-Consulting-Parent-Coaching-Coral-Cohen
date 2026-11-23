import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Role } from '../lib/supabase';

export type AuthStage =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'mfa-enroll' }            // signed in, no verified TOTP factor yet
  | { kind: 'mfa-challenge'; factorId: string }
  | { kind: 'no-access' }             // signed in + MFA, but no staff profile
  | { kind: 'ready'; session: Session; role: Role; name: string };

/** Resolves where the user is in the login → MFA → access flow. */
export function useAuthState() {
  const [stage, setStage] = useState<AuthStage>({ kind: 'loading' });

  const resolve = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return setStage({ kind: 'signed-out' });

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== 'aal2') {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.find((f) => f.status === 'verified');
      return setStage(totp ? { kind: 'mfa-challenge', factorId: totp.id } : { kind: 'mfa-enroll' });
    }

    // RLS lets a user read their own profile.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', session.user.id)
      .maybeSingle();
    if (!profile) return setStage({ kind: 'no-access' });
    setStage({ kind: 'ready', session, role: profile.role as Role, name: profile.full_name || session.user.email || '' });
  }, []);

  useEffect(() => {
    resolve();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'MFA_CHALLENGE_VERIFIED' || event === 'TOKEN_REFRESHED') {
        resolve();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [resolve]);

  return { stage, refresh: resolve };
}
