import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { CallResultBadge } from '../components/ui/status-badges';
import { CallFormDialog } from '../components/ui/call-form-dialog';
import { Plus, Search, Phone } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { DateRangePicker } from '../components/ui/date-range';
import { ContactPicker, PickedContact } from '../components/ui/contact-picker';
import { OBJECTIONS, formatDate, formatDateTime, formatDuration } from '../lib/utils';

/** A scheduled callback that has passed its date. */
function isOverdue(nextStepAt: string | number | Date): boolean {
  return new Date(nextStepAt).getTime() < Date.now();
}

export function CallsPage() {
  const [onlyFollowUps, setOnlyFollowUps] = useState(false);
  const [filterContact, setFilterContact] = useState<PickedContact | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const rangePreset = searchParams.get('range') || 'month';
  const range = { from: searchParams.get('from') || '', to: searchParams.get('to') || '' };

  const onRangeChange = (next: { from: string; to: string }, nextPreset: string) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      params.set('range', nextPreset);
      if (next.from) params.set('from', next.from); else params.delete('from');
      if (next.to) params.set('to', next.to); else params.delete('to');
      return params;
    }, { replace: true });
  };

  const rangeParams = (): Record<string, string> => {
    const out: Record<string, string> = {};
    if (rangePreset !== 'all') {
      if (range.from) out.from = range.from;
      if (range.to) out.to = range.to;
    }
    return out;
  };
  const [calls, setCalls] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [contactFilter, setContactFilter] = useState('');

  useEffect(() => {
    loadCalls();
  }, [contactFilter, onlyFollowUps, rangePreset, range.from, range.to]);

  const loadCalls = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (contactFilter) params.contactId = contactFilter;
      if (onlyFollowUps) params.followUp = 'true';
      const [callsData, statsData] = await Promise.all([
        api.calls.list(params),
        api.calls.stats(rangeParams()),
      ]);
      // Tolerate both response shapes so the front-end survives a frontend-first deploy
      // (old API returns a bare array, new API returns { calls, total }).
      setCalls(callsData?.calls ?? []);
      setStats(statsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement...</p></div>;
  }

  return (
    <div className="space-y-6">
      <DateRangePicker value={range} preset={rangePreset} onChange={onRangeChange} />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total appels</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Aujourd'hui</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.today || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {stats?.range?.label ? 'Appels sur la période' : 'Appels'}
            </CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">RDV obtenus</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.rdvObtained || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-4 items-center">
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyFollowUps}
            onChange={(e) => setOnlyFollowUps(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Relances dues ou en retard
        </label>
        <div className="flex-1 min-w-[220px]">
          <label htmlFor="calls-contact-filter" className="text-sm font-medium">
            Filtrer par prospect
          </label>
          <ContactPicker
            id="calls-contact-filter"
            value={filterContact}
            onChange={(c) => setContactFilter(c ? String(c.id) : '')}
            placeholder="Tous les prospects — rechercher pour filtrer"
          />
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" /> Enregistrer un appel
        </Button>
      </div>

      {/* Calls Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Résultat</TableHead>
                <TableHead>Durée</TableHead>
                <TableHead>Objection</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Relance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.map((call) => (
                <TableRow key={call.id}>
                  <TableCell>{formatDateTime(call.date)}</TableCell>
                  <TableCell className="font-medium">{call.businessName || 'Sans contact'}</TableCell>
                  <TableCell>
                    <CallResultBadge result={call.result} />
                  </TableCell>
                  <TableCell>{formatDuration(call.duration)}</TableCell>
                  <TableCell>{call.objection ? OBJECTIONS[call.objection] || call.objection : '-'}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{call.notes || '-'}</TableCell>
                  <TableCell>
                    {call.nextStepAt ? (
                      <div className="flex flex-col gap-0.5">
                        <span className={isOverdue(call.nextStepAt) ? 'text-xs font-medium text-destructive' : 'text-xs font-medium text-foreground'}>
                          {formatDate(call.nextStepAt)}
                          {isOverdue(call.nextStepAt) && ' · en retard'}
                        </span>
                        {call.nextStep && <span className="text-xs text-muted-foreground">{call.nextStep}</span>}
                      </div>
                    ) : call.nextStep ? (
                      <span className="text-xs text-muted-foreground">{call.nextStep} (sans date)</span>
                    ) : '-'}
                  </TableCell>
                </TableRow>
              ))}
              {calls.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Aucun appel enregistré
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Call Dialog */}
      <CallFormDialog
        open={showForm}
        allowContactChoice
        defaultResult="pas_decroche"
        onClose={() => setShowForm(false)}
        onSaved={loadCalls}
      />
    </div>
  );
}
