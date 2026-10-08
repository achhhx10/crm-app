import { NavLink } from 'react-router-dom';
import { Users, KanbanSquare, Phone, LayoutDashboard, MoreHorizontal } from 'lucide-react';
import { getStoredUser } from '../lib/api';

const tabs = [
  { to: '/contacts', label: 'Prospects', icon: Users },
  { to: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { to: '/calls', label: 'Appels', icon: Phone },
  { to: '/', label: 'Accueil', icon: LayoutDashboard, end: true },
  { to: '/more', label: 'Plus', icon: MoreHorizontal },
];

export function TabBar() {
  const user = getStoredUser();
  void user;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border safe-bottom" aria-label="Navigation principale">
      <div className="grid grid-cols-5">
        {tabs.map((t) => (
          <NavLink
            key={t.to + t.label}
            to={t.to}
            end={(t as any).end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 min-h-[60px] text-[11px] font-medium ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`
            }
          >
            <t.icon size={22} strokeWidth={2.2} />
            {t.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
