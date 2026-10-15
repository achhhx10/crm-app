import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  Banknote, FileText, Target, BellRing, AlertTriangle, Trophy, Gift, Phone,
  Globe, Radar, CircuitBoard,
} from 'lucide-react';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { DateRangePicker } from '../components/ui/date-range';
import { RadialProgress } from '../components/bits/RadialProgress';
import { MicroBar } from '../components/bits/MicroBar';
import { TrendDelta } from '../components/bits/TrendDelta';
import { FunnelChart, FunnelStep } from '../components/bits/FunnelChart';
import { CountUp } from '../components/bits/CountUp';
import { TWEPerformanceChart } from '../components/bits/TWEPerformanceChart';
import { useToast } from '../components/ui/toast';
import { formatCurrency, formatDate, formatSource, CALL_RESULTS, OBJECTIONS } from '../lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { PerformanceData, ActivityItem, ObjectionBreakdown, PipelineData, FunnelStage } from '../types';

/**
 * Three levels of reading, most decision first:
 *   1. vital metrics   — money in, money on the table, hit rate
 *   2. funnel          — where prospects are lost between stages
 *   3. tactical table  — which origin actually converts
 *
 * Every figure comes from a route that reads the database. Website visits,
 * inbound requests and ROI are absent on purpose: nothing here records traffic
 * or spend, so showing them would mean showing zeros.
 */

