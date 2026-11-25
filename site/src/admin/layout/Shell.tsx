import type { ReactNode } from 'react';
import { supabase, ROLE_LABEL, type Role } from '../lib/supabase';

export type RouteId = 'dashboard' | 'leads' | 'clients' | 'deals' | 'programs' | 'tasks' | 'settings' | 'help';

export const NAV: { id: RouteId; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'לוח בקרה', icon: 'M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z' },
  { id: 'leads', label: 'פניות', icon: 'M4 4h16v12H5.17L4 17.17V4Zm0-2a2 2 0 0 0-2 2v20l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4Z' },
  { id: 'clients', label: 'משפחות', icon: 'M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13Zm8 0c-.29 0-.62.02-.97.05A4.2 4.2 0 0 1 17 16.5V19h6v-2.5c0-2.33-4.67-3.5-7-3.5Z' },
  { id: 'deals', label: 'עסקאות', icon: 'M3 5h4v14H3V5Zm7 0h4v9h-4V5Zm7 0h4v6h-4V5Z' },
  { id: 'programs', label: 'תהליכים', icon: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 10.41V6h-2v7.24l5.12 3.07 1-1.65Z' },
  { id: 'tasks', label: 'משימות', icon: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17Z' },
  { id: 'help', label: 'מדריך', icon: 'M11 18h2v-2h-2v2Zm1-16a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8Zm0-14a4 4 0 0 0-4 4h2a2 2 0 1 1 4 0c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5a4 4 0 0 0-4-4Z' },
  { id: 'settings', label: 'הגדרות', icon: 'M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58-1.92-3.32-2.39.96a7 7 0 0 0-1.63-.94L14.87 3h-3.84l-.36 2.18a7 7 0 0 0-1.63.94l-2.39-.96-1.92 3.32 2.03 1.58a7.07 7.07 0 0 0 0 1.88L4.73 14.52l1.92 3.32 2.39-.96a7 7 0 0 0 1.63.94l.36 2.18h3.84l.36-2.18a7 7 0 0 0 1.63-.94l2.39.96 1.92-3.32-2.03-1.58ZM12.95 15.5a3.5 3.5 0 1 1 3.5-3.5 3.5 3.5 0 0 1-3.5 3.5Z' },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path fill="currentColor" d={d} />
    </svg>
  );
}

export function Shell({ route, name, role, children }: { route: RouteId; name: string; role: Role; children: ReactNode }) {
  const mobileNav = NAV.filter((n) => ['dashboard', 'leads', 'programs', 'tasks', 'settings'].includes(n.id));
  return (
    <div className="shell">
      <a className="skip" href="#main">דילוג לתוכן</a>
      <aside className="side" aria-label="ניווט ראשי">
        <div className="side__brand">
          <span className="side__name">Coral Cohen</span>
          <span className="side__sub">CRM</span>
        </div>
        <nav>
          <ul>
            {NAV.map((n) => (
              <li key={n.id}>
                <a href={`#/${n.id}`} className="side__link" aria-current={route === n.id ? 'page' : undefined}>
                  <Icon d={n.icon} />
                  <span>{n.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="side__user">
          <p className="side__who">{name}</p>
          <p className="side__role">{ROLE_LABEL[role]}</p>
          <button className="cbtn cbtn--ghost cbtn--sm" onClick={() => supabase.auth.signOut()}>יציאה</button>
        </div>
      </aside>

      <header className="topm">
        <span className="side__name">Coral Cohen</span>
        <span className="actions">
          <a className="cbtn cbtn--ghost cbtn--sm" href="#/help">מדריך</a>
          <button className="cbtn cbtn--ghost cbtn--sm" onClick={() => supabase.auth.signOut()}>יציאה</button>
        </span>
      </header>

      <main className="main" id="main" tabIndex={-1}>{children}</main>

      <nav className="bottom" aria-label="ניווט ראשי (נייד)">
        {mobileNav.map((n) => (
          <a key={n.id} href={`#/${n.id}`} className="bottom__link" aria-current={route === n.id ? 'page' : undefined}>
            <Icon d={n.icon} />
            <span>{n.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
