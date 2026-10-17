import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Segmented } from '../components/ui/segmented';
import { Card, CardContent } from '../components/ui/card';
import { Dialog, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { ContactEditDialog } from '../components/contacts/ContactEditDialog';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { Plus, Search, Edit, Eye, EyeOff, ChevronUp, ChevronDown, Download, Archive, ArrowUpDown, X, Globe, RotateCcw, Flame, Gem, RefreshCw, Ban, MapPinOff, Star } from 'lucide-react';
import { useToast } from '../components/ui/toast';
import { STAGES, OBJECTIONS, CALL_RESULTS, LANGUAGES, formatDate, opportunityScore, opportunityMeta } from '../lib/utils';
import { StageBadge, DncBadge } from '../components/ui/status-badges';
import type { Contact } from '../types';

const PRESETS: { id: string; label: string; icon: React.ElementType; hint: string; filters: Partial<Record<string, string>> }[] = [
  { id: 'chaud', label: 'Chaud', icon: Flame, hint: 'Sans site + joignable', filters: { hasSite: 'pas_de_site', reach: 'true' } },
  { id: 'premium', label: 'Premium', icon: Gem, hint: 'Sans site · note 4,5+', filters: { hasSite: 'pas_de_site', reach: 'true', minRating: '4.5' } },
  { id: 'refonte', label: 'Refonte', icon: RefreshCw, hint: 'Avec site · joignable', filters: { hasSite: 'site_fonctionnel', reach: 'true' } },
  { id: 'injoignables', label: 'Injoignables', icon: Ban, hint: 'Sans téléphone', filters: { reach: 'false' } },
  { id: 'sans_ville', label: 'Sans ville', icon: MapPinOff, hint: 'Adresse manquante à géolocaliser', filters: { city: '__empty__' } },
  { id: 'avec_avis', label: 'Avec avis', icon: Star, hint: '10 avis Google ou plus', filters: { hasReviews: 'true', minReviews: '10' } },
];

// Sum of defaultColWidths: keeps `fixed` layout from crushing columns when the
// viewport is narrower than the table.
const TABLE_MIN_WIDTH = 1540;

const defaultColWidths: Record<string, number> = {
  checkbox: 40,
  businessName: 220,
  contactName: 150,
  phone: 140,
  activity: 150,
  city: 120,
  rating: 80,
  opportunity: 110,
  stage: 130,
  site: 84,
  lastCall: 200,
  actions: 72,
};

function useColumnWidths() {
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('crm_col_widths');
      return saved ? { ...defaultColWidths, ...JSON.parse(saved) } : { ...defaultColWidths };
    } catch { return { ...defaultColWidths }; }
  });
  const save = (w: Record<string, number>) => {
    setWidths(w);
    localStorage.setItem('crm_col_widths', JSON.stringify(w));
  };
  return { widths, save };
}

function ResizableTh({
  label, field, widths, onResize, sortField, sortDir, onSort,
}: {
  label: string; field: string; widths: Record<string, number>;
  onResize: (field: string, w: number) => void; sortField: string; sortDir: 'asc' | 'desc';
  onSort: (field: string) => void;
}) {
  const thRef = useRef<HTMLTableCellElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    const th = thRef.current;
    if (!th) return;
    const rect = th.getBoundingClientRect();
    const distFromRight = rect.right - e.clientX;

    if (distFromRight > 8) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[field] || 150;

    const onMouseMove = (ev: MouseEvent) => {
      const newW = Math.max(60, startW + ev.clientX - startX);
      onResize(field, newW);
    };
    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const isActive = sortField === field;

  return (
    <th
      ref={thRef}
      onMouseDown={handleMouseDown}
      className="group relative h-10 px-3 text-left align-middle font-medium text-muted-foreground select-none"
      style={{ width: widths[field], minWidth: 60 }}
    >
      <div className="flex cursor-pointer items-center gap-1" onClick={() => onSort(field)}>
        <span className="truncate">{label}</span>
        {isActive ? (
          sortDir === 'asc' ? <ChevronUp className="h-3 w-3 flex-shrink-0" /> : <ChevronDown className="h-3 w-3 flex-shrink-0" />
        ) : (
          <ArrowUpDown className="h-3 w-3 flex-shrink-0 opacity-30" />
        )}
      </div>
      <div
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-primary/0 transition-colors group-hover:bg-primary/30"
        title="Redimensionner la colonne"
      />
    </th>
  );
}

