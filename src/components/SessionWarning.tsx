import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function parseJwt(token: string): any {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

export function SessionWarning() {
  const [show, setShow] = useState(false);
  const [minutesLeft, setMinutesLeft] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const interval = setInterval(() => {
      const token = localStorage.getItem('crm_token');
      if (!token) { setShow(false); return; }

      const payload = parseJwt(token);
      if (!payload || !payload.exp) { setShow(false); return; }

      const now = Math.floor(Date.now() / 1000);
      const remaining = payload.exp - now;

      if (remaining <= 0) {
        localStorage.removeItem('crm_token');
        localStorage.removeItem('crm_user');
        navigate('/login');
        return;
      }

      if (remaining <= 300) {
        setMinutesLeft(Math.ceil(remaining / 60));
        setShow(true);
      } else {
        setShow(false);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [navigate]);

  const handleRefresh = async () => {
    try {
      const token = localStorage.getItem('crm_token');
      if (!token) return;
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('crm_token', data.token);
        setShow(false);
      }
    } catch {
      // ignore
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    navigate('/login');
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
        <h2 className="text-lg font-semibold mb-2">Session expire bientôt</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Votre session expire dans {minutesLeft} minute{minutesLeft > 1 ? 's' : ''}.
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={handleLogout} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg">
            Déconnexion
          </button>
          <button onClick={handleRefresh} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">
            Rester connecté
          </button>
        </div>
      </div>
    </div>
  );
}
