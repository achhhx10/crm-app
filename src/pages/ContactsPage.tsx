import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Segmented } from '../components/ui/segmented';
import { Card, CardContent } from '../components/ui/card';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { Plus, Search, Phone, Edit, Eye, EyeOff, ChevronUp, ChevronDown, Download, Trash2, ArrowUpDown, X, Globe, GlobeLock, Flame, Gem, RefreshCw, Ban, MapPinOff, Star } from 'lucide-react';
import { useToast } from '../components/ui/toast';
import { STAGES, CALL_RESULTS, OBJECTIONS, formatDate, opportunityScore, opportunityMeta } from '../lib/utils';
import type { Contact } from '../types';

const sources = ['appel', 'internet', 'bouche_a_oreille', 'linkedin', 'autre'];

const PRESETS: { id: string; label: string; icon: React.ElementType; hint: string; filters: Partial<Record<string, string>> }[] = [
  { id: 'chaud', label: 'Chaud', icon: Flame, hint: 'Sans site + joignable', filters: { hasSite: 'pas_de_site', reach: 'true' } },
  { id: 'premium', label: 'Premium', icon: Gem, hint: 'Sans site · note 4,5+', filters: { hasSite: 'pas_de_site', reach: 'true', minRating: '4.5' } },
  { id: 'refonte', label: 'Refonte', icon: RefreshCw, hint: 'Avec site · joignable', filters: { hasSite: 'site_fonctionnel', reach: 'true' } },
  { id: 'injoignables', label: 'Injoignables', icon: Ban, hint: 'Sans téléphone', filters: { reach: 'false' } },
  { id: 'sans_ville', label: 'Sans ville', icon: MapPinOff, hint: 'Adresse manquante à géolocaliser', filters: { city: '__empty__' } },
  { id: 'avec_avis', label: 'Avec avis', icon: Star, hint: '10 avis Google ou plus', filters: { hasReviews: 'true', minReviews: '10' } },
];

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
  site: 120,
  actions: 120,
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