function VitalCard({
  icon: Icon,
  title,
  value,
  sub,
  children,
  tone = 'text-primary',
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  children?: React.ReactNode;
  tone?: string;
}) {
  return (
    <Card className="h-full">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className={`flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 ${tone}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-3 font-mono text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {sub}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { toast } = useToast();
  const reduce = useReducedMotion();

  const [searchParams, setSearchParams] = useSearchParams();
  const preset = searchParams.get('range') || 'month';
  const range = { from: searchParams.get('from') || '', to: searchParams.get('to') || '' };

  const onRangeChange = useCallback((next: { from: string; to: string }, nextPreset: string) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      params.set('range', nextPreset);
      if (next.from) params.set('from', next.from); else params.delete('from');
      if (next.to) params.set('to', next.to); else params.delete('to');
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const [kpis, setKpis] = useState<any>(null);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [funnelNote, setFunnelNote] = useState('');
  const [sources, setSources] = useState<any[]>([]);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [friction, setFriction] = useState<any>(null);
  const [sourcesNote, setSourcesNote] = useState('');
  const [pipelineData, setPipelineData] = useState<PipelineData | null>(null);
  const [performance, setPerformance] = useState<PerformanceData[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [objections, setObjections] = useState<ObjectionBreakdown | null>(null);
  const [dueCount, setDueCount] = useState({ total: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, range.from, range.to]);

  const loadData = async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (preset !== 'all') {
      if (range.from) params.from = range.from;
      if (range.to) params.to = range.to;
    }
    try {
      const [k, f, src, diag, p, perf, act, obj, due] = await Promise.all([
        api.dashboard.kpis(params),
        api.dashboard.funnel(params),
        api.dashboard.sources(params),
        api.dashboard.diagnostics(params),
        api.dashboard.pipeline(),
        api.dashboard.performance(params),
        api.dashboard.activity(params),
        api.dashboard.objections(params),
        api.calls.dueCount(),
      ]);
      setKpis(k);
      setFunnel(f.steps || []);
      setFriction(f.friction ?? null);
      setDiagnostics(diag ?? null);
      setFunnelNote(f.note || '');
      setSources(src.rows || []);
      setSourcesNote(src.note || '');
      setPipelineData(p.pipeline);
      setPerformance(perf.performance || []);
      setActivity(act.activity || []);
      setObjections(obj);
      setDueCount(due || { total: 0, overdue: 0 });
    } catch (err) {
      console.error('Dashboard load error:', err);
      toast('Impossible de charger le tableau de bord', 'error');
    } finally {
      setLoading(false);
    }
  };

  const periodLabel = (() => {
    if (!kpis?.range) return '';
    const days = kpis.range.days > 0 ? ` (${kpis.range.days} jours)` : '';
    const compare = kpis.previousRange ? ` · comparaison ${kpis.previousRange.label}` : '';
    return `Période analysée : ${kpis.range.label}${days}${compare}`;
  })();

  const cycle = diagnostics?.cycle?.signedCount
    ? diagnostics.cycle
    : null;
  const stalled = diagnostics?.openQuotes?.count
    ? diagnostics.openQuotes
    : null;

  const params = (() => {
    const out: Record<string, string> = {};
    if (preset !== 'all') {
      if (range.from) out.from = range.from;
      if (range.to) out.to = range.to;
    }
    return out;
  })();

  const item = {
    hidden: reduce ? {} : { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const } },
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="card" className="h-16" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} variant="card" className="h-32" />)}
        </div>
        <Skeleton variant="card" className="h-[360px]" />
      </div>
    );
  }

  const pipelineChart = pipelineData
    ? Object.entries(pipelineData).map(([key, value]) => ({ name: key, value }))
    : [];

  const maxSigned = Math.max(...sources.map(r => r.signedAmount ?? 0), 1);
  const maxQuotes = Math.max(...sources.map(r => r.quotes ?? 0), 1);
  const maxProspects = Math.max(...sources.map(r => r.prospects ?? 0), 1);

  return (
    <motion.div className="space-y-6" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }}>
      <motion.div variants={item} className="flex flex-wrap items-center justify-between gap-3">
        <DateRangePicker value={range} preset={preset} onChange={onRangeChange} />
        {kpis?.range && <p className="text-sm text-muted-foreground">{periodLabel}</p>}
      </motion.div>

      {/* NIVEAU 1 — métriques vitales */}
      <motion.section variants={item} aria-labelledby="niveau1">
        <h2 id="niveau1" className="sr-only">Métriques vitales</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <VitalCard
            icon={Banknote}
            title="CA signé"
            value={<><CountUp to={kpis?.revenueSigned || 0} duration={1.2} /> €</>}
            sub={<>
              <TrendDelta value={kpis?.revenueTrend} />
              <span>vs période précédente</span>
            </>}
          />
          <VitalCard
            icon={FileText}
            title="Devis en cours"
            value={<CountUp to={kpis?.openQuotes?.count || 0} duration={1.2} />}
            tone="text-info"
            sub={<>
              <span className="tabular-nums">{formatCurrency(kpis?.openQuotes?.amount || 0)}</span>
              <span>en jeu</span>
            </>}
          />
          <VitalCard
            icon={Target}
            title="Devis créés"
            value={<CountUp to={kpis?.dealsCreated || 0} duration={1.2} />}
            tone="text-warning"
            sub={<>
              <span className="tabular-nums">{kpis?.dealsSigned || 0}</span>
              <span>signés sur la période</span>
            </>}
          />
          <Card className="h-full">
            <CardContent className="flex h-full flex-col items-center justify-center gap-1 p-5">
              <p className="self-start text-sm font-medium text-muted-foreground">Taux de closing</p>
              <RadialProgress
                value={kpis?.closingRate ?? 0}
                caption="closing"
                tone="success"
                size={96}
              />
              <TrendDelta value={kpis?.closingRateTrend} />
            </CardContent>
          </Card>
        </div>
      </motion.section>

      {dueCount.total > 0 && (
        <motion.div variants={item}>
          <Link
            to="/followups"
            className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-destructive/10">
              <BellRing className="h-5 w-5 text-destructive neon" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {dueCount.total} relance{dueCount.total > 1 ? 's' : ''} à faire
              </p>
              <p className="text-sm text-muted-foreground">
                {dueCount.overdue > 0 ? `dont ${dueCount.overdue} en retard` : 'aucune en retard'}
              </p>
            </div>
            <Button variant="outline" size="sm">Ouvrir</Button>
          </Link>
        </motion.div>
      )}

      {/* NIVEAU 2 — entonnoir */}
      <motion.div variants={item}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radar className="h-4 w-4 text-primary" /> Entonnoir de vente
            </CardTitle>
            <CardDescription>
              Où les prospects se perdent. Chaque barre est dimensionnée par rapport à l'étape
              précédente, sinon les dernières étapes disparaissent sous les 39 000 prospects.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(friction || cycle || stalled) && (
              <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {friction && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" /> Point de fuite
                    </p>
                    <p className="mt-1 text-sm">
                      {friction.conversion > 0 && friction.conversion < 1 ? '<1 %' : `${friction.conversion} %`}
                      <span className="text-muted-foreground"> arrive à {friction.label.toLowerCase()}</span>
                    </p>
                  </div>
                )}
                {cycle && (
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Cycle de vente</p>
                    <p className="mt-1 text-sm">
                      {cycle.medianDays ?? cycle.averageDays ?? '—'} jours
                      <span className="text-muted-foreground"> pour signer un devis</span>
                    </p>
                  </div>
                )}
                {stalled && (
                  <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                    <p className="text-xs font-medium text-warning">Devis en attente</p>
                    <p className="mt-1 text-sm">
                      {stalled.oldestAgeDays} jours
                      <span className="text-muted-foreground"> sans réponse, {formatCurrency(stalled.oldestAmount)}</span>
                    </p>
                  </div>
                )}
              </div>
            )}
            {funnel.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Aucune donnée</p>
            ) : (
              <FunnelChart steps={funnel} note={funnelNote} />
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* NIVEAU 3 — pilotage tactique */}
      <motion.div variants={item}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircuitBoard className="h-4 w-4 text-info" /> Pilotage par origine
            </CardTitle>
            <CardDescription>
              D'où viennent les prospects et lesquels convertissent. {sourcesNote}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {sources.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Aucune donnée</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Origine</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Prospects</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Qualifiés</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Devis</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Signés (€)</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Closing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map(row => (
                      <tr key={row.source} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium">
                          {formatSource(row.source)}
                        </td>
                        <td className="px-4 py-3">
                          <MicroBar value={row.prospects} max={maxProspects} tone="muted" showLabel />
                        </td>
                        <td className="px-4 py-3">
                          <MicroBar value={row.qualified} max={maxProspects} tone="primary" showLabel />
                        </td>
                        <td className="px-4 py-3">
                          <MicroBar value={row.quotes} max={maxQuotes} tone="info" showLabel />
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {formatCurrency(row.quotesAmount)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <MicroBar value={row.signedAmount} max={maxSigned} tone="success" showLabel={false} />
                          <span className="text-xs tabular-nums">{formatCurrency(row.signedAmount)}</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.closingRate !== null ? (
                            <span className={row.closingRate >= 20 ? 'text-success' : 'text-muted-foreground'}>
                              {row.closingRate}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Pilotage complémentaire */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div variants={item}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Pipeline de vente</CardTitle>
              <CardDescription>Prospects par étape</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={pipelineChart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} animationDuration={1200} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Objections</CardTitle>
              <CardDescription>Ce qui bloque le plus sur la période</CardDescription>
            </CardHeader>
            <CardContent>
              {!objections || objections.objections.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Aucune objection enregistrée sur la période
                </p>
              ) : (
                <div className="space-y-2">
                  {objections.objections.map(o => (
                    <div key={o.objection} className="flex items-center gap-3">
                      <AlertTriangle
                        className={`h-4 w-4 shrink-0 ${o.share >= 40 ? 'text-destructive' : 'text-muted-foreground'}`}
                      />
                      <span className="flex-1 truncate text-sm">
                        {OBJECTIONS[o.objection] || o.objection}
                      </span>
                      <div className="h-2 w-28 overflow-hidden rounded bg-muted">
                        <div className="h-full bg-primary/80" style={{ width: `${o.share}%` }} />
                      </div>
                      <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                        {o.occurrences} · {o.share}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div variants={item}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-info" /> Performance par démarcheur
              </CardTitle>
              <CardDescription>Appels passés vs RDV obtenus</CardDescription>
            </CardHeader>
            <CardContent>
              {performance.length > 0 ? (
                <TWEPerformanceChart data={performance} />
              ) : (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  Aucune donnée de performance
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Activité récente</CardTitle>
              <CardDescription>20 derniers appels de la période</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {activity.map(feed => (
                  <Link
                    key={feed.id}
                    to={feed.contactId ? `/contacts/${feed.contactId}` : '/contacts'}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3 transition-colors hover:bg-muted/60"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Phone className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span className="font-medium">{feed.userName || 'Utilisateur'}</span>
                        {' a appelé '}
                        <span className="font-medium">{feed.contactName || 'Prospect'}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {CALL_RESULTS[feed.result] || feed.result} · {formatDate(feed.date)}
                      </p>
                    </div>
                    <Gift className="hidden h-4 w-4 shrink-0 text-muted-foreground/40 sm:block" />
                  </Link>
                ))}
                {activity.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">Aucune activité récente</p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
