import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PhoneCall, Search, SkipForward, Check, ChevronLeft, ChevronRight,
  Star, Globe, GlobeLock, MapPin, Loader2, Phone, AlertCircle, Ban, Edit,
} from 'lucide-react';
import { api } from '../lib/api';
import { ContactEditDialog } from '../components/contacts/ContactEditDialog';
import { useToast } from '../components/ui/toast';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { CALL_RESULTS, OBJECTIONS, STAGES, LANGUAGES, formatDate, formatDateTime, formatDuration } from '../lib/utils';
import { StageBadge, CallResultBadge, DncBadge } from '../components/ui/status-badges';
import type { Contact, Call } from '../types';

const PAGE_SIZE = 500;
const PREFETCH_MARGIN = 25;

const QUEUE_KEY = 'crm_phoning_queue';
const DRAFT_PREFIX = 'crm_phoning_draft_';

const RESULT_KEYS = Object.keys(CALL_RESULTS);

const STAGE_ORDER: Record<string, number> = {
  identifie: 0,
  contacte: 1,
  interesse: 2,
  rdv_programme: 3,
  proposition_envoyee: 4,
  signe: 5,
  perdu: 6,
};

/**
 * Suggest the next stage for a call result without silently undoing work.
 * Positive outcomes move forward, no-answers only mark an untouched lead as
 * contacted, and a lost late-stage deal is never auto-marked as lost.
 */
function suggestStageForResult(currentStage: string | null | undefined, result: string): string {
  const current = currentStage || 'identifie';
  if (result === 'pas_interesse') {
    return current === 'proposition_envoyee' || current === 'signe' ? current : 'perdu';
  }
  if (result === 'interesse' || result === 'rdv_obtenu') {
    const target = result === 'rdv_obtenu' ? 'rdv_programme' : 'interesse';
    const currentRank = STAGE_ORDER[current];
    const targetRank = STAGE_ORDER[target];
    if (currentRank === undefined || targetRank === undefined) return target;
    return targetRank >= currentRank ? target : current;
  }
  if (result === 'pas_decroche' || result === 'messagerie') {
    return current === 'identifie' ? 'contacte' : current;
  }
  return current;
}

interface Filters {
  reach: string;
  stage: string;
  hasSite: string;
  language: string;
  /** Default false: the queue is the cold list. True brings back worked leads. */
  includeCalled: boolean;
}