export function ContactsPage() {
  const { toast } = useToast();
  const user = JSON.parse(localStorage.getItem('crm_user') || '{}');
  const isAdmin = user.role === 'admin';
  const defaultReach: 'all' | 'true' | 'false' = isAdmin ? 'all' : 'true';
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [minRating, setMinRating] = useState('');
  const [hasSiteFilter, setHasSiteFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [reachFilter, setReachFilter] = useState<'all' | 'true' | 'false'>(defaultReach);
  const [hasReviewsFilter, setHasReviewsFilter] = useState('all');
  const [minReviews, setMinReviews] = useState('');
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [activities, setActivities] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [quickCallContact, setQuickCallContact] = useState<Contact | null>(null);
  const [sortField, setSortField] = useState('opportunity');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem('crm_hidden_contacts');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [showHidden, setShowHidden] = useState(false);
  const [bulkStage, setBulkStage] = useState('');
  const { widths, save: saveWidths } = useColumnWidths();
  const [form, setForm] = useState({
    businessName: '', contactName: '', phone: '', email: '',
    activity: '', city: '', hasSite: '', siteUrl: '', siteStatus: '',
    source: '', stage: 'identifie', notes: '',
  });
  const [formError, setFormError] = useState('');
  const [callForm, setCallForm] = useState({
    result: 'pas_decroche', objection: '', notes: '', nextStep: '',
  });

  useEffect(() => {
    loadContacts();
  }, [page, stageFilter, activityFilter, minRating, hasSiteFilter, cityFilter, reachFilter, hasReviewsFilter, minReviews, sortField, sortDir]);

  useEffect(() => {
    api.contacts.activities().then(setActivities).catch(() => {});
  }, []);

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
    setPage(1);
    if (activePreset === id) {
      setActivePreset(null);
      setHasSiteFilter('all');
      setReachFilter(defaultReach);
      setMinRating('');
      setCityFilter('all');
      setHasReviewsFilter('all');
      setMinReviews('');
      return;
    }
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setHasSiteFilter(p.filters.hasSite || 'all');
    setMinRating(p.filters.minRating || '');
    setCityFilter(p.filters.city || 'all');
    setHasReviewsFilter(p.filters.hasReviews || 'all');
    setMinReviews(p.filters.minReviews || '');
    if (p.filters.reach) setReachFilter(p.filters.reach as 'true' | 'false');
    setActivePreset(id);
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setPage(1);
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

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Supprimer ${selectedIds.size} prospects ?`)) return;
    try {
      await api.contacts.bulkDelete([...selectedIds]);
      setSelectedIds(new Set());
      loadContacts();
    } catch (err) { toast('Erreur lors de la suppression', 'error'); }
  };

  const handleExport = async () => {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (stageFilter !== 'all') params.stage = stageFilter;
    if (activityFilter !== 'all') params.activity = activityFilter;
    if (minRating) params.minRating = minRating;
    if (hasSiteFilter !== 'all') params.hasSite = hasSiteFilter;
    if (cityFilter !== 'all') params.city = cityFilter;
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

  const handleQuickCall = async () => {
    if (!quickCallContact) return;
    try {
      await api.calls.create({
        contactId: quickCallContact.id,
        result: callForm.result,
        objection: callForm.objection || undefined,
        notes: callForm.notes || undefined,
        nextStep: callForm.nextStep || undefined,
      });
      setQuickCallContact(null);
      setCallForm({ result: 'pas_decroche', objection: '', notes: '', nextStep: '' });
    } catch (err) { console.error(err); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      if (editingContact) {
        await api.contacts.update(editingContact.id, form);
      } else {
        await api.contacts.create(form);
      }
      setShowForm(false);
      setEditingContact(null);
      resetForm();
      loadContacts();
      toast(editingContact ? 'Prospect modifié' : 'Prospect ajouté', 'success');
    } catch (err: any) {
      toast("Erreur lors de l'enregistrement", 'error');
      setFormError(err?.message || "Erreur lors de l'enregistrement");
    }
  };

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
    setFormError('');
    setForm({
      businessName: contact.businessName || '', contactName: contact.contactName || '',
      phone: contact.phone || '', email: contact.email || '', activity: contact.activity || '',
      city: contact.city || '', hasSite: contact.hasSite || '', siteUrl: contact.siteUrl || '',
      siteStatus: contact.siteStatus || '', source: contact.source || '',
      stage: contact.stage || 'identifie', notes: contact.notes || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer ce prospect ?')) return;
    try { await api.contacts.delete(id); loadContacts(); toast('Prospect supprimé', 'success'); } catch (err) { toast('Erreur lors de la suppression', 'error'); }
  };

  const resetForm = () => {
    setForm({
      businessName: '', contactName: '', phone: '', email: '',
      activity: '', city: '', hasSite: '', siteUrl: '', siteStatus: '',
      source: '', stage: 'identifie', notes: '',
    });
  };

  const getVisibleContacts = () => {
    return contacts.filter(c => showHidden || !hiddenIds.has(c.id));
  };

  const visibleContacts = getVisibleContacts();
  const totalPages = Math.ceil(total / 100);
  const hiddenCount = contacts.filter(c => hiddenIds.has(c.id)).length;

  if (loading && contacts.length === 0) {
    return <div className="flex items-center justify-center h-64"><div className="animate-pulse text-muted-foreground">Chargement des prospects...</div></div>;
  }

  return (
    <div className="space-y-4">
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
          onChange={(v) => { setActivePreset(null); setReachFilter(v); setPage(1); }}
          options={[
            { value: 'all', label: 'Tous' },
            { value: 'true', label: 'Joignables' },
            { value: 'false', label: 'Sans tél.', title: 'Prospects sans téléphone' },
          ]}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
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
        <Select value={stageFilter} onChange={(e) => { setActivePreset(null); setStageFilter(e.target.value); setPage(1); }}>
          <option value="all">Tous les stages</option>
          {Object.entries(STAGES).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
        </Select>
        <Select value={activityFilter} onChange={(e) => { setActivePreset(null); setActivityFilter(e.target.value); setPage(1); }}>
          <option value="all">Toutes activités</option>
          {activities.map(a => <option key={a} value={a}>{a}</option>)}
        </Select>
        <Select value={hasSiteFilter} onChange={(e) => { setActivePreset(null); setHasSiteFilter(e.target.value); setPage(1); }}>
          <option value="all">Tous sites</option>
          <option value="pas_de_site">Pas de site</option>
          <option value="site_fonctionnel">Site fonctionnel</option>
          <option value="site_vetuste">Site vétuste</option>
        </Select>
        <Select value={cityFilter} onChange={(e) => { setActivePreset(null); setCityFilter(e.target.value); setPage(1); }}>
          <option value="all">Toutes villes</option>
          <option value="__empty__">Sans ville</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select
          value={hasReviewsFilter === 'all' ? 'all' : (minReviews || 'true')}
          onChange={(e) => { setActivePreset(null); const v = e.target.value; if (v === 'all') { setHasReviewsFilter('all'); setMinReviews(''); } else if (v === 'true') { setHasReviewsFilter('true'); setMinReviews(''); } else { setHasReviewsFilter('true'); setMinReviews(v); } setPage(1); }}
        >
          <option value="all">Tous avis</option>
          <option value="true">Avec avis</option>
          <option value="10">10+ avis</option>
          <option value="50">50+ avis</option>
          <option value="100">100+ avis</option>
        </Select>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Note min:</span>
          <Input
            type="number" min="0" max="5" step="0.5" placeholder="0"
            value={minRating} onChange={(e) => { setActivePreset(null); setMinRating(e.target.value); setPage(1); }}
            className="w-20"
          />
        </div>
        <Button onClick={() => { resetForm(); setEditingContact(null); setFormError(''); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Ajouter
        </Button>
      </div>

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
              <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
                <Trash2 className="h-3 w-3 mr-1" /> Supprimer
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
        <span className="text-sm text-muted-foreground">{total} prospects</span>
        <Button size="sm" variant="outline" onClick={handleExport}>
          <Download className="h-3 w-3 mr-1" /> Export CSV
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
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
                <th className="h-10 px-2 text-right font-medium text-muted-foreground" style={{ width: widths.actions }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleContacts.map((contact) => {
                const stageInfo = STAGES[contact.stage || 'identifie'];
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
                    <td className="px-3 py-2 font-medium truncate" style={{ width: widths.businessName }}>{contact.businessName}</td>
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
                      <Badge className={stageInfo?.color}>{stageInfo?.label || contact.stage}</Badge>
                    </td>
                    <td className="px-3 py-2" style={{ width: widths.site }}>
                      {contact.hasSite === 'pas_de_site' && <span className="flex items-center gap-1 text-xs text-destructive"><GlobeLock className="h-3 w-3" /> Pas de site</span>}
                      {contact.hasSite === 'site_vetuste' && <span className="flex items-center gap-1 text-xs text-warning"><Globe className="h-3 w-3" /> Vétuste</span>}
                      {contact.hasSite === 'site_fonctionnel' && <span className="flex items-center gap-1 text-xs text-success"><Globe className="h-3 w-3" /> Site OK</span>}
                      {!contact.hasSite && '-'}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-0.5">
                        {contact.phone && (
                          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] h-7 w-7" aria-label="Enregistrer un appel"
                            onClick={() => { setQuickCallContact(contact); setCallForm({ result: 'pas_decroche', objection: '', notes: '', nextStep: '' }); }}>
                            <Phone className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] h-7 w-7" aria-label="Voir le prospect"
                          onClick={() => setSelectedContact(contact)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] h-7 w-7" aria-label="Modifier le prospect"
                          onClick={() => handleEdit(contact)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] h-7 w-7"
                          aria-label={isHidden ? 'Afficher le prospect' : 'Masquer le prospect'}
                          onClick={() => toggleHide(contact.id)}>
                          {isHidden ? <Eye className="h-3.5 w-3.5 text-muted-foreground" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                        </Button>
                        {isAdmin && (
                          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] h-7 w-7" aria-label="Supprimer le prospect"
                            onClick={() => handleDelete(contact.id)}>
                            <span className="text-destructive text-xs">✕</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibleContacts.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-8 text-muted-foreground">Aucun prospect trouvé</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Précédent</Button>
          <span className="flex items-center px-4 text-sm text-muted-foreground">Page {page} / {totalPages}</span>
          <Button variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Suivant</Button>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onClose={() => { setShowForm(false); setEditingContact(null); setFormError(''); }}>
        <DialogHeader>
          <DialogTitle>{editingContact ? 'Modifier le prospect' : 'Ajouter un prospect'}</DialogTitle>
        </DialogHeader>
        {formError && (
          <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4 mt-4 max-h-[60vh] overflow-y-auto pr-2">
          <div>
            <label htmlFor="contact-businessName" className="text-sm font-medium">Nom de l'entreprise *</label>
            <Input id="contact-businessName" value={form.businessName} onChange={e => setForm({...form, businessName: e.target.value})} required className="mt-1" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="contact-contactName" className="text-sm font-medium">Nom du contact</label>
              <Input id="contact-contactName" value={form.contactName} onChange={e => setForm({...form, contactName: e.target.value})} className="mt-1" />
            </div>
            <div>
              <label htmlFor="contact-phone" className="text-sm font-medium">Téléphone</label>
              <Input id="contact-phone" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="contact-email" className="text-sm font-medium">Email</label>
              <Input id="contact-email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="mt-1" />
            </div>
            <div>
              <label htmlFor="contact-activity" className="text-sm font-medium">Activité</label>
              <Input id="contact-activity" value={form.activity} onChange={e => setForm({...form, activity: e.target.value})} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="contact-city" className="text-sm font-medium">Ville</label>
              <Input id="contact-city" value={form.city} onChange={e => setForm({...form, city: e.target.value})} className="mt-1" />
            </div>
            <div>
              <label htmlFor="contact-source" className="text-sm font-medium">Source</label>
              <Select id="contact-source" value={form.source} onChange={e => setForm({...form, source: e.target.value})} className="mt-1">
                <option value="">Sélectionner...</option>
                {sources.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="contact-hasSite" className="text-sm font-medium">A un site ?</label>
              <Select id="contact-hasSite" value={form.hasSite} onChange={e => setForm({...form, hasSite: e.target.value})} className="mt-1">
                <option value="">Sélectionner...</option>
                <option value="pas_de_site">Pas de site</option>
                <option value="site_vetuste">Site vétuste</option>
                <option value="site_fonctionnel">Site fonctionnel</option>
              </Select>
            </div>
            <div>
              <label htmlFor="contact-stage" className="text-sm font-medium">Stage</label>
              <Select id="contact-stage" value={form.stage} onChange={e => setForm({...form, stage: e.target.value})} className="mt-1">
                {Object.entries(STAGES).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
              </Select>
            </div>
          </div>
          {form.hasSite && form.hasSite !== 'pas_de_site' && (
            <div>
              <label htmlFor="contact-siteUrl" className="text-sm font-medium">URL du site</label>
              <Input id="contact-siteUrl" value={form.siteUrl} onChange={e => setForm({...form, siteUrl: e.target.value})} className="mt-1" />
            </div>
          )}
          <div>
            <label htmlFor="contact-notes" className="text-sm font-medium">Notes</label>
            <textarea id="contact-notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
              className="mt-1 flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingContact(null); setFormError(''); }}>Annuler</Button>
            <Button type="submit">{editingContact ? 'Modifier' : 'Ajouter'}</Button>
          </DialogFooter>
        </form>
      </Dialog>

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
                <Badge className={STAGES[selectedContact.stage || 'identifie']?.color}>{STAGES[selectedContact.stage || 'identifie']?.label}</Badge>
              </div>
            </div>
            {selectedContact.notes && (
              <div className="p-3 rounded-lg bg-muted text-sm"><span className="text-muted-foreground">Notes:</span> {selectedContact.notes}</div>
            )}
          </div>
        )}
      </Dialog>

      {/* Quick Call Dialog */}
      <Dialog open={!!quickCallContact} onClose={() => setQuickCallContact(null)}>
        <DialogHeader>
          <DialogTitle>Enregistrer un appel — {quickCallContact?.businessName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          {quickCallContact?.phone && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted text-sm">
              <Phone className="h-4 w-4" /> {quickCallContact.phone}
            </div>
          )}
          <div>
            <label htmlFor="call-result" className="text-sm font-medium">Résultat *</label>
            <Select id="call-result" value={callForm.result} onChange={e => setCallForm({...callForm, result: e.target.value})} className="mt-1">
              {Object.entries(CALL_RESULTS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="call-objection" className="text-sm font-medium">Objection</label>
            <Select id="call-objection" value={callForm.objection} onChange={e => setCallForm({...callForm, objection: e.target.value})} className="mt-1">
              <option value="">Aucune</option>
              {Object.entries(OBJECTIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="call-notes" className="text-sm font-medium">Notes</label>
            <textarea id="call-notes" value={callForm.notes} onChange={e => setCallForm({...callForm, notes: e.target.value})}
              className="mt-1 flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
          </div>
          <div>
            <label htmlFor="call-nextStep" className="text-sm font-medium">Prochaine étape</label>
            <Input id="call-nextStep" value={callForm.nextStep} onChange={e => setCallForm({...callForm, nextStep: e.target.value})} className="mt-1" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickCallContact(null)}>Annuler</Button>
            <Button onClick={handleQuickCall}>Enregistrer</Button>
          </DialogFooter>
        </div>
      </Dialog>
    </div>
  );
}
