import { useEffect, useState, type ReactElement } from 'react';
import { useAuthState, clearNeedsPassword } from './auth/useAuthState';
import { ConfirmLinkScreen, LoginScreen, SetPasswordScreen, MfaEnrollScreen, MfaChallengeScreen, NoAccessScreen } from './auth/AuthScreens';
import { Shell, NAV, type RouteId } from './layout/Shell';
import { SettingsScreen } from './screens/Screens';
import { DashboardScreen } from './screens/Dashboard';
import { LeadsScreen, LeadDetailScreen } from './screens/Leads';
import { ClientsScreen, ClientDetailScreen } from './screens/Clients';
import { DealsScreen } from './screens/Deals';
import { ProgramsScreen, ProgramDetailScreen } from './screens/Programs';
import { TasksScreen } from './screens/Tasks';
import { HelpScreen } from './screens/Help';
import './admin.css';
import { isDemo, resetDemo, exitDemo } from './demo/flag';

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
  if (stage.kind === 'confirm-link') return <ConfirmLinkScreen tokenHash={stage.tokenHash} type={stage.type} onDone={refresh} />;
  if (stage.kind === 'signed-out') return <LoginScreen />;
  if (stage.kind === 'set-password') return <SetPasswordScreen onDone={() => { clearNeedsPassword(); refresh(); }} />;
  if (stage.kind === 'mfa-enroll') return <MfaEnrollScreen onDone={refresh} />;
  if (stage.kind === 'mfa-challenge') return <MfaChallengeScreen factorId={stage.factorId} onDone={refresh} />;
  if (stage.kind === 'no-access') return <NoAccessScreen />;

  const screens: Record<RouteId, ReactElement> = {
    dashboard: <DashboardScreen />,
    leads: param ? <LeadDetailScreen key={param} id={param} role={stage.role} /> : <LeadsScreen role={stage.role} />,
    clients: param ? <ClientDetailScreen key={param} id={param} role={stage.role} /> : <ClientsScreen />,
    deals: <DealsScreen role={stage.role} />,
    programs: param ? <ProgramDetailScreen key={param} id={param} role={stage.role} /> : <ProgramsScreen />,
    tasks: <TasksScreen role={stage.role} />,
    settings: <SettingsScreen role={stage.role} />,
    help: <HelpScreen />,
  };

  const demo = isDemo();
  return (
    <>
    {demo && (
      <div className="demo-bar" role="status">
        <span><b>מצב דמו</b><span className="demo-bar__more"> · נתונים לדוגמה, נשמרים רק בדפדפן הזה ולא נוגעים במערכת</span></span>
        <span className="actions">
          <button type="button" className="cbtn cbtn--sm" onClick={resetDemo}>איפוס</button>
          <button type="button" className="cbtn cbtn--sm" onClick={exitDemo}>יציאה</button>
        </span>
      </div>
    )}
    <Shell route={route} name={stage.name} role={stage.role} assistant={stage.assistant}>
      {screens[route]}
    </Shell>
    </>
  );
}
