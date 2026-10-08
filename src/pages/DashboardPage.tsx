import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { SpotlightCard } from '../components/bits/SpotlightCard';
import { CountUp } from '../components/bits/CountUp';
import { TWEPerformanceChart } from '../components/bits/TWEPerformanceChart';
import { Phone, Target, TrendingUp, DollarSign, Gift } from 'lucide-react';
import { formatDate, STAGES, CALL_RESULTS } from '../lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { DashboardSummary, PipelineData, PerformanceData, ActivityItem } from '../types';

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
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [performance, setPerformance] = useState<PerformanceData[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const reduce = useReducedMotion();

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      const [s, p, perf, act] = await Promise.all([
        api.dashboard.summary(),
        api.dashboard.pipeline(),
        api.dashboard.performance(),
        api.dashboard.activity(),
      ]);
      setSummary(s);
      setPipeline(p);
      setPerformance(perf);
      setActivity(act);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
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

  const pipelineData = pipeline ? Object.entries(pipeline).map(([key, value]) => ({
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
      {/* KPI Cards */}
      <motion.div variants={item} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Phone}
          title="Appels ce mois"
          value={<CountUp to={summary?.calls.month || 0} duration={1.2} />}
          sub={`${summary?.calls.today || 0} aujourd'hui`}
          iconClass="text-blue-600 dark:text-blue-400"
        />
        <KpiCard
          icon={Target}
          title="Taux de connexion"
          value={<><CountUp to={summary?.calls.connectionRate || 0} duration={1.2} />%</>}
          sub={`${summary?.calls.answered || 0} / ${summary?.calls.total || 0} appels`}
          iconClass="text-amber-600 dark:text-amber-400"
        />
        <KpiCard
          icon={TrendingUp}
          title="Deals signés"
          value={<CountUp to={summary?.deals.signed || 0} duration={1.2} />}
          sub={`Taux: ${summary?.deals.closingRate || 0}%`}
          iconClass="text-success"
        />
        <KpiCard
          icon={DollarSign}
          title="CA du mois"
          value={<><CountUp to={summary?.deals.monthRevenue || 0} duration={1.2} /> €</>}
          sub={`${summary?.referrals.signed || 0} recommandations signées`}
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
                <BarChart data={pipelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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