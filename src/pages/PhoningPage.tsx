import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PhoneCall, Search, SkipForward, Check, ChevronLeft, ChevronRight,
  Star, Globe, GlobeLock, MapPin, Loader2, Phone, AlertCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/ui/toast';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { CALL_RESULTS, OBJECTIONS, STAGES, formatDateTime, formatDuration } from '../lib/utils';
import type { Contact, Call } from '../types';

const QUEUE_KEY = 'crm_phoning_queue';
const DRAFT_PREFIX = 'crm_phoning_draft_';

const RESULT_KEYS = Object.keys(CALL_RESULTS);

interface Filters {
  reach: string;
  stage: string;
  hasSite: string;
}

const DEFAULT_FILTERS: Filters = { reach: 'true', stage: '', hasSite: '' };

/** Google search with the company name prefilled; city disambiguates homonyms. */
function buildSearchUrl(c: Contact): string {
  const parts = [`"${c.businessName}"`];
  if (c.city) parts.push(c.city);
  return `https://www.google.com/search?q=${encodeURIComponent(parts.join(' '))}`;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function PhoningPage() {
  const { toast } = useToast();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [queue, setQueue] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ result: '', objection: '', notes: '', nextStep: '' });
  const [history, setHistory] = useState<Call[]>([]);
  const [elapsed, setElapsed] = useState(0);

  const startedAt = useRef<number>(Date.now());
  // Ref (not state) so the guard flips synchronously: pressing Enter while a result
  // button has focus fires both our keydown handler and the button's own click.
  const savingRef = useRef(false);
  const [showHelp, setShowHelp] = useState(false);

  const current = queue[index] ?? null;

  /* ---------- queue loading ---------- */

  const loadQueue = useCallback(async (f: Filters) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        excludeCalled: 'true',
        sortBy: 'opportunity',
        sortDir: 'desc',
        limit: '500',
        page: '1',
      };
      if (f.reach) params.reach = f.reach;
      if (f.stage) params.stage = f.stage;
      if (f.hasSite) params.hasSite = f.hasSite;

      const { contacts, total: t } = await api.contacts.list(params);
      setQueue(contacts || []);
      setTotal(t || 0);
      setIndex(0);
      setDone(new Set());
    } catch (err) {
      console.error(err);
      toast('Impossible de charger la file', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadQueue(filters); }, [filters, loadQueue]);

  // restore session position
  useEffect(() => {
    if (loading || queue.length === 0) return;
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && saved.index > 0 && saved.index < queue.length) setIndex(saved.index);
    } catch { /* ignore */ }
  }, [loading, queue.length]);

  useEffect(() => {
    if (queue.length === 0) return;
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify({ index, total })); } catch { /* ignore */ }
  }, [index, total, queue.length]);

  /* ---------- current lead side effects ---------- */

  useEffect(() => {
    if (!current) { setHistory([]); return; }
    startedAt.current = Date.now();
    setElapsed(0);

    // restore draft for this lead
    let draft = { result: '', objection: '', notes: '', nextStep: '' };
    try {
      const raw = localStorage.getItem(DRAFT_PREFIX + current.id);
      if (raw) draft = { ...draft, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    setForm(draft);

    api.calls.byContact(current.id)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // autosave draft
  useEffect(() => {
    if (!current) return;
    try {
      const empty = !form.result && !form.objection && !form.notes && !form.nextStep;
      if (empty) localStorage.removeItem(DRAFT_PREFIX + current.id);
      else localStorage.setItem(DRAFT_PREFIX + current.id, JSON.stringify(form));
    } catch { /* ignore */ }
  }, [form, current]);

  // call timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- navigation ---------- */

  const remaining = queue.length - done.size;

  const go = useCallback((delta: number) => {
    setIndex(prev => {
      const next = prev + delta;
      if (next < 0) return 0;
      if (next >= queue.length) return queue.length - 1;
      return next;
    });
  }, [queue.length]);

  const goNext = useCallback(() => go(1), [go]);
  const goPrev = useCallback(() => go(-1), [go]);

  /* ---------- actions ---------- */

  const openSearch = useCallback(() => {
    if (!current) return;
    const url = buildSearchUrl(current);
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) window.location.href = url;
  }, [current]);

  const saveCall = useCallback(async () => {
    if (!current || savingRef.current) return;
    if (!form.result) { toast('Choisis un résultat avant d\'enregistrer', 'error'); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      await api.calls.create({
        contactId: current.id,
        // duration is validated as a positive integer server-side: never send 0.
        duration: elapsed > 0 ? elapsed : undefined,
        result: form.result,
        objection: form.objection || undefined,
        notes: form.notes || undefined,
        nextStep: form.nextStep || undefined,
      });
      try { localStorage.removeItem(DRAFT_PREFIX + current.id); } catch { /* ignore */ }
      setDone(prev => new Set(prev).add(current.id));
      setForm({ result: '', objection: '', notes: '', nextStep: '' });
      setHistory(prev => [{ id: -Date.now(), contactId: current.id, userId: null, date: Math.floor(Date.now() / 1000), duration: elapsed, result: form.result, objection: form.objection || null, notes: form.notes || null, nextStep: form.nextStep || null }, ...prev]);
      toast('Appel enregistré', 'success');
      goNext();
    } catch (err) {
      console.error(err);
      toast("Erreur lors de l'enregistrement de l'appel", 'error');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [current, form, elapsed, goNext, toast]);

  const skip = useCallback(() => {
    if (!current) return;
    setDone(prev => new Set(prev).add(current.id));
    goNext();
  }, [current, goNext]);

  /* ---------- keyboard ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Escape') {
        if (showHelp) { setShowHelp(false); return; }
        return;
      }
      if (showHelp) return;
      if (isTypingTarget(e.target)) return;

      switch (e.key) {
        case 'ArrowDown': case 'ArrowRight': case 'j': case 'J':
          e.preventDefault(); goNext(); break;
        case 'ArrowUp': case 'ArrowLeft': case 'k': case 'K':
          e.preventDefault(); goPrev(); break;
        case 'Enter':
          e.preventDefault(); saveCall(); break;
        case 'g': case 'G':
          e.preventDefault(); openSearch(); break;
        case '?':
          e.preventDefault(); setShowHelp(true); break;
        default:
          if (/^[1-5]$/.test(e.key)) {
            e.preventDefault();
            setForm(prev => ({ ...prev, result: RESULT_KEYS[Number(e.key) - 1] || prev.result }));
          }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, saveCall, openSearch, showHelp]);

  /* ---------- derived ---------- */

  const timerLabel = useMemo(() => formatDuration(elapsed), [elapsed]);

  if (loading && queue.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement de la file...
        </div>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="space-y-4">
        <FiltersBar filters={filters} setFilters={setFilters} total={total} remaining={remaining} />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Check className="h-10 w-10 text-success mb-3" />
            <p className="font-medium">Plus aucun prospect à appeler</p>
            <p className="text-sm text-muted-foreground mt-1">
              Tous les prospects correspondant à ces filtres ont déjà été appelés.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Réinitialiser les filtres
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <FiltersBar filters={filters} setFilters={setFilters} total={total} remaining={remaining} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lead + form */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <CardTitle className="text-xl truncate">{current?.businessName}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {current?.activity || 'Activité inconnue'}
                    {current?.city && <> · <MapPin className="inline h-3 w-3" /> {current.city}</>}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary">{index + 1} / {queue.length}</Badge>
                  {current?.stage && <Badge variant="outline">{STAGES[current.stage]?.label || current.stage}</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Signals */}
              <div className="flex flex-wrap items-center gap-2">
                {current?.hasSite === 'pas_de_site' || current?.hasSite === 'non' ? (
                  <Badge variant="success"><GlobeLock className="h-3 w-3 mr-1" /> Sans site</Badge>
                ) : current?.hasSite === 'site_fonctionnel' ? (
                  <Badge variant="secondary"><Globe className="h-3 w-3 mr-1" /> Site fonctionnel</Badge>
                ) : (
                  <Badge variant="warning"><Globe className="h-3 w-3 mr-1" /> {current?.hasSite || 'Inconnu'}</Badge>
                )}
                {current?.googleRating != null && (
                  <Badge variant="outline">
                    <Star className="h-3 w-3 mr-1 fill-warning text-warning" />
                    {current.googleRating} ({current.googleReviews ?? 0} avis)
                  </Badge>
                )}
              </div>

              {/* Contact actions */}
              <div className="flex flex-wrap items-center gap-2">
                {current?.phone ? (
                  <Button asChild variant="default">
                    <a href={`tel:${current.phone}`}>
                      <Phone className="h-4 w-4 mr-2" /> {current.phone}
                    </a>
                  </Button>
                ) : (
                  <Badge variant="warning"><AlertCircle className="h-3 w-3 mr-1" /> Pas de téléphone</Badge>
                )}
                <Button variant="outline" onClick={openSearch}>
                  <Search className="h-4 w-4 mr-2" /> Recherche Google
                </Button>
                {current?.siteUrl && (
                  <Button asChild variant="ghost">
                    <a href={current.siteUrl} target="_blank" rel="noopener noreferrer">
                      <Globe className="h-4 w-4 mr-2" /> Voir le site
                    </a>
                  </Button>
                )}
              </div>

              {/* Call history */}
              {history.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Historique ({history.length})
                  </p>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {history.slice(0, 3).map(c => (
                      <div key={c.id} className="text-xs flex items-start gap-2">
                        <Badge variant={c.result === 'rdv_obtenu' ? 'success' : c.result === 'interesse' ? 'secondary' : 'outline'}>
                          {CALL_RESULTS[c.result] || c.result}
                        </Badge>
                        <span className="text-muted-foreground shrink-0">{formatDateTime(c.date)}</span>
                        {c.notes && <span className="truncate">{c.notes}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Call form */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Résultat de l'appel</CardTitle>
                <span className="text-xs text-muted-foreground tabular-nums">{timerLabel}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {RESULT_KEYS.map((key, i) => (
                  <Button
                    key={key}
                    variant={form.result === key ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setForm(prev => ({ ...prev, result: key }))}
                  >
                    <span className="text-xs opacity-60 mr-1">{i + 1}</span>
                    {CALL_RESULTS[key]}
                  </Button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ph-objection" className="text-sm font-medium">Objection</label>
                  <Select
                    id="ph-objection"
                    className="mt-1"
                    value={form.objection}
                    onChange={e => setForm({ ...form, objection: e.target.value })}
                  >
                    <option value="">Aucune</option>
                    {Object.entries(OBJECTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </div>
                <div>
                  <label htmlFor="ph-nextstep" className="text-sm font-medium">Prochaine étape</label>
                  <Input
                    id="ph-nextstep"
                    className="mt-1"
                    placeholder="ex. rappeler jeudi"
                    value={form.nextStep}
                    onChange={e => setForm({ ...form, nextStep: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="ph-notes" className="text-sm font-medium">Notes de l'appel</label>
                <textarea
                  id="ph-notes"
                  rows={4}
                  placeholder="Ce que le lead a dit, son état d'esprit, le ton..."
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" onClick={skip} disabled={saving}>
                  <SkipForward className="h-4 w-4 mr-2" /> Passer
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={goPrev} aria-label="Prospect précédent">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={goNext} aria-label="Prospect suivant">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button onClick={saveCall} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                    Enregistrer
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Queue strip */}
        <Card className="lg:sticky lg:top-6 self-start">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              File · {remaining} restant{remaining > 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[70vh] overflow-y-auto">
              {queue.map((c, i) => {
                const isCurrent = i === index;
                const isDone = done.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => setIndex(i)}
                    className={`w-full text-left px-4 py-2 border-b border-border hover:bg-accent/50 transition-colors ${
                      isCurrent ? 'bg-primary/10 border-l-2 border-l-primary' : 'border-l-2 border-l-transparent'
                    } ${isDone ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      {isDone && <Check className="h-3 w-3 text-success shrink-0" />}
                      <span className="text-sm font-medium truncate flex-1">{c.businessName}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate flex items-center gap-2 mt-0.5">
                      <span>{c.city || 'Sans ville'}</span>
                      {!c.phone && <span className="text-warning">· sans tél.</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4" onClick={() => setShowHelp(false)}>
          <Card className="max-w-md w-full" onClick={e => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><PhoneCall className="h-4 w-4" /> Raccourcis clavier</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                ['↓ → ou J', 'Prospect suivant'],
                ['↑ ← ou K', 'Prospect précédent'],
                ['Entrée', 'Enregistrer et passer au suivant'],
                ['1 à 5', 'Résultat rapide'],
                ['G', 'Recherche Google'],
                ['Passer', 'Ne rien noter, passer au suivant'],
                ['?', 'Fermer cette aide'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4">
                  <kbd className="rounded border border-border bg-muted px-2 py-0.5 text-xs font-mono">{k}</kbd>
                  <span className="text-muted-foreground text-right">{v}</span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-2">
                Les raccourcis sont désactivés pendant que tu tapes dans un champ.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function FiltersBar({
  filters, setFilters, total, remaining,
}: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  total: number;
  remaining: number;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 py-3">
        <PhoneCall className="h-5 w-5 text-primary" />
        <Select
          className="w-auto"
          value={filters.reach}
          onChange={e => setFilters({ ...filters, reach: e.target.value })}
          aria-label="File"
        >
          <option value="true">Joignables (avec téléphone)</option>
          <option value="false">Sans téléphone (à enrichir)</option>
        </Select>
        <Select
          className="w-auto"
          value={filters.hasSite}
          onChange={e => setFilters({ ...filters, hasSite: e.target.value })}
          aria-label="Site"
        >
          <option value="">Tous les sites</option>
          <option value="pas_de_site">Sans site</option>
          <option value="site_fonctionnel">Site fonctionnel</option>
        </Select>
        <Select
          className="w-auto"
          value={filters.stage}
          onChange={e => setFilters({ ...filters, stage: e.target.value })}
          aria-label="Stage"
        >
          <option value="">Tous les stages</option>
          {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <span className="text-sm text-muted-foreground ml-auto">
          {queueSummary(total, remaining)}
        </span>
      </CardContent>
    </Card>
  );
}

function queueSummary(total: number, remaining: number): string {
  if (total === 0) return 'Aucun prospect';
  if (total > 500) return `${remaining} restant${remaining > 1 ? 's' : ''} sur 500+ prospec${total > 1 ? 'ts' : 't'}`;
  return `${remaining} restant${remaining > 1 ? 's' : ''} sur ${total} prospect${total > 1 ? 's' : ''}`;
}

export default PhoningPage;