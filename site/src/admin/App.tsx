import { useEffect, useState, type ReactElement } from 'react';
import { useAuthState, clearNeedsPassword } from './auth/useAuthState';
import { LoginScreen, SetPasswordScreen, MfaEnrollScreen, MfaChallengeScreen, NoAccessScreen } from './auth/AuthScreens';
import { Shell, NAV, type RouteId } from './layout/Shell';
import { DashboardScreen, PlaceholderScreen, SettingsScreen } from './screens/Screens';
import { LeadsScreen, LeadDetailScreen } from './screens/Leads';
import './admin.css';

function useHashRoute(): { route: RouteId; param: string } {
  const read = () => {
    const [id, param = ''] = window.location.hash.replace(/^#\/?/, '').split('/') as [RouteId, string?];
    return { route: NAV.some((n) => n.id === id) ? id : ('dashboard' as RouteId), param: /^[0-9a-f-]{36}$/.test(param) ? param : '' };
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      document.getElementById('main')?.focus();
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export default function App() {
  const { stage, refresh } = useAuthState();
  const { route, param } = useHashRoute();

  if (stage.kind === 'loading') {
    return <div className="boot"><span className="spinner" aria-label="טוען" /></div>;
  }
  if (stage.kind === 'signed-out') return <LoginScreen />;
  if (stage.kind === 'set-password') return <SetPasswordScreen onDone={() => { clearNeedsPassword(); refresh(); }} />;
  if (stage.kind === 'mfa-enroll') return <MfaEnrollScreen onDone={refresh} />;
  if (stage.kind === 'mfa-challenge') return <MfaChallengeScreen factorId={stage.factorId} onDone={refresh} />;
  if (stage.kind === 'no-access') return <NoAccessScreen />;

  const screens: Record<RouteId, ReactElement> = {
    dashboard: <DashboardScreen />,
    leads: param ? <LeadDetailScreen key={param} id={param} role={stage.role} /> : <LeadsScreen role={stage.role} />,
    clients: <PlaceholderScreen title="משפחות" stage="D" text="כרטיס לכל משפחה: פרטים, הערות, תגיות והיסטוריית פעילות." />,
    deals: <PlaceholderScreen title="עסקאות" stage="D" text="לוח Kanban עם גרירה בין שלבים, סכומים וסטטוס תשלום." />,
    programs: <PlaceholderScreen title="תהליכים" stage="D" text="מעקב ייעוץ שינה (שבוע 1–8, שלב 1–4) ומפגשי הדרכת הורים." />,
    tasks: <PlaceholderScreen title="משימות" stage="D" text="משימות ותזכורות, כולל מייל בוקר עם משימות היום ומשימות באיחור." />,
    settings: <SettingsScreen role={stage.role} />,
  };

  return (
    <Shell route={route} name={stage.name} role={stage.role}>
      {screens[route]}
    </Shell>
  );
}
