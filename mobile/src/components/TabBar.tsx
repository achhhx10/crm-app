import { NavLink } from 'react-router-dom';
import { Users, KanbanSquare, Phone, LayoutDashboard, MoreHorizontal } from 'lucide-react';

const tabs = [
  { to: '/contacts', label: 'Prospects', Icon: Users },
  { to: '/pipeline', label: 'Pipeline', Icon: KanbanSquare },
  { to: '/', label: 'Accueil', Icon: LayoutDashboard, end: true, center: true },
  { to: '/calls', label: 'Appels', Icon: Phone },
  { to: '/more', label: 'Plus', Icon: MoreHorizontal },
];

export function TabBar() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border safe-bottom" aria-label="Navigation principale">
      <div className="grid grid-cols-5">
        {tabs.map((t) => (
          <NavLink
            key={t.label}
            to={t.to}
            end={(t as any).end}
            className={({ isActive }) =>
              `tactile relative flex flex-col items-center justify-center gap-1 min-h-[60px] text-[11px] font-semibold ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <t.Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                {label(t.label)}
                {isActive && (
                  <span className="absolute top-1 h-1 w-8 rounded-full bg-primary" aria-hidden="true" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function label(text: string) {
  return <span>{text}</span>;
}
