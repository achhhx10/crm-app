import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { CallFormDialog } from '../components/ui/call-form-dialog';
import { useToast } from '../components/ui/toast';
import { BellRing, Phone, PhoneCall, ExternalLink, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatDate } from '../lib/utils';
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
                          <Phone className="h-4 w-4 text-success" />
                        </Button>
                      </a>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setCalling(item)}>
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

      <CallFormDialog
        open={!!calling}
        contact={calling ? { id: calling.contactId, businessName: calling.businessName, phone: calling.phone, nextStep: calling.nextStep } : null}
        defaultResult="interesse"
        onClose={() => setCalling(null)}
        onSaved={load}
      />
    </div>
  );
}
