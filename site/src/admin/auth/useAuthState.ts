import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Role } from '../lib/supabase';

export type AuthStage =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'set-password' }          // arrived from an invite / password-reset link
  | { kind: 'mfa-enroll' }            // signed in, no verified TOTP factor yet
  | { kind: 'mfa-challenge'; factorId: string }
  | { kind: 'no-access' }             // signed in + MFA, but no staff profile
  | { kind: 'ready'; session: Session; role: Role; name: string };

const NEEDS_PW = 'cc-needs-password';

// Invite and recovery links land here with `type=invite|recovery` in the URL hash.
// Capture it before supabase-js consumes the hash, and keep it for this tab only.
if (typeof window !== 'undefined' && /(?:^|[#&])type=(invite|recovery)(?:&|$)/.test(window.location.hash)) {
  try { sessionStorage.setItem(NEEDS_PW, '1'); } catch { /* storage blocked */ }
}

export function needsPassword(): boolean {
  try { return sessionStorage.getItem(NEEDS_PW) === '1'; } catch { return false; }
}
export function clearNeedsPassword() {
  try { sessionStorage.removeItem(NEEDS_PW); } catch { /* ignore */ }
}

/** Resolves where the user is in the login → (password) → MFA → access flow. */
export function useAuthState() {
  const [stage, setStage] = useState<AuthStage>({ kind: 'loading' });

  const resolve = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return setStage({ kind: 'signed-out' });

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.find((f) => f.status === 'verified');

    // Users with MFA must pass it before changing their password (Supabase requires aal2).
    if (totp && aal?.currentLevel !== 'aal2') return setStage({ kind: 'mfa-challenge', factorId: totp.id });
    if (needsPassword()) return setStage({ kind: 'set-password' });
    if (!totp) return setStage({ kind: 'mfa-enroll' });

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
      if (['SIGNED_OUT', 'SIGNED_IN', 'MFA_CHALLENGE_VERIFIED', 'TOKEN_REFRESHED', 'USER_UPDATED', 'PASSWORD_RECOVERY'].includes(event)) {
        // defer: never call supabase methods synchronously inside this callback
        setTimeout(resolve, 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [resolve]);

  return { stage, refresh: resolve };
}
