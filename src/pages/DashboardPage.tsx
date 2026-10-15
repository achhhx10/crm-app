import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { SpotlightCard } from '../components/bits/SpotlightCard';
import { CountUp } from '../components/bits/CountUp';
import { TWEPerformanceChart } from '../components/bits/TWEPerformanceChart';
import { Phone, Target, TrendingUp, DollarSign, Gift, AlertTriangle, Trophy } from 'lucide-react';
import { formatDate, STAGES, CALL_RESULTS, OBJECTIONS } from '../lib/utils';
import { DateRangePicker, rangeForPreset } from '../components/ui/date-range';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { DashboardSummary, PipelineData, PerformanceData, ActivityItem, ObjectionBreakdown, FunnelStage } from '../types';

function KpiCard({
  icon: Icon,
  title,
  value,
  sub,
  iconClass = 'text-muted-foreground',
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: React.ReactNode;
  sub: string;
  iconClass?: string;
  children?: React.ReactNode;
}) {
  return (
    <SpotlightCard className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className={`flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 ${iconClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 font-mono text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      {children}
    </SpotlightCard>
  );
}

export function DashboardPage() {
  // The window is in the URL so a report can be shared and survives a refresh.
  const [searchParams, setSearchParams] = useSearchParams();
  const preset = searchParams.get('range') || 'month';
  const range = {
    from: searchParams.get('from') || '',
    to: searchParams.get('to') || '',
  };

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [pipelineData, setPipelineData] = useState<PipelineData | null>(null);
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);
  const [winRate, setWinRate] = useState<number | null>(null);
  const [performance, setPerformance] = useState<PerformanceData[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [objections, setObjections] = useState<ObjectionBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const reduce = useReducedMotion();

  const onRangeChange = useCallback((next: { from: string; to: string }, nextPreset: string) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      params.set('range', nextPreset);
      if (next.from) params.set('from', next.from);
      else params.delete('from');
      if (next.to) params.set('to', next.to);
      else params.delete('to');
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, range.from, range.to]);

  const loadData = async () => {
    setLoading(true);
    // "all" means no bounds: the server defaults to the current month, so the
    // params must be absent rather than empty for that to mean anything.
    const params: Record<string, string> = {};
    if (preset !== 'all') {
      if (range.from) params.from = range.from;
      if (range.to) params.to = range.to;
    }
    try {
      const [s, p, perf, act, obj] = await Promise.all([
        api.dashboard.summary(params),
        api.dashboard.pipeline(),
        api.dashboard.performance(params),
        api.dashboard.activity(params),
        api.dashboard.objections(params),
      ]);
      setSummary(s);
      setPipelineData(p.pipeline);
      setFunnel(p.funnel || []);
      setWinRate(p.winRate ?? null);
      setPerformance(perf.performance || []);
      setActivity(act.activity || []);
      setObjections(obj);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="card" className="h-16" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="card" className="h-32 p-5">
              <Skeleton className="mb-3 h-4 w-24" />
              <Skeleton className="h-8 w-20" />
            </Skeleton>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton variant="card" className="h-[360px]" />
          <Skeleton variant="card" className="h-[360px]" />
        </div>
        <Skeleton variant="card" className="h-64" />
      </div>
    );
  }

  const pipelineChart = pipelineData ? Object.entries(pipelineData).map(([key, value]) => ({
    name: STAGES[key]?.label || key,
    value,
  })) : [];

  const container = {
    hidden: {},
    show: reduce ? {} : { transition: { staggerChildren: 0.05 } },
  };

  const item = {
    hidden: reduce ? {} : { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const } },
  };

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="show">
      {/* Reporting period */}
      <motion.div variants={item} className="flex flex-wrap items-center justify-between gap-3">
        <DateRangePicker value={range} preset={preset} onChange={onRangeChange} />
        {summary?.range && (
          <p className="text-sm text-muted-foreground">
            Période analysée : {summary.range.label}
            {summary.range.days > 0 && ` (${summary.range.days} jours)`}
          </p>
        )}
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={item} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Phone}
          title="Appels sur la période"
          value={<CountUp to={summary?.calls.total || 0} duration={1.2} />}
          sub={`${summary?.calls.today || 0} aujourd'hui`}
          iconClass="text-blue-600 dark:text-blue-400"
        />
        <KpiCard
          icon={Target}
          title="Taux de connexion"
          value={<><CountUp to={summary?.calls.connectionRate || 0} duration={1.2} />%</>}
          sub={`${summary?.calls.answered || 0} décrochés / ${summary?.calls.total || 0} · ${summary?.calls.meetingRate || 0}% de RDV`}
          iconClass="text-amber-600 dark:text-amber-400"
        />
        <KpiCard
          icon={TrendingUp}
          title="Deals signés"
          value={<CountUp to={summary?.deals.signed || 0} duration={1.2} />}
          sub={`${summary?.deals.total || 0} deals · ${summary?.deals.closingRate || 0}% signés`}
          iconClass="text-success"
        />
        <KpiCard
          icon={DollarSign}
          title="CA signé sur la période"
          value={<><CountUp to={summary?.deals.revenue || 0} duration={1.2} /> €</>}
          sub={`${Math.round(summary?.deals.openPipeline || 0).toLocaleString('fr-FR')} € en cours · ${summary?.referrals.signed || 0} reco. signées`}
          iconClass="text-amber-600 dark:text-amber-400"
        />
      </motion.div>

      {/* Pipeline Chart + Performance */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div variants={item}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Pipeline de vente</CardTitle>
              <CardDescription>Prospects par étape</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
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
              <CardTitle>Performance par démarcheur</CardTitle>
              <CardDescription>Appels passés vs RDV obtenus</CardDescription>
            </CardHeader>
            <CardContent>
              {performance.length > 0 ? (
                <TWEPerformanceChart data={performance} />
              ) : (
                <p className="py-20 text-center text-sm text-muted-foreground">
                  Aucune donnée de performance
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Funnel + objections */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div variants={item}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Entonnoir</CardTitle>
              <CardDescription>
                Répartition actuelle par étape. Sans historique de changement d'étape, ce n'est pas un taux de
                conversion dans le temps : le pourcentage indique combien de prospects de l'étape précédente sont
                encore à celle-ci.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {funnel.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Aucune donnée</p>
              ) : (
                <div className="space-y-2">
                  {funnel.map(f => {
                    const max = Math.max(...funnel.map(x => x.count), 1);
                    return (
                      <div key={f.stage} className="flex items-center gap-3">
                        <span className="w-32 shrink-0 truncate text-sm text-muted-foreground">
                          {STAGES[f.stage]?.label || f.stage}
                        </span>
                        <div className="h-6 flex-1 overflow-hidden rounded bg-muted/50">
                          <div
                            className="flex h-full items-center justify-end rounded bg-primary/80 px-2 text-xs font-medium text-primary-foreground"
                            style={{ width: `${Math.max(2, Math.round((f.count / max) * 100))}%` }}
                          >
                            {f.count}
                          </div>
                        </div>
                        <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                          {f.reachRate !== null ? `${f.reachRate}%` : '—'}
                        </span>
                      </div>
                    );
                  })}
                  {winRate !== null && (
                    <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                      <Trophy className="h-4 w-4 text-amber-500" />
                      <span>
                        Taux de victoire sur les prospects clos : <strong>{winRate}%</strong>
                      </span>
                    </div>
                  )}
                </div>
              )}
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
                <p className="py-8 text-center text-sm text-muted-foreground">
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

      {/* Activity Feed */}
      <motion.div variants={item}>
        <Card>
          <CardHeader>
            <CardTitle>Activité récente</CardTitle>
            <CardDescription>Derniers appels passés</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activity.map((feed) => (
                <motion.div
                  key={feed.id}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                >
                <Link
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
                </motion.div>
              ))}
              {activity.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Aucune activité récente
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}