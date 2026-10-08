import { Link, useNavigate } from 'react-router-dom';
import { Users, LogOut, Moon, Sun, ChevronRight, Download, Handshake } from 'lucide-react';
import { api, getStoredUser } from '../lib/api';
import { Page } from '../components/Page';
import { Card } from '../components/ui';
import { useEffect, useState } from 'react';

export function MorePage() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const isAdmin = user?.role === 'admin';
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('crm_mobile_theme', dark ? 'dark' : 'light');
  }, [dark]);

  function logout() {
    api.auth.logout();
    navigate('/login');
  }

  return (
    <Page title="Plus">
      <Card>
        <p className="font-bold text-[16px]">{user?.name}</p>
        <p className="text-[14px] text-muted-foreground">{user?.email} · {user?.role}</p>
      </Card>

      <Card className="!p-2">
        <Link to="/deals" className="flex items-center gap-3 min-h-[56px] px-3 rounded-xl active:bg-muted">
          <span className="text-[20px] font-bold text-primary">€</span>
          <span className="flex-1 font-medium">Deals</span>
          <ChevronRight size={20} className="text-muted-foreground" />
        </Link>
        <Link to="/referrals" className="flex items-center gap-3 min-h-[56px] px-3 rounded-xl active:bg-muted">
          <Handshake size={22} className="text-primary" />
          <span className="flex-1 font-medium">Recommandations</span>
          <ChevronRight size={20} className="text-muted-foreground" />
        </Link>
        {isAdmin && (
          <>
            <Link to="/import" className="flex items-center gap-3 min-h-[56px] px-3 rounded-xl active:bg-muted">
              <Download size={22} className="text-primary" />
              <span className="flex-1 font-medium">Import</span>
              <ChevronRight size={20} className="text-muted-foreground" />
            </Link>
            <Link to="/users" className="flex items-center gap-3 min-h-[56px] px-3 rounded-xl active:bg-muted">
              <Users size={22} className="text-primary" />
              <span className="flex-1 font-medium">Utilisateurs</span>
              <ChevronRight size={20} className="text-muted-foreground" />
            </Link>
          </>
        )}
        <button onClick={() => setDark(!dark)} className="w-full flex items-center gap-3 min-h-[56px] px-3 rounded-xl active:bg-muted text-left">
          {dark ? <Sun size={22} className="text-primary" /> : <Moon size={22} className="text-primary" />}
          <span className="flex-1 font-medium">Thème {dark ? 'clair' : 'sombre'}</span>
        </button>
        <button onClick={logout} className="w-full flex items-center gap-3 min-h-[56px] px-3 rounded-xl active:bg-muted text-left text-destructive">
          <LogOut size={22} />
          <span className="flex-1 font-medium">Déconnexion</span>
        </button>
      </Card>
    </Page>
  );
}
