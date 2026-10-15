import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Skeleton } from '../components/ui/skeleton';
import { useToast } from '../components/ui/toast';
import { BellRing, Phone, PhoneCall, ExternalLink, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { CALL_RESULTS, OBJECTIONS, formatDate } from '../lib/utils';
import type { DueFollowUp } from '../types';

/**
 * Leads awaiting a callback.
 *
 * The phoning queue is deliberately the cold list: log a call and the lead
 * leaves it. This page is where a scheduled callback comes back to life, so
 * "I wrote myself a reminder" becomes something that actually resurfaces.
 */
export function FollowUpsPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<DueFollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  const [calling, setCalling] = useState<DueFollowUp | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    result: 'interesse',
    objection: '',
    notes: '',
    nextStep: '',
    nextStepAt: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.calls.due();
      setItems(res.items || []);
    } catch (err) {
      console.error('Follow-ups load error:', err);
      toast('Impossible de charger les relances', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openCall = (item: DueFollowUp) => {
    setCalling(item);
    setForm({ result: 'interesse', objection: '', notes: '', nextStep: '', nextStepAt: '' });
  };

  const saveCall = async () => {
    if (!calling) return;
    setSaving(true);
    try {
      await api.calls.create({
        contactId: calling.contactId,
        result: form.result,
        objection: form.objection || undefined,
        notes: form.notes || undefined,
        nextStep: form.nextStep || undefined,
        nextStepAt: form.nextStepAt || undefined,
      });
      // This call supersedes the pending follow-up, so the row leaves the list
      // on reload: the "last call per contact" rule that powers /calls/due.
      setCalling(null);
      toast('Appel enregistré', 'success');
      load();
    } catch (err) {
      toast("Erreur lors de l'enregistrement de l'appel", 'error');
    } finally {
      setSaving(false);
    }
  };

  const visible = onlyOverdue ? items.filter(i => i.overdue) : items;
  const overdueCount = items.filter(i => i.overdue).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton variant="card" className="h-20" />
        {[0, 1, 2].map(i => <Skeleton key={i} variant="card" className="h-16" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">À relancer</h1>
          <p className="text-sm text-muted-foreground">
            Prospects dont la date de rappel est échue. Une relance disparaît dès que vous les rappellez.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex min-h-[40px] items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyOverdue}
              onChange={(e) => setOnlyOverdue(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            En retard uniquement
          </label>
          <Button variant="outline" onClick={load}>Actualiser</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <BellRing className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-semibold tabular-nums">{items.length}</p>
              <p className="text-xs text-muted-foreground">relances à faire</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-2xl font-semibold tabular-nums">{overdueCount}</p>
              <p className="text-xs text-muted-foreground">en retard</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CheckCircle2 className="h-8 w-8 text-success" />
            <p className="font-medium">Rien à relancer</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Depuis la page Phoning, renseignez une date de rappel en enregistrant un appel : le
              prospect apparaîtra ici à l'échéance.
            </p>
            <Button variant="outline" className="mt-2" onClick={() => navigate('/phoning')}>
              <PhoneCall className="mr-2 h-4 w-4" /> Ouvrir le phoning
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Relances échues</CardTitle>
            <CardDescription>Les plus anciennes d'abord</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {visible.map(item => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-[180px] flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/contacts/${item.contactId}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {item.businessName || `#${item.contactId}`}
                      </Link>
                      {item.overdue && <Badge variant="destructive">En retard</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[item.city, item.phone].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>

                  <div className="min-w-[200px]">
                    <p className="text-sm">
                      <span className="text-muted-foreground">Rappel : </span>
                      {formatDate(item.nextStepAt)}
                    </p>
                    {item.nextStep && <p className="text-xs text-muted-foreground">{item.nextStep}</p>}
                  </div>

                  <div className="flex gap-1">
                    {item.phone && (
                      <a href={`tel:${item.phone.replace(/\s/g, '')}`} aria-label={`Appeler ${item.businessName}`}>
                        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" title={item.phone}>
                          <Phone className="h-4 w-4 text-green-600" />
                        </Button>
                      </a>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openCall(item)}>
                      Rappeler
                    </Button>
                    <Link to={`/contacts/${item.contactId}`}>
                      <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" aria-label="Ouvrir la fiche">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
            {visible.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Aucune relance en retard. Décochez le filtre pour voir toutes les relances.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!calling} onClose={() => setCalling(null)}>
        <DialogHeader>
          <DialogTitle>Rappeler — {calling?.businessName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          {calling?.phone && (
            <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
              <Phone className="h-4 w-4" /> {calling.phone}
            </div>
          )}
          {calling?.nextStep && (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <span className="text-muted-foreground">À traiter : </span>{calling.nextStep}
            </p>
          )}
          <div>
            <label htmlFor="fu-result" className="text-sm font-medium">Résultat *</label>
            <Select id="fu-result" value={form.result} onChange={e => setForm({ ...form, result: e.target.value })} className="mt-1">
              {Object.entries(CALL_RESULTS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="fu-objection" className="text-sm font-medium">Objection</label>
            <Select id="fu-objection" value={form.objection} onChange={e => setForm({ ...form, objection: e.target.value })} className="mt-1">
              <option value="">Aucune</option>
              {Object.entries(OBJECTIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="fu-notes" className="text-sm font-medium">Notes</label>
            <textarea id="fu-notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              className="mt-1 flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="fu-nextstep" className="text-sm font-medium">Prochaine étape</label>
              <Input id="fu-nextstep" value={form.nextStep} onChange={e => setForm({ ...form, nextStep: e.target.value })} className="mt-1" placeholder="Rappeler jeudi" />
            </div>
            <div>
              <label htmlFor="fu-nextstep-at" className="text-sm font-medium">Date de relance</label>
              <Input id="fu-nextstep-at" type="date" className="mt-1"
                min={new Date().toISOString().slice(0, 10)}
                value={form.nextStepAt} onChange={e => setForm({ ...form, nextStepAt: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCalling(null)}>Annuler</Button>
            <Button onClick={saveCall} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
          </DialogFooter>
        </div>
      </Dialog>
    </div>
  );
}
