import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, KanbanSquare } from 'lucide-react';
import { api } from '../lib/api';
import { Page } from '../components/Page';
import { Button, Card, EmptyState, Sheet, StageBadge, STAGES, stageLabel } from '../components/ui';

export function PipelinePage() {
  const [groups, setGroups] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [moveTarget, setMoveTarget] = useState<any>(null);
  const [moving, setMoving] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const data = await api.contacts.list({ limit: '1000', sortBy: 'created_at', sortDir: 'desc' });
      const g: Record<string, any[]> = {};
      for (const s of STAGES) g[s] = [];
      for (const c of data.contacts) {
        (g[c.stage] || (g[c.stage] = [])).push(c);
      }
      setGroups(g);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function moveTo(contact: any, stage: string) {
    if (contact.stage === stage) {
      setMoveTarget(null);
      return;
    }
    setMoving(true);
    try {
      await api.contacts.bulkStage([contact.id], stage);
      setMoveTarget(null);
      refresh();
    } finally {
      setMoving(false);
    }
  }

  async function step(contact: any, dir: 1 | -1) {
    const i = STAGES.indexOf(contact.stage);
    const next = STAGES[Math.min(STAGES.length - 1, Math.max(0, i + dir))];
    if (next !== contact.stage) {
      await api.contacts.bulkStage([contact.id], next);
      refresh();
    }
  }

  return (
    <Page title="Pipeline">
      {loading ? (
        <div className="flex gap-3 overflow-hidden" aria-busy="true" aria-label="Chargement">
          {[0, 1].map((i) => (
            <div key={i} className="min-w-[270px] bg-card border border-border rounded-lg p-3">
              <div className="skeleton h-4 w-1/2 mb-3" />
              <div className="skeleton h-16 w-full mb-2" />
              <div className="skeleton h-16 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4 px-4 pb-2">
          {STAGES.map((stage) => (
            <section key={stage} className="min-w-[270px] max-w-[270px] snap-start shrink-0">
              <div className="flex items-center justify-between mb-2 px-1">
                <h2 className="font-bold text-[15px]">{stageLabel(stage)}</h2>
                <span className="font-mono-num text-[13px] font-semibold text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">
                  {(groups[stage] || []).length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {(groups[stage] || []).length === 0 && (
                  <p className="text-[13px] text-muted-foreground text-center py-4">Vide</p>
                )}
                {(groups[stage] || []).map((c) => (
                  <Card key={c.id} className="!p-3">
                    <Link to={`/contacts/${c.id}`} className="block min-w-0">
                      <p className="font-semibold text-[15px] truncate">{c.businessName}</p>
                      <p className="text-[13px] text-muted-foreground truncate">{c.city || '—'}</p>
                    </Link>
                    <div className="flex items-center gap-1 mt-2">
                      <button
                        onClick={() => step(c, -1)}
                        disabled={STAGES.indexOf(c.stage) === 0}
                        aria-label="Étape précédente"
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg active:bg-muted disabled:opacity-30"
                      >
                        <ArrowLeft size={20} />
                      </button>
                      <button
                        onClick={() => setMoveTarget(c)}
                        className="flex-1 min-h-[44px] px-2 rounded-lg bg-muted text-[13px] font-semibold truncate active:opacity-80"
                      >
                        Déplacer ▾
                      </button>
                      <button
                        onClick={() => step(c, 1)}
                        disabled={STAGES.indexOf(c.stage) === STAGES.length - 1}
                        aria-label="Étape suivante"
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg active:bg-muted disabled:opacity-30"
                      >
                        <ArrowRight size={20} />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {!loading && Object.values(groups).flat().length === 0 && (
        <EmptyState icon={<KanbanSquare size={36} />} title="Pipeline vide" />
      )}

      <Sheet open={!!moveTarget} onClose={() => setMoveTarget(null)} title={`Déplacer ${moveTarget?.businessName || ''}`}>
        <div className="flex flex-col gap-2">
          {STAGES.map((s) => (
            <button
              key={s}
              disabled={moving || moveTarget?.stage === s}
              onClick={() => moveTarget && moveTo(moveTarget, s)}
              className="min-h-[52px] px-4 rounded-xl bg-card border border-border font-semibold text-left active:bg-muted disabled:opacity-40 flex items-center justify-between"
            >
              <StageBadge stage={s} />
              {moveTarget?.stage === s && <span className="text-[13px] text-muted-foreground">actuel</span>}
            </button>
          ))}
          {moving && <p className="text-center text-muted-foreground">Déplacement…</p>}
        </div>
      </Sheet>

      <Button variant="secondary" onClick={refresh}>Actualiser</Button>
    </Page>
  );
}