function RowActionsMenu({
  contact,
  isHidden,
  isAdmin,
  onView,
  onEdit,
  onHide,
  onArchive,
  onRestore,
}: {
  contact: Contact;
  isHidden: boolean;
  isAdmin: boolean;
  onView: () => void;
  onEdit: () => void;
  onHide: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickWhileOpen = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyWhileOpen = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickWhileOpen);
    document.addEventListener('keydown', onKeyWhileOpen);
    return () => {
      document.removeEventListener('mousedown', onClickWhileOpen);
      document.removeEventListener('keydown', onKeyWhileOpen);
    };
  }, [open]);

  const item = (label: string, icon: React.ReactNode, action: () => void, className = '') => (
    <button
      type="button"
      className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 ${className}`}
      onClick={() => { setOpen(false); action(); }}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <div className="relative inline-block" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        className="min-h-[44px] min-w-[44px] h-7 w-7"
        aria-label="Actions du prospect"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-52 rounded-md border bg-card py-1 shadow-lg">
          {item('Voir le prospect', <Eye className="h-4 w-4" />, onView)}
          {item('Modifier le prospect', <Edit className="h-4 w-4" />, onEdit)}
          {item(
            isHidden ? 'Afficher le prospect' : 'Masquer le prospect',
            isHidden ? <Eye className="h-4 w-4 text-success" /> : <EyeOff className="h-4 w-4" />,
            onHide,
          )}
          {isAdmin && (
            contact.archivedAt
              ? item('Restaurer le prospect', <RotateCcw className="h-4 w-4 text-success" />, onRestore)
              : item('Archiver le prospect', <Archive className="h-4 w-4 text-muted-foreground" />, onArchive)
          )}
        </div>
      )}
    </div>
  );
}

export function ContactsPage() {
  const { toast } = useToast();
  const user = JSON.parse(localStorage.getItem('crm_user') || '{}');
  const isAdmin = user.role === 'admin';
  const defaultReach: 'all' | 'true' | 'false' = isAdmin ? 'all' : 'true';
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  // Filters live in the URL so Back, refresh and sharing a link all behave.
  const [searchParams, setSearchParams] = useSearchParams();

  const patch = useCallback((changes: Record<string, string | null>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '' || value === 'all') next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const urlStr = (key: string, fallback: string) => searchParams.get(key) ?? fallback;

  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const search = urlStr('q', '');
  const stageFilter = urlStr('stage', 'all');
  const activityFilter = urlStr('activity', 'all');
  const minRating = urlStr('minRating', '');
  const hasSiteFilter = urlStr('hasSite', 'all');
  const cityFilter = urlStr('city', 'all');
  const languageFilter = urlStr('language', 'all');
  const reachFilter = urlStr('reach', defaultReach) as 'all' | 'true' | 'false';
  const hasReviewsFilter = urlStr('hasReviews', 'all');
  const minReviews = urlStr('minReviews', '');
  const activePreset = searchParams.get('preset');
  const dncFilterUrl = urlStr('dnc', 'exclude');
  const calledFilter = urlStr('called', 'all');
  const archivedFilter = urlStr('archived', 'exclude');
  const assigneeFilterUrl = urlStr('assignedTo', 'all');

  // Any filter change resets to page 1; a page change keeps the filters.
  const setPage = useCallback((value: number) => {
    patch({ page: value === 1 ? null : String(value) });
  }, [patch]);
  const setSearch = useCallback((value: string) => patch({ q: value || null, page: null }), [patch]);
  const [activities, setActivities] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<number | null>(null);
  const [confirmBulkArchive, setConfirmBulkArchive] = useState(false);
  const sortField = urlStr('sortBy', 'opportunity');
  const sortDir = urlStr('sortDir', 'desc') as 'asc' | 'desc';
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem('crm_hidden_contacts');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [showHidden, setShowHidden] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bulkStage, setBulkStage] = useState('');
  const dncFilter = dncFilterUrl;
  const assigneeFilter = assigneeFilterUrl;
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [team, setTeam] = useState<{ id: number; name: string }[]>([]);
  const { widths, save: saveWidths } = useColumnWidths();

  useEffect(() => {
    loadContacts();
  }, [page, stageFilter, activityFilter, minRating, hasSiteFilter, cityFilter, reachFilter, hasReviewsFilter, minReviews, languageFilter, dncFilter, calledFilter, archivedFilter, assigneeFilter, sortField, sortDir]);
  useEffect(() => {
    api.contacts.activities().then(setActivities).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    // GET /auth/users returns a bare array.
    api.auth.users()
      .then((res: any) => setTeam(Array.isArray(res) ? res : res?.users || []))
      .catch(() => setTeam([]));
  }, [isAdmin]);

  useEffect(() => {
    api.contacts.cities().then(setCities).catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem('crm_hidden_contacts', JSON.stringify([...hiddenIds]));
  }, [hiddenIds]);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '100' };
      if (stageFilter !== 'all') params.stage = stageFilter;
      if (activityFilter !== 'all') params.activity = activityFilter;
      if (minRating) params.minRating = minRating;
      if (hasSiteFilter !== 'all') params.hasSite = hasSiteFilter;
      if (cityFilter !== 'all') params.city = cityFilter;
      if (languageFilter !== 'all') params.language = languageFilter;
      params.dnc = dncFilter;
      params.archived = archivedFilter;
      params.archived = archivedFilter;
    if (calledFilter === 'never') params.excludeCalled = 'true';
      else if (calledFilter === 'already') params.called = 'only';
      if (assigneeFilter !== 'all') params.assignedTo = assigneeFilter;
      if (reachFilter !== 'all') params.reach = reachFilter;
      if (hasReviewsFilter !== 'all') params.hasReviews = hasReviewsFilter;
      if (minReviews) params.minReviews = minReviews;
      if (search) params.search = search;
      params.sortBy = sortField;
      params.sortDir = sortDir;
      const result = await api.contacts.list(params);
      setContacts(result.contacts);
      setTotal(result.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => { setPage(1); loadContacts(); };

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    // A preset replaces the whole view. It used to leave stage/activity/language
    // untouched, so a stale filter produced an empty table with no explanation.
    // One patch, so every filter moves together.
    patch(activePreset === id
      ? {
          preset: null, page: null,
          hasSite: null, reach: defaultReach === 'all' ? null : defaultReach,
          minRating: null, city: null, hasReviews: null, minReviews: null,
          stage: null, activity: null, language: null,
        }
      : {
          preset: id, page: null,
          hasSite: p?.filters.hasSite || null,
          minRating: p?.filters.minRating || null,
          city: p?.filters.city || null,
          hasReviews: p?.filters.hasReviews || null,
          minReviews: p?.filters.minReviews || null,
          reach: p?.filters.reach || null,
          stage: null, activity: null, language: null,
        });
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      // Un seul patch par clic : deux setSearchParams dans le même tick sous
      // react-router v7 s'écrasent mutuellement et la mise à jour est perdue.
      const nextDir = sortDir === 'asc' ? 'desc' : 'asc';
      patch({ sortDir: nextDir === 'asc' ? 'asc' : null, page: null });
    } else {
      patch({ sortBy: field === 'opportunity' ? null : field, sortDir: 'asc', page: null });
    }
  };

  const handleColResize = (field: string, w: number) => {
    saveWidths({ ...widths, [field]: w });
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const visible = getVisibleContacts();
    if (selectedIds.size === visible.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visible.map(c => c.id)));
    }
  };

  const toggleHide = (id: number) => {
    setHiddenIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkStage = async () => {
    if (!bulkStage || selectedIds.size === 0) return;
    try {
      await api.contacts.bulkStage([...selectedIds], bulkStage);
      setSelectedIds(new Set());
      setBulkStage('');
      loadContacts();
    } catch (err) { toast('Erreur lors du changement de stage', 'error'); }
  };

  const handleBulkAssign = async () => {
    if (!bulkAssignee || selectedIds.size === 0) return;
    const count = selectedIds.size;
    try {
      await api.contacts.bulkAssign(
        [...selectedIds],
        bulkAssignee === '__none__' ? null : Number(bulkAssignee),
      );
      setSelectedIds(new Set());
      setBulkAssignee('');
      loadContacts();
      toast(`${count} prospect(s) assigné(s)`, 'success');
    } catch (err) {
      toast('Erreur lors de l\'attribution', 'error');
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    setConfirmBulkArchive(true);
  };

  const doBulkArchive = async () => {
    try {
      const res = await api.contacts.bulkArchive([...selectedIds]);
      setSelectedIds(new Set());
      loadContacts();
      toast(`${res?.archived ?? selectedIds.size} prospect(s) archivé(s)`, 'success');
    } catch (err) { toast('Erreur lors de l\'archivage', 'error'); throw err; }
  };

  const handleExport = async () => {
    const params: Record<string, string> = {};
    // An explicit selection overrides the filters: exporting must not silently
    // widen to every filtered row.
    if (selectedIds.size > 0) {
      params.ids = Array.from(selectedIds).join(',');
      toast(`Export de la sélection (${selectedIds.size})`, 'success');
    }
    if (search) params.search = search;
    if (stageFilter !== 'all') params.stage = stageFilter;
    if (activityFilter !== 'all') params.activity = activityFilter;
    if (minRating) params.minRating = minRating;
    if (hasSiteFilter !== 'all') params.hasSite = hasSiteFilter;
    if (cityFilter !== 'all') params.city = cityFilter;
    if (languageFilter !== 'all') params.language = languageFilter;
    params.dnc = dncFilter;
    params.archived = archivedFilter;
    if (calledFilter === 'never') params.excludeCalled = 'true';
    else if (calledFilter === 'already') params.called = 'only';
    if (assigneeFilter !== 'all') params.assignedTo = assigneeFilter;
    if (reachFilter !== 'all') params.reach = reachFilter;
    if (hasReviewsFilter !== 'all') params.hasReviews = hasReviewsFilter;
    if (minReviews) params.minReviews = minReviews;
    try {
      const res = await api.contacts.exportCsv(params);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prospects_export_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { console.error(err); }
  };

  const handleSaved = () => {
    const wasEditing = Boolean(editingContact);
    setShowForm(false);
    setEditingContact(null);
    loadContacts();
    toast(wasEditing ? 'Prospect modifié' : 'Prospect ajouté', 'success');
  };

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
    setShowForm(true);
  };

  const handleArchive = async (id: number) => {
    setArchiveTarget(id);
  };

  const doArchive = async () => {
    if (!archiveTarget) return;
    try {
      await api.contacts.archive(archiveTarget);
      loadContacts();
      toast('Prospect archivé', 'success');
    } catch (err) {
      toast('Erreur lors de l\'archivage', 'error');
      throw err;
    }
  };

  const handleRestore = async (id: number) => {
    try {
      await api.contacts.restore(id);
      loadContacts();
      toast('Prospect restauré', 'success');
    } catch (err) {
      toast('Erreur lors de la restauration', 'error');
    }
  };

  const getVisibleContacts = () => {
    return contacts.filter(c => showHidden || !hiddenIds.has(c.id));
  };

  const visibleContacts = getVisibleContacts();
  const totalPages = Math.ceil(total / 100);
  const hiddenCount = contacts.filter(c => hiddenIds.has(c.id)).length;
  const advancedCount = [
    calledFilter !== 'all',
    dncFilter !== 'exclude',
    activityFilter !== 'all',
    hasSiteFilter !== 'all',
    cityFilter !== 'all',
    hasReviewsFilter !== 'all' || minReviews !== '',
  ].filter(Boolean).length;

  if (loading && contacts.length === 0) {
    return <div className="flex items-center justify-center h-64"><div className="animate-pulse text-muted-foreground">Chargement des prospects...</div></div>;
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-1">
        <div>
          <h1 className="text-2xl font-bold">Prospects</h1>
          <p className="text-sm text-muted-foreground">{total} prospects</p>
        </div>
        <Button onClick={() => { setEditingContact(null); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Ajouter
        </Button>
      </div>

      {/* Smart views (presets) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Vues rapides:</span>
        {PRESETS.map(p => (
          <Button
            key={p.id}
            size="sm"
            variant={activePreset === p.id ? 'default' : 'outline'}
            title={p.hint}
            onClick={() => applyPreset(p.id)}
            className={activePreset === p.id ? '' : 'text-muted-foreground'}
          >
            <p.icon className="h-3.5 w-3.5 mr-1" /> {p.label}
          </Button>
        ))}
        <div className="flex-1" />
        <Segmented
          ariaLabel="Joignabilité"
          value={reachFilter}
          onChange={(v) => patch({ preset: null, reach: v, page: null })}
          options={[
            { value: 'all', label: 'Tous' },
            { value: 'true', label: 'Joignables' },
            { value: 'false', label: 'Sans tél.', title: 'Prospects sans téléphone' },
          ]}
        />
      </div>

      {/* Filters: primary row + collapsible advanced grid */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher entreprise, contact, ville..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-9"
                />
              </div>
            </div>
            <Select id="f-stage" className="w-auto min-w-[10rem]" value={stageFilter} onChange={(e) => patch({ preset: null, stage: e.target.value, page: null })}>
              <option value="all">Tous les stages</option>
              {Object.entries(STAGES).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
            </Select>
            <Select className="w-auto min-w-[9rem]" value={languageFilter} onChange={(e) => patch({ preset: null, language: e.target.value, page: null })}>
              <option value="all">Toutes langues</option>
              {Object.entries(LANGUAGES).map(([key, l]) => <option key={key} value={key}>{l.label}</option>)}
              <option value="__empty__">Indéterminée</option>
            </Select>
            {isAdmin ? (
              <Select className="w-auto min-w-[10rem]" value={assigneeFilter} onChange={(e) => patch({ preset: null, assignedTo: e.target.value, page: null })}
                aria-label="Filtrer par commercial">
                <option value="all">Tous les commerciaux</option>
                <option value="unassigned">Non assignés</option>
                {team.map(u => <option key={u.id} value={String(u.id)}>{u.name}</option>)}
              </Select>
            ) : null}
            <Select className="w-auto min-w-[9rem]" value={archivedFilter} onChange={(e) => patch({ preset: null, archived: e.target.value, page: null })}
              aria-label="Filtrer les prospects archivés">
              <option value="exclude">Hors archives</option>
              <option value="only">Archives uniquement</option>
              <option value="include">Tous</option>
            </Select>
            <Button
              variant={showAdvanced || advancedCount > 0 ? 'default' : 'outline'}
              onClick={() => setShowAdvanced(!showAdvanced)}
              aria-expanded={showAdvanced}
            >
              <ChevronDown className={`h-4 w-4 mr-1 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              Filtres avancés{advancedCount > 0 ? ` (${advancedCount})` : ''}
            </Button>
          </div>
          {showAdvanced && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-2 border-t pt-3">
              <div>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Historique d'appel</span>
                <Select value={calledFilter} onChange={(e) => patch({ preset: null, called: e.target.value, page: null })}
                  aria-label="Filtrer par historique d'appel">
                  <option value="all">Tous</option>
                  <option value="never">Jamais appelés</option>
                  <option value="already">Déjà appelés</option>
                </Select>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Appelabilité</span>
                <Select value={dncFilter} onChange={(e) => patch({ preset: null, dnc: e.target.value, page: null })}
                  aria-label="Filtrer les prospects ayant refusé un appel">
                  <option value="exclude">Appelables uniquement</option>
                  <option value="only">Refus d'appel uniquement</option>
                  <option value="include">Tous</option>
                </Select>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Activité</span>
                <Select value={activityFilter} onChange={(e) => patch({ preset: null, activity: e.target.value, page: null })}>
                  <option value="all">Toutes activités</option>
                  {activities.map(a => <option key={a} value={a}>{a}</option>)}
                </Select>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Site</span>
                <Select value={hasSiteFilter} onChange={(e) => patch({ preset: null, hasSite: e.target.value, page: null })}>
                  <option value="all">Tous sites</option>
                  <option value="pas_de_site">Pas de site</option>
                  <option value="site_fonctionnel">Site fonctionnel</option>
                  <option value="site_vetuste">Site vétuste</option>
                </Select>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Ville</span>
                <Select value={cityFilter} onChange={(e) => patch({ preset: null, city: e.target.value, page: null })}>
                  <option value="all">Toutes villes</option>
                  <option value="__empty__">Sans ville</option>
                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Avis</span>
                <Select
                  value={hasReviewsFilter === 'all' ? 'all' : (minReviews || 'true')}
                  onChange={(e) => {
                    const v = e.target.value;
                    patch(v === 'all'
                      ? { preset: null, hasReviews: null, minReviews: null, page: null }
                      : { preset: null, hasReviews: 'true', minReviews: v === 'true' ? null : v, page: null });
                  }}
                >
                  <option value="all">Tous avis</option>
                  <option value="true">Avec avis</option>
                  <option value="10">10+ avis</option>
                  <option value="50">50+ avis</option>
                  <option value="100">100+ avis</option>
                </Select>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Note min.</span>
                <Input
                  type="number" min="0" max="5" step="0.5" placeholder="0"
                  value={minRating} onChange={(e) => patch({ preset: null, minRating: e.target.value, page: null })}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk actions bar */}
      <div className="flex flex-wrap gap-3 items-center">
        {selectedIds.size > 0 && (
          <>
            <Badge variant="secondary">{selectedIds.size} sélectionné(s)</Badge>
            <Select value={bulkStage} onChange={(e) => setBulkStage(e.target.value)}>
              <option value="">Changer le stage...</option>
              {Object.entries(STAGES).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
            </Select>
            <Button size="sm" onClick={handleBulkStage} disabled={!bulkStage}>Appliquer</Button>
            {isAdmin && (
              <>
                <Select value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)} aria-label="Assigner à un commercial">
                  <option value="">Assigner à...</option>
                  {team.map(u => <option key={u.id} value={String(u.id)}>{u.name}</option>)}
                  <option value="__none__">Personne (désassigner)</option>
                </Select>
                <Button size="sm" onClick={handleBulkAssign} disabled={!bulkAssignee}>Assigner</Button>
              </>
            )}
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={handleBulkArchive}>
                <Archive className="h-3 w-3 mr-1" /> Archiver
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              <X className="h-3 w-3 mr-1" /> Désélectionner
            </Button>
          </>
        )}
        {hiddenCount > 0 && (
          <Button size="sm" variant="outline" onClick={() => setShowHidden(!showHidden)}>
            {showHidden ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
            {showHidden ? 'Masquer' : `Afficher ${hiddenCount} masqué(s)`}
          </Button>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={handleExport}>
          <Download className="h-3 w-3 mr-1" /> Export CSV
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {/*
            tableLayout:fixed sizes columns from the header row. The declared
            widths total more than the panel, so the browser used to shrink every
            column and the new "Dernier appel" column overlapped its own text.
            A min-width makes the card scroll horizontally instead of squeezing.
          */}
          <table
            className="w-full text-sm"
            style={{ tableLayout: 'fixed', minWidth: TABLE_MIN_WIDTH }}
          >
            <thead>
              <tr className="border-b">
                <th className="h-10 px-2 text-left" style={{ width: widths.checkbox }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === visibleContacts.length && visibleContacts.length > 0}
                    onChange={toggleSelectAll}
                    aria-label="Sélectionner tous les prospects"
                    className="rounded"
                  />
                </th>
                <ResizableTh label="Entreprise" field="businessName" widths={widths} onResize={handleColResize} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <ResizableTh label="Contact" field="contactName" widths={widths} onResize={handleColResize} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <ResizableTh label="Téléphone" field="phone" widths={widths} onResize={handleColResize} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <ResizableTh label="Activité" field="activity" widths={widths} onResize={handleColResize} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <ResizableTh label="Ville" field="city" widths={widths} onResize={handleColResize} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <ResizableTh label="Note" field="googleRating" widths={widths} onResize={handleColResize} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <ResizableTh label="Opportunité" field="opportunity" widths={widths} onResize={handleColResize} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <ResizableTh label="Stage" field="stage" widths={widths} onResize={handleColResize} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <ResizableTh label="Site" field="hasSite" widths={widths} onResize={handleColResize} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <ResizableTh label="Dernier appel" field="lastCall" widths={widths} onResize={handleColResize} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <th className="h-10 px-2 text-right font-medium text-muted-foreground" style={{ width: widths.actions }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleContacts.map((contact) => {
                const isHidden = hiddenIds.has(contact.id);
                const oppScore = opportunityScore(contact);
                const oppMeta = opportunityMeta(oppScore);
                return (
                  <tr key={contact.id} className={`border-b transition-colors hover:bg-muted/50 ${isHidden ? 'opacity-40' : ''}`}>
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(contact.id)}
                        onChange={() => toggleSelect(contact.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-2 font-medium truncate" style={{ width: widths.businessName }}>
                      <span className="truncate">{contact.businessName}</span>
                      {contact.dnc === 1 && (
                        <DncBadge reason={contact.dncReason} className="ml-1.5 align-middle" />
                      )}
                    </td>
                    <td className="px-3 py-2 truncate" style={{ width: widths.contactName }}>{contact.contactName || '-'}</td>
                    <td className="px-3 py-2 truncate" style={{ width: widths.phone }}>{contact.phone || '-'}</td>
                    <td className="px-3 py-2 truncate text-muted-foreground" style={{ width: widths.activity }}>{contact.activity || '-'}</td>
                    <td className="px-3 py-2 truncate" style={{ width: widths.city }}>{contact.city || '-'}</td>
                    <td className="px-3 py-2" style={{ width: widths.rating }}>
                      {contact.googleRating ? (
                        <span className="flex items-center gap-1">
                          <span className="text-yellow-500">★</span>
                          {contact.googleRating}
                          {contact.googleReviews && <span className="text-muted-foreground text-xs">({contact.googleReviews})</span>}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2" style={{ width: widths.opportunity }}>
                      <Badge variant={oppMeta.variant} className="whitespace-nowrap" title={`Score opportunité ${oppScore}/6`}>{oppMeta.label}</Badge>
                    </td>
                    <td className="px-3 py-2" style={{ width: widths.stage }}>
                      <StageBadge stage={contact.stage} />
                    </td>
                    <td className="px-3 py-2" style={{ width: widths.site }}>
                      {contact.hasSite === 'pas_de_site' && (
                        <span className="inline-flex text-destructive" title="Pas de site"><Globe className="h-4 w-4" /><span className="sr-only">Pas de site</span></span>
                      )}
                      {contact.hasSite === 'site_vetuste' && (
                        <span className="inline-flex text-warning" title="Site vétuste (refonte)"><Globe className="h-4 w-4" /><span className="sr-only">Site vétuste</span></span>
                      )}
                      {contact.hasSite === 'site_fonctionnel' && (
                        <span className="inline-flex text-success" title="Site fonctionnel"><Globe className="h-4 w-4" /><span className="sr-only">Site fonctionnel</span></span>
                      )}
                      {!contact.hasSite && '-'}
                    </td>
                    <td className="px-3 py-2" style={{ width: widths.lastCall }}>
                      {contact.lastCallAt ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-medium">{formatDate(contact.lastCallAt)}</span>
                          <span className="text-xs text-muted-foreground">
                            {CALL_RESULTS[contact.lastCallResult || ''] || contact.lastCallResult || '-'}
                            {contact.callCount ? ` · ${contact.callCount}×` : ''}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Jamais appelé</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <RowActionsMenu
                        contact={contact}
                        isHidden={isHidden}
                        isAdmin={isAdmin}
                        onView={() => setSelectedContact(contact)}
                        onEdit={() => handleEdit(contact)}
                        onHide={() => toggleHide(contact.id)}
                        onArchive={() => handleArchive(contact.id)}
                        onRestore={() => handleRestore(contact.id)}
                      />
                    </td>
                  </tr>
                );
              })}
              {visibleContacts.length === 0 && (
                <tr>
                  <td colSpan={12} className="text-center py-8 text-muted-foreground">Aucun prospect trouvé</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Précédent</Button>
          <span className="flex items-center px-4 text-sm text-muted-foreground">Page {page} / {totalPages}</span>
          <Button variant="outline" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Suivant</Button>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <ContactEditDialog
        open={showForm}
        contact={editingContact}
        isAdmin={isAdmin}
        team={team}
        onClose={() => { setShowForm(false); setEditingContact(null); }}
        onSaved={handleSaved}
      />

      {/* View Dialog */}
      <Dialog open={!!selectedContact} onClose={() => setSelectedContact(null)}>
        <DialogHeader><DialogTitle>{selectedContact?.businessName}</DialogTitle></DialogHeader>
        {selectedContact && (
          <div className="space-y-3 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">Contact:</span> {selectedContact.contactName || '-'}</div>
              <div><span className="text-muted-foreground">Téléphone:</span> {selectedContact.phone || '-'}</div>
              <div><span className="text-muted-foreground">Email:</span> {selectedContact.email || '-'}</div>
              <div><span className="text-muted-foreground">Activité:</span> {selectedContact.activity || '-'}</div>
              <div><span className="text-muted-foreground">Ville:</span> {selectedContact.city || '-'}</div>
              <div><span className="text-muted-foreground">Note:</span> {selectedContact.googleRating ? `★ ${selectedContact.googleRating} (${selectedContact.googleReviews} avis)` : '-'}</div>
              <div><span className="text-muted-foreground">Source:</span> {selectedContact.source || '-'}</div>
              <div><span className="text-muted-foreground">Site:</span> {selectedContact.siteUrl ? <a href={selectedContact.siteUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">{selectedContact.siteUrl}</a> : '-'}</div>
              <div>
                <span className="text-muted-foreground">Stage:</span>{' '}
                <StageBadge stage={selectedContact.stage} />
              </div>
            </div>
            {selectedContact.notes && (
              <div className="p-3 rounded-lg bg-muted text-sm"><span className="text-muted-foreground">Notes:</span> {selectedContact.notes}</div>
            )}
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={archiveTarget !== null}
        title="Archiver ce prospect ?"
        description="Il disparaîtra des listes, mais ses appels, devis et recommandations seront conservés."
        confirmLabel="Archiver"
        destructive
        onConfirm={doArchive}
        onClose={() => setArchiveTarget(null)}
      />
      <ConfirmDialog
        open={confirmBulkArchive}
        title={`Archiver ${selectedIds.size} prospects ?`}
        description="Ils disparaîtront des listes. Appels, devis et recommandations seront conservés et restaurables."
        confirmLabel="Archiver"
        destructive
        onConfirm={doBulkArchive}
        onClose={() => setConfirmBulkArchive(false)}
      />
    </div>
  );
}
