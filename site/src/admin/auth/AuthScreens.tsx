import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase, authErrorMessage } from '../lib/supabase';

function AuthCard({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <main className="auth" id="main">
      <div className="auth__card">
        <p className="auth__brand">Coral Cohen</p>
        <h1 className="auth__title">{title}</h1>
        {lead && <p className="auth__lead">{lead}</p>}
        {children}
      </div>
      <p className="auth__foot">מערכת ניהול פנימית. הגישה מתועדת.</p>
    </main>
  );
}

function ErrorLine({ text }: { text: string }) {
  return text ? <p className="field__err" role="alert">{text}</p> : null;
}

const PW_RULES = 'לפחות 12 תווים, עם אות גדולה, אות קטנה וספרה (באנגלית).';
function passwordOk(pw: string) {
  return pw.length >= 12 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
}

export function SetPasswordScreen({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    if (!passwordOk(pw)) return setErr(`הסיסמה צריכה להיות ${PW_RULES}`);
    if (pw !== pw2) return setErr('הסיסמאות לא זהות.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      const m = error.message?.toLowerCase() ?? '';
      return setErr(m.includes('same') ? 'בחרו סיסמה שונה מהקודמת.' : m.includes('weak') ? `הסיסמה חלשה מדי. ${PW_RULES}` : authErrorMessage(error));
    }
    onDone();
  }

  return (
    <AuthCard title="בחירת סיסמה" lead={PW_RULES}>
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="pw1">סיסמה חדשה</label>
          <input id="pw1" type="password" dir="ltr" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw2">הקלדה חוזרת</label>
          <input id="pw2" type="password" dir="ltr" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        <ErrorLine text={err} />
        <button className="cbtn cbtn--primary cbtn--block" disabled={busy || !pw || !pw2}>{busy ? 'שומרים…' : 'שמירה והמשך'}</button>
      </form>
    </AuthCard>
  );
}

function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    // Same response whether or not the address exists (no account enumeration).
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/admin` });
    setBusy(false);
    setSent(true);
  }

  return (
    <AuthCard title="איפוס סיסמה" lead={sent ? undefined : 'נשלח קישור לבחירת סיסמה חדשה למייל שלכם.'}>
      {sent ? (
        <p role="status">אם הכתובת רשומה במערכת, נשלח אליה קישור לאיפוס. הקישור תקף ל-24 שעות.</p>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor="fp-email">מייל</label>
            <input id="fp-email" type="email" dir="ltr" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="cbtn cbtn--primary cbtn--block" disabled={busy || !email}>{busy ? 'שולחים…' : 'שליחת קישור'}</button>
        </form>
      )}
      <button className="cbtn cbtn--ghost cbtn--block" onClick={onBack}>חזרה לכניסה</button>
    </AuthCard>
  );
}

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  if (forgot) return <ForgotPassword onBack={() => setForgot(false)} />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(authErrorMessage(error));
  }

  return (
    <AuthCard title="כניסה למערכת" lead="ניהול פניות, משפחות ותהליכים.">
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="email">מייל</label>
          <input id="email" type="email" dir="ltr" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">סיסמה</label>
          <input id="password" type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <ErrorLine text={err} />
        <button className="cbtn cbtn--primary cbtn--block" disabled={busy || !email || !password}>
          {busy ? 'נכנסים…' : 'כניסה'}
        </button>
      </form>
      <button className="cbtn cbtn--ghost cbtn--block" onClick={() => setForgot(true)}>שכחתי סיסמה</button>
    </AuthCard>
  );
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="field">
      <label htmlFor="code">קוד בן 6 ספרות מאפליקציית האימות</label>
      <input
        ref={ref}
        id="code"
        className="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        dir="ltr"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      />
    </div>
  );
}

export function MfaEnrollScreen({ onDone }: { onDone: () => void }) {
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      // remove half-finished factors from earlier attempts, then enroll a fresh one
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? []) {
        if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `coral-crm-${Date.now()}` });
      if (error || !data) return setErr(authErrorMessage(error));
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
    })();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (error) return setErr(authErrorMessage(error));
    onDone();
  }

  return (
    <AuthCard title="הגדרת אימות דו-שלבי" lead="פעם אחת בלבד. כך גם מי שיודע את הסיסמה לא יוכל להיכנס בלי הטלפון שלך.">
      <ol className="auth__steps">
        <li>פתחו אפליקציית אימות בטלפון (Google Authenticator או Microsoft Authenticator).</li>
        <li>סרקו את הקוד:</li>
      </ol>
      <div className="qr" aria-live="polite">
        {qr ? <img src={qr} alt="קוד QR להגדרת אפליקציית האימות" width={180} height={180} /> : <span className="spinner" aria-label="טוען" />}
      </div>
      {secret && (
        <details className="auth__secret">
          <summary>אי אפשר לסרוק? הקלדה ידנית</summary>
          <code dir="ltr">{secret}</code>
        </details>
      )}
      <form onSubmit={onSubmit} noValidate>
        <CodeInput value={code} onChange={setCode} />
        <ErrorLine text={err} />
        <button className="cbtn cbtn--primary cbtn--block" disabled={busy || code.length !== 6 || !factorId}>
          {busy ? 'מאמתים…' : 'אישור והמשך'}
        </button>
      </form>
      <button className="cbtn cbtn--ghost cbtn--block" onClick={() => supabase.auth.signOut()}>יציאה</button>
    </AuthCard>
  );
}

export function MfaChallengeScreen({ factorId, onDone }: { factorId: string; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (error) return setErr(authErrorMessage(error));
    onDone();
  }

  return (
    <AuthCard title="אימות דו-שלבי" lead="הקלידו את הקוד שמופיע עכשיו באפליקציית האימות.">
      <form onSubmit={onSubmit} noValidate>
        <CodeInput value={code} onChange={setCode} />
        <ErrorLine text={err} />
        <button className="cbtn cbtn--primary cbtn--block" disabled={busy || code.length !== 6}>
          {busy ? 'מאמתים…' : 'כניסה'}
        </button>
      </form>
      <button className="cbtn cbtn--ghost cbtn--block" onClick={() => supabase.auth.signOut()}>יציאה</button>
    </AuthCard>
  );
}

export function NoAccessScreen() {
  return (
    <AuthCard title="אין הרשאת גישה" lead="המשתמש מחובר, אבל לא הוגדר לו תפקיד במערכת. פנו למנהל המערכת.">
      <button className="cbtn cbtn--ghost cbtn--block" onClick={() => supabase.auth.signOut()}>יציאה</button>
    </AuthCard>
  );
}
