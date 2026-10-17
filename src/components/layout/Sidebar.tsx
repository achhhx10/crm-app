import React, { useCallback, useEffect, useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { GitBranch, Upload, Shield, LogOut, DollarSign, LayoutDashboard, Users, Phone, PhoneCall, Gift, BellRing, Settings } from 'lucide-react';
import { DarkModeToggle } from '../ui/dark-mode-toggle';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';

const mainNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Tableau de bord', end: true },
  { to: '/pipeline', icon: GitBranch, label: 'Pipeline' },
  { to: '/contacts', icon: Users, label: 'Prospects' },
  { to: '/phoning', icon: PhoneCall, label: 'Phoning' },
  // Badge shows how many scheduled callbacks are due, so a follow-up written
  // on the calling screen is not silently forgotten until the next morning.
  { to: '/followups', icon: BellRing, label: 'À relancer' },
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
  /**
   * Icon-only rail on desktop, toggled from the Header. Every collapsed style
   * is emitted as an `lg:` variant so the mobile drawer keeps full labels
   * whatever this state is.
   */
  collapsed?: boolean;
}

export function Sidebar({ isOpen = false, onClose, collapsed = false }: SidebarProps) {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('crm_user') || '{}');
  const isAdmin = user.role === 'admin';

  const [dueCount, setDueCount] = useState(0);

  const loadDueCount = useCallback(() => {
    api.calls.dueCount()
      .then(res => setDueCount(res?.total ?? 0))
      .catch(() => setDueCount(0));
  }, []);

  useEffect(() => {
    loadDueCount();
    const timer = setInterval(loadDueCount, 60_000);
    // Re-check when the tab regains focus: logging a call changes the count.
    window.addEventListener('focus', loadDueCount);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', loadDueCount);
    };
  }, [loadDueCount]);

  const handleLogout = () => {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    navigate('/login');
  };

  const handleNavClick = () => {
    if (onClose) onClose();
  };

  const renderLink = (item: { to: string; icon: React.ComponentType<{ className?: string }>; label: string; end?: boolean }) => {
    const badge = item.to === '/followups' && dueCount > 0 ? dueCount : null;
    return (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      onClick={handleNavClick}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors duration-200',
          collapsed && 'lg:justify-center lg:px-0',
          isActive
            ? 'text-primary'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-200',
              isActive
                ? 'bg-primary/15 text-primary glow-primary'
                : 'bg-muted/60 text-muted-foreground group-hover:bg-muted group-hover:text-foreground',
            )}
          >
            <item.icon className="h-4 w-4" />
          </span>
          <span className={cn('truncate', collapsed && 'lg:hidden')}>{item.label}</span>
          {badge !== null && (
            collapsed ? (
              // Rail mode: a glowing dot instead of the counter; the exact count
              // stays available because the visited page lists every callback.
              <span
                className="absolute right-2.5 top-2 hidden h-2.5 w-2.5 rounded-full bg-destructive text-destructive neon lg:block"
                aria-label={`${badge} relance(s) à faire`}
              />
            ) : (
              <span
                className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground tabular-nums"
                aria-label={`${badge} relance(s) à faire`}
              >
                {badge > 99 ? '99+' : badge}
              </span>
            )
          )}
        </>
      )}
    </NavLink>
    );
  };

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
        className={cn(
          'fixed left-0 top-0 z-40 flex h-screen w-64 transition-[transform,width] duration-200 ease-in-out lg:translate-x-0 dark:glass dark:glass-edge',
          collapsed ? 'lg:w-[4.5rem]' : 'lg:w-64',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <div className={cn('flex h-16 items-center gap-2.5 px-4', collapsed && 'lg:justify-center lg:px-0')}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary glow-primary">
              <span className="text-[11px] font-bold text-primary-foreground">CRM</span>
            </div>
            <span className={cn('text-lg font-semibold tracking-tight', collapsed && 'lg:hidden')}>
              Prospection
            </span>
          </div>

          {/* Account block, above the navigation like a user-centric shell.
              Clicking it opens the self-service profile page (/settings). */}
          <div className={cn('flex items-center gap-2 border-b px-3 pb-3', collapsed && 'lg:justify-center lg:px-1')}>
            <Link
              to="/settings"
              onClick={handleNavClick}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 -m-1 transition-colors duration-200 hover:bg-muted/60"
              title={collapsed ? 'Mon compte' : undefined}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                {user.name?.charAt(0) || '?'}
              </div>
              <div className={cn('min-w-0 flex-1', collapsed && 'lg:hidden')}>
                <p className="truncate text-sm font-medium leading-tight">{user.name || 'Utilisateur'}</p>
                <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                  {isAdmin ? 'Admin' : 'Démarcheur'}
                </p>
              </div>
              <Settings className={cn('h-4 w-4 shrink-0 text-muted-foreground', collapsed && 'lg:hidden')} />
            </Link>
          </div>

          <nav className="flex-1 space-y-5 overflow-y-auto p-3">
            <div>
              <p className={cn(
                'mb-2 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70',
                collapsed && 'lg:hidden',
              )}>
                Principal
              </p>
              <div className="space-y-1">
                {mainNavItems.map(renderLink)}
              </div>
            </div>

            {isAdmin && (
              <div>
                <p className={cn(
                  'mb-2 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70',
                  collapsed && 'lg:hidden',
                )}>
                  Administration
                </p>
                <div className="space-y-1">
                  {adminNavItems.map(renderLink)}
                </div>
              </div>
            )}
          </nav>

          <div className="border-t p-3">
            <div className={cn('flex items-center gap-2', collapsed && 'lg:flex-col')}>
              <button
                onClick={handleLogout}
                aria-label="Déconnexion"
                title={collapsed ? 'Déconnexion' : undefined}
                className={cn(
                  'flex min-h-[44px] min-w-[44px] flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors duration-200 hover:bg-destructive/10 hover:text-destructive',
                  collapsed && 'lg:flex-none',
                )}
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span className={cn('whitespace-nowrap', collapsed && 'lg:hidden')}>Déconnexion</span>
              </button>
              <DarkModeToggle />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
