import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { GitBranch, Upload, Shield, LogOut, DollarSign, LayoutDashboard, Users, Phone, Gift } from 'lucide-react';
import { DarkModeToggle } from '../ui/dark-mode-toggle';

const mainNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Tableau de bord', end: true },
  { to: '/pipeline', icon: GitBranch, label: 'Pipeline' },
  { to: '/contacts', icon: Users, label: 'Prospects' },
  { to: '/deals', icon: DollarSign, label: 'Deals' },
  { to: '/calls', icon: Phone, label: 'Appels' },
  { to: '/referrals', icon: Gift, label: 'Recommandations' },
];

const adminNavItems = [
  { to: '/import', icon: Upload, label: 'Import' },
  { to: '/users', icon: Shield, label: 'Utilisateurs' },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('crm_user') || '{}');
  const isAdmin = user.role === 'admin';

  const handleLogout = () => {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    navigate('/login');
  };

  const handleNavClick = () => {
    if (onClose) onClose();
  };

  const renderLink = (item: { to: string; icon: React.ComponentType<{ className?: string }>; label: string; end?: boolean }) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      onClick={handleNavClick}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ${
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
          )}
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );

  return (
    <>
      {/* Backdrop overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 animate-fade-in lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r bg-card transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center border-b px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">CRM</span>
            </div>
            <span className="text-lg font-semibold tracking-tight">Prospection</span>
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto p-4">
          <div>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Principal
            </p>
            <div className="space-y-1">
              {mainNavItems.map(renderLink)}
            </div>
          </div>

          {isAdmin && (
            <div>
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Administration
              </p>
              <div className="space-y-1">
                {adminNavItems.map(renderLink)}
              </div>
            </div>
          )}
        </nav>

        <div className="border-t p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <span className="text-sm font-medium text-primary">{user.name?.charAt(0) || '?'}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name || 'Utilisateur'}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email || ''}</p>
            </div>
            <DarkModeToggle />
          </div>
          <button
            onClick={handleLogout}
            aria-label="Déconnexion"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </div>
      </aside>
    </>
  );
}