const DEFAULT_FILTERS: Filters = { reach: 'true', stage: '', hasSite: '', language: '', includeCalled: false };

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
  const isAdmin = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('crm_user') || '{}').role === 'admin';
    } catch {
      return false;
    }
  }, []);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [queue, setQueue] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [index, setIndex] = useState(0);
  const queueScrollRef = useRef<HTMLDivElement>(null);

  // The strip shows about eight of five hundred entries. Without this the current
  // lead scrolls out of sight and the panel looks frozen while you work through
  // the queue. 'nearest' scrolls the minimum needed, so it stays quiet when the
  // row is already visible.
  useEffect(() => {
    const container = queueScrollRef.current;
    if (!container) return;
    const current = container.querySelector('[data-queue-current="true"]');
    current?.scrollIntoView({ block: 'nearest' });
  }, [index, queue.length]);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    result: '', stage: 'identifie', stageTouched: false, objection: '', notes: '', nextStep: '', nextStepAt: '',
  });
  const [history, setHistory] = useState<Call[]>([]);
  const [elapsed, setElapsed] = useState(0);
  // The timer used to start when the card rendered, so "duration" measured how
  // long a lead sat open, including reading a menu or eating lunch. It now
  // measures from the first real interaction, which is the closest proxy for
  // talk time available without an explicit hang-up event. A ref, not state:
  // the interval below reads it and its deps are intentionally fixed.
  const interactingRef = useRef(false);

  const startedAt = useRef<number>(Date.now());
  // Ref (not state) so the guard flips synchronously: pressing Enter while a result
  // button has focus fires both our keydown handler and the button's own click.
  const savingRef = useRef(false);
  const [showHelp, setShowHelp] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  /** Any edit marks the rep as engaged: the timer starts here, not on render.
   *  Only the first interaction sets the origin, so typing does not keep
   *  resetting the clock. */
  const markInteracting = () => {
    if (interactingRef.current) return;
    interactingRef.current = true;
    startedAt.current = Date.now();
  };

  const current = queue[index] ?? null;

  const selectResult = useCallback((key: string) => {
    markInteracting();
    setForm(prev => {
      const next = { ...prev, result: key };
      // Preserve an explicit stage choice. Otherwise keep the suggestion in sync
      // with the selected outcome.
      if (!prev.stageTouched) {
        next.stage = suggestStageForResult(current?.stage, key);
      }
      return next;
    });
  }, [current?.stage]);

  /* ---------- queue loading ---------- */

  const buildParams = useCallback((f: Filters, page: number): Record<string, string> => {
    const params: Record<string, string> = {
      // The queue is "leads I have not called yet". With the switch on, that
      // restriction lifts and the companies already worked come back.
      ...(f.includeCalled ? {} : { excludeCalled: 'true' }),
      sortBy: 'opportunity',
      sortDir: 'desc',
      limit: String(PAGE_SIZE),
      page: String(page),
    };
    if (f.reach) params.reach = f.reach;
    if (f.stage) params.stage = f.stage;
    if (f.hasSite) params.hasSite = f.hasSite;
    if (f.language) params.language = f.language;
    return params;
  }, []);

  const loadQueue = useCallback(async (f: Filters) => {
    setLoading(true);
    try {
      const { contacts, total: t } = await api.contacts.list(buildParams(f, 1));
      setQueue(contacts || []);
      setTotal(t || 0);
      setPage(1);
      setHasMore((contacts || []).length === PAGE_SIZE);
      setIndex(0);
      setDone(new Set());
    } catch (err) {
      console.error(err);
      toast('Impossible de charger la file', 'error');
    } finally {
      setLoading(false);
    }
  }, [buildParams, toast]);

  // Prefetch the next batch before the user reaches the end of the loaded queue.
  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const { contacts } = await api.contacts.list(buildParams(filters, next));
      const incoming = contacts || [];
      if (incoming.length === 0) {
        setHasMore(false);
        return;
      }
      // Logging a call drops that lead from excludeCalled, which shifts later pages by
      // one; dedupe on id so the shift can never produce the same lead twice.
      setQueue(prev => {
        const seen = new Set(prev.map(c => c.id));
        return [...prev, ...incoming.filter(c => !seen.has(c.id))];
      });
      setPage(next);
      setHasMore(incoming.length === PAGE_SIZE);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  }, [buildParams, filters, hasMore, loading, loadingMore, page]);

  useEffect(() => { loadQueue(filters); }, [filters, loadQueue]);

  useEffect(() => {
    if (queue.length > 0 && index >= queue.length - PREFETCH_MARGIN) loadMore();
  }, [index, queue.length, loadMore]);

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
    interactingRef.current = false;

    // restore draft for this lead
    let draft = {
      result: '', stage: current.stage || 'identifie', stageTouched: false,
      objection: '', notes: '', nextStep: '', nextStepAt: '',
    };
    try {
      const raw = localStorage.getItem(DRAFT_PREFIX + current.id);
      if (raw) draft = { ...draft, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    // A restored draft means work already happened on this lead.
    interactingRef.current = !!(draft.result || draft.objection || draft.notes || draft.nextStep);
    setForm(draft);

    api.calls.byContact(current.id)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // autosave draft
  useEffect(() => {
    if (!current) return;
    try {
      // An untouched stage suggestion is derived state, not user work, so it must not
      // create a local draft by itself. A manually selected stage is preserved.
      const empty = !form.result && !form.objection && !form.notes && !form.nextStep && !form.nextStepAt && !form.stageTouched;
      if (empty) localStorage.removeItem(DRAFT_PREFIX + current.id);
      else localStorage.setItem(DRAFT_PREFIX + current.id, JSON.stringify(form));
    } catch { /* ignore */ }
  }, [form, current]);

  // call timer
  useEffect(() => {
    const t = setInterval(() => {
      const from = interactingRef.current ? startedAt.current : Date.now();
      setElapsed(Math.max(0, Math.floor((Date.now() - from) / 1000)));
    }, 1000);
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

  const openLeadEditor = useCallback(() => {
    if (!current) return;
    markInteracting();
    setEditOpen(true);
  }, [current]);

  const handleLeadSaved = useCallback((saved: Contact) => {
    setQueue(prev => prev.map(c => (c.id === saved.id ? { ...c, ...saved } : c)));
    setEditOpen(false);
    if (saved.dnc) {
      toast('Opt-out enregistré. Le lead reste affiché\u00a0: vérifie puis passe au suivant.', 'success');
    } else {
      toast('Prospect modifié', 'success');
    }
  }, [toast]);

  const openSearch = useCallback(() => {
    if (!current) return;
    const url = buildSearchUrl(current);
    // No 'noopener' feature here: it makes window.open() return null by spec, which
    // would silently push us into the "blocked" branch. Null out opener manually
    // instead, so we get a real handle and can tell blocked from opened.
    const win = window.open(url, '_blank');
    if (win) {
      win.opener = null;
    } else {
      // Popup blocked by the browser: never navigate the CRM away, just tell the user.
      toast('Le navigateur a bloqué la fenêtre. Autorise les pop-ups pour ce site.', 'error');
    }
  }, [current, toast]);

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
        nextStepAt: form.nextStepAt || undefined,
      });
      // Record the call first. A failed stage update must not erase the call, but
      // it also must not pretend the pipeline moved.
      let stageFailed = false;
      if (form.stage && form.stage !== current.stage) {
        try {
          const updated = await api.contacts.update(current.id, { stage: form.stage });
          const nextStage = updated?.stage || form.stage;
          setQueue(prev => prev.map(c => (c.id === current.id ? { ...c, stage: nextStage } : c)));
        } catch (stageErr) {
          console.error(stageErr);
          stageFailed = true;
        }
      }
      try { localStorage.removeItem(DRAFT_PREFIX + current.id); } catch { /* ignore */ }
      setDone(prev => new Set(prev).add(current.id));
      setForm({
        result: '', stage: current.stage || 'identifie', stageTouched: false,
        objection: '', notes: '', nextStep: '', nextStepAt: '',
      });
      setHistory(prev => [{ id: -Date.now(), contactId: current.id, userId: null, date: Math.floor(Date.now() / 1000), duration: elapsed, result: form.result, objection: form.objection || null, notes: form.notes || null, nextStep: form.nextStep || null, nextStepAt: form.nextStepAt || null }, ...prev]);
      if (stageFailed) {
        toast("Appel enregistré, mais le stage n'a pas été mis à jour", 'error');
      } else {
        toast('Appel enregistré', 'success');
      }
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
      if (showHelp || editOpen) return;
      if (isTypingTarget(e.target)) return;

      switch (e.key) {
        case 'ArrowDown': case 'ArrowRight': case 'j': case 'J':
          e.preventDefault(); goNext(); break;
        case 'ArrowUp': case 'ArrowLeft': case 'k': case 'K':
          e.preventDefault(); goPrev(); break;
        case 'Enter':
          e.preventDefault(); saveCall(); break;
        case 'e': case 'E':
          e.preventDefault(); openLeadEditor(); break;
        case 'g': case 'G':
          e.preventDefault(); openSearch(); break;
        case '?':
          e.preventDefault(); setShowHelp(true); break;
        default:
          if (/^[1-5]$/.test(e.key)) {
            e.preventDefault();
            // Fastest path to logging a result, so it must start the clock too.
            selectResult(RESULT_KEYS[Number(e.key) - 1] || form.result);
          }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, saveCall, selectResult, form.result, openLeadEditor, openSearch, showHelp, editOpen]);

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
        <FiltersBar filters={filters} setFilters={setFilters} total={total} remaining={remaining}
          loaded={queue.length} loadingMore={loadingMore} />
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
      <FiltersBar filters={filters} setFilters={setFilters} total={total} remaining={remaining}
          loaded={queue.length} loadingMore={loadingMore} />

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
                  {current?.stage && <StageBadge stage={current.stage} />}
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
                {current?.language && LANGUAGES[current.language] && (
                  <Badge variant={LANGUAGES[current.language].variant}>
                    {LANGUAGES[current.language].label}
                  </Badge>
                )}
                {current?.dnc === 1 && (
                  <DncBadge reason={current?.dncReason}>
                    <span className="flex items-center gap-1"><Ban className="h-3 w-3" /> Ne pas appeler — à valider</span>
                  </DncBadge>
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
                {current && (
                  <Button asChild variant="outline">
                    <a
                      href={buildSearchUrl(current)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Search className="h-4 w-4 mr-2" /> Recherche Google
                    </a>
                  </Button>
                )}
                <Button variant="outline" onClick={openLeadEditor} title="Modifier le lead (E)">
                  <Edit className="h-4 w-4 mr-2" /> Modifier
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
                        <CallResultBadge result={c.result} />
                        <span className="text-muted-foreground shrink-0">{formatDateTime(c.date)}</span>
                        {c.notes && <span className="truncate">{c.notes}</span>}
                        {c.nextStep && (
                          <span className="truncate text-primary">
                            → {c.nextStep}
                            {c.nextStepAt ? ` (${formatDate(c.nextStepAt)})` : ''}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <ContactEditDialog
            open={editOpen}
            contact={current}
            isAdmin={isAdmin}
            onClose={() => setEditOpen(false)}
            onSaved={handleLeadSaved}
          />

          {/* Call form */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Résultat de l'appel</CardTitle>
                <span
                  className="text-xs text-muted-foreground tabular-nums"
                  title="Durée mesurée à partir de votre première interaction avec la fiche, pas depuis son affichage."
                >
                  {timerLabel}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {RESULT_KEYS.map((key, i) => (
                  <Button
                    key={key}
                    variant={form.result === key ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => selectResult(key)}
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
                    onChange={e => { markInteracting(); setForm({ ...form, objection: e.target.value }); }}
                  >
                    <option value="">Aucune</option>
                    {Object.entries(OBJECTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </div>
                <div>
                  <label htmlFor="ph-stage" className="text-sm font-medium">Stage après appel</label>
                  <Select
                    id="ph-stage"
                    className="mt-1"
                    value={form.stage}
                    onChange={e => { markInteracting(); setForm({ ...form, stage: e.target.value, stageTouched: true }); }}
                  >
                    {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">Proposé automatiquement, modifiable.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:col-span-2">
                  <div>
                    <label htmlFor="ph-nextstep" className="text-sm font-medium">Prochaine étape</label>
                    <Input
                      id="ph-nextstep"
                      className="mt-1"
                      placeholder="ex. rappeler jeudi"
                      value={form.nextStep}
                      onChange={e => { markInteracting(); setForm({ ...form, nextStep: e.target.value }); }}
                    />
                  </div>
                  <div>
                    <label htmlFor="ph-nextstep-at" className="text-sm font-medium">Date de relance</label>
                    <Input
                      id="ph-nextstep-at"
                      type="date"
                      className="mt-1"
                      min={new Date().toISOString().slice(0, 10)}
                      value={form.nextStepAt}
                      onChange={e => { markInteracting(); setForm({ ...form, nextStepAt: e.target.value }); }}
                    />
                  </div>
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
                  onChange={e => { markInteracting(); setForm({ ...form, notes: e.target.value }); }}
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
            <div ref={queueScrollRef} className="max-h-[70vh] overflow-y-auto">
              {queue.map((c, i) => {
                const isCurrent = i === index;
                const isDone = done.has(c.id);
                return (
                  <button
                    key={c.id}
                    data-queue-current={isCurrent ? 'true' : 'false'}
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
                ['E', 'Modifier le lead'],
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
  filters, setFilters, total, remaining, loaded, loadingMore,
}: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  total: number;
  remaining: number;
  loaded: number;
  loadingMore: boolean;
}) {
  return (
    <Card>
      {/*
        py-3 alone left the base pt-0 in force and the icon sat on the top
        border. Padding is now set once, and the selects carry a max width so
        the row wraps instead of overflowing.
      */}
      <CardContent className="flex flex-wrap items-center gap-2 py-3">
        <PhoneCall className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <Select
          className="w-auto min-w-[9rem] max-w-[17rem]"
          value={filters.reach}
          onChange={e => setFilters({ ...filters, reach: e.target.value })}
          aria-label="File"
        >
          <option value="true">Joignables (avec téléphone)</option>
          <option value="false">Sans téléphone (à enrichir)</option>
        </Select>
        <Select
          className="w-auto min-w-[9rem] max-w-[17rem]"
          value={filters.hasSite}
          onChange={e => setFilters({ ...filters, hasSite: e.target.value })}
          aria-label="Site"
        >
          <option value="">Tous les sites</option>
          <option value="pas_de_site">Sans site</option>
          <option value="site_fonctionnel">Site fonctionnel</option>
        </Select>
        <Select
          className="w-auto min-w-[9rem] max-w-[17rem]"
          value={filters.stage}
          onChange={e => setFilters({ ...filters, stage: e.target.value })}
          aria-label="Stage"
        >
          <option value="">Tous les stages</option>
          {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <Select
          className="w-auto min-w-[9rem] max-w-[17rem]"
          value={filters.language}
          onChange={e => setFilters({ ...filters, language: e.target.value })}
          aria-label="Langue"
        >
          <option value="">Toutes les langues</option>
          {Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          <option value="__empty__">Indéterminée</option>
        </Select>
        <label className="flex min-h-[40px] items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.includeCalled}
            onChange={e => setFilters({ ...filters, includeCalled: e.target.checked })}
            className="h-4 w-4 rounded border-input"
          />
          Inclure les prospects déjà appelés
        </label>
        <span className="ml-auto text-sm text-muted-foreground">
          {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {queueSummary(total, remaining, loaded)}
        </span>
      </CardContent>
    </Card>
  );
}

function queueSummary(total: number, remaining: number, loaded: number): string {
  if (total === 0) return 'Aucun prospect';
  const rest = `${remaining} restant${remaining > 1 ? 's' : ''}`;
  if (loaded < total) return `${rest} · ${loaded} chargés sur ${total} disponibles`;
  return `${rest} sur ${total} prospect${total > 1 ? 's' : ''}`;
}

export default PhoningPage;