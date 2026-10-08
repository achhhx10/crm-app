import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { api, getStoredUser } from '../lib/api';
import { Page } from '../components/Page';
import { Card } from '../components/ui';

export function DashboardPage() {
  const [summary, setSummary] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const user = getStoredUser();

  useEffect(() => {
    api.dashboard.summary().then(setSummary).catch(() => {});
    api.dashboard.activity().then(setActivity).catch(() => {});
  }, []);

  return (
    <Page title={`Bonjour, ${user?.name || ''}`}>
      <div className="grid grid-cols-2 gap-2">
        <Link to="/contacts">
          <Card className="text-center active:opacity-80">
            <p className="text-[26px] font-bold">{summary?.contacts?.total ?? '—'}</p>
            <p className="text-[13px] text-muted-foreground">Prospects</p>
          </Card>
        </Link>
        <Link to="/calls">
          <Card className="text-center active:opacity-80">
            <p className="text-[26px] font-bold">{summary?.calls?.today ?? '—'}</p>
            <p className="text-[13px] text-muted-foreground">Appels du jour</p>
          </Card>
        </Link>
        <Link to="/deals">
          <Card className="text-center active:opacity-80">
            <p className="text-[26px] font-bold">{summary?.deals?.signed ?? '—'}</p>
            <p className="text-[13px] text-muted-foreground">Deals signés</p>
          </Card>
        </Link>
        <Link to="/pipeline">
          <Card className="text-center active:opacity-80">
            <p className="text-[26px] font-bold">{summary?.referrals?.total ?? '—'}</p>
            <p className="text-[13px] text-muted-foreground">Recommandations</p>
          </Card>
        </Link>
      </div>

      <h2 className="text-[17px] font-bold mt-2">Activité récente</h2>
      {activity.length === 0 ? (
        <Card>
          <p className="text-muted-foreground text-[14px] text-center py-4">Aucune activité récente</p>
        </Card>
      ) : (
        activity.slice(0, 8).map((a: any) => (
          <Card key={a.id} className="!py-3">
            <div className="flex items-center gap-3">
              <span className="min-h-[44px] min-w-[44px] rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Phone size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[15px] truncate">{a.contactName || '—'}</p>
                <p className="text-[13px] text-muted-foreground truncate">
                  {a.result} · {a.userName || ''}
                </p>
              </div>
            </div>
          </Card>
        ))
      )}
    </Page>
  );
}
