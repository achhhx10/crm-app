import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, ChevronRight } from 'lucide-react';
import { api, getStoredUser } from '../lib/api';
import { Page } from '../components/Page';
import { Card, SkeletonKpis } from '../components/ui';

export function DashboardPage() {
  const [summary, setSummary] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const user = getStoredUser();

  useEffect(() => {
    Promise.all([
      api.dashboard.summary().then(setSummary).catch(() => {}),
      api.dashboard.activity().then(setActivity).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const hero = summary?.calls?.today ?? 0;

  return (
    <Page title={`Bonjour, ${user?.name || ''}`}>
      {loading ? (
        <SkeletonKpis />
      ) : (
        <Card>
          <p className="text-[13px] font-semibold text-muted-foreground">Appels aujourd'hui</p>
          <p className="font-mono-num text-[40px] leading-none font-bold text-primary mt-1">{hero}</p>
          <div className="flex gap-4 mt-3 text-[13px]">
            <span><strong className="font-mono-num">{summary?.contacts?.total ?? 0}</strong> <span className="text-muted-foreground">prospects</span></span>
            <span><strong className="font-mono-num">{summary?.deals?.signed ?? 0}</strong> <span className="text-muted-foreground">signés</span></span>
            <span><strong className="font-mono-num">{summary?.referrals?.total ?? 0}</strong> <span className="text-muted-foreground">reco.</span></span>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link to="/contacts" className="tactile min-h-[52px] rounded-lg bg-card border border-border font-semibold flex items-center justify-center gap-2 text-[15px]">
          Prospects <ChevronRight size={18} className="text-muted-foreground" />
        </Link>
        <Link to="/pipeline" className="tactile min-h-[52px] rounded-lg bg-card border border-border font-semibold flex items-center justify-center gap-2 text-[15px]">
          Pipeline <ChevronRight size={18} className="text-muted-foreground" />
        </Link>
      </div>

      <h2 className="text-[17px] font-bold mt-1">Activité récente</h2>
      {loading ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Chargement">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-3">
              <div className="skeleton h-4 w-1/2 mb-2" />
              <div className="skeleton h-3 w-1/4" />
            </div>
          ))}
        </div>
      ) : activity.length === 0 ? (
        <Card>
          <p className="text-muted-foreground text-sm text-center py-4">Aucune activité récente</p>
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
