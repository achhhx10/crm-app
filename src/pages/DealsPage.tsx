import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, DollarSign, TrendingUp, Trash2, Pencil } from 'lucide-react';
import { useToast } from '../components/ui/toast';
import { formatCurrency, formatDate } from '../lib/utils';
import { DealStatusBadge, DEAL_STATUSES } from '../components/ui/status-badges';
import { useSearchParams } from 'react-router-dom';
import { DateRangePicker } from '../components/ui/date-range';
import { Pagination } from '../components/ui/pagination';
import { ContactPicker, PickedContact } from '../components/ui/contact-picker';
import { ConfirmDialog } from '../components/ui/confirm-dialog';

const SITE_TYPES: Record<string, string> = {
  vitrine_simple: 'Vitrine Simple',
  vitrine_complete: 'Vitrine Complète',
  ecommerce: 'E-commerce',
  sur_mesure: 'Sur Mesure',
};

interface DealStats {
  total: number;
  signed: number;
  totalRevenue: number;
  periodRevenue: number;
  openPipeline: number;
  closingRate: number;
}

interface Deal {
  id: number;
  contactId: number;
  amount: number;
  siteType: string;
  status: string;
  assignedTo: number | null;
  createdAt: number | null;
  signedAt: number | null;
  contactName?: string | null;
  contactCity?: string | null;
}

export function DealsPage() {
  const { toast } = useToast();
  const user = JSON.parse(localStorage.getItem('crm_user') || '{}');
  const isAdmin = user.role === 'admin';

  const [deals, setDeals] = useState<Deal[]>([]);
  const [stats, setStats] = useState<DealStats | null>(null);
  const [pickedContact, setPickedContact] = useState<PickedContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
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
  const [total, setTotal] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [editForm, setEditForm] = useState({ amount: '', siteType: 'vitrine_simple', status: 'en_cours' });
  const [editError, setEditError] = useState('');

  const openEdit = (deal: Deal) => {
    setEditForm({
      amount: deal.amount != null ? String(deal.amount) : '',
      siteType: deal.siteType || 'vitrine_simple',
      status: deal.status || 'en_cours',
    });
    setEditError('');
    setEditingDeal(deal);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDeal) return;
    const amount = editForm.amount === '' ? null : Number(editForm.amount);
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
      setEditError('Le montant doit être un nombre positif');
      return;
    }
    try {
      await api.deals.update(editingDeal.id, { amount, siteType: editForm.siteType, status: editForm.status });
      setEditingDeal(null);
      loadData();
      toast('Deal modifié', 'success');
    } catch (err: any) {
      setEditError(err?.message || 'Erreur lors de la modification');
    }
  };
  const [form, setForm] = useState({
    amount: '',
    siteType: 'vitrine_simple',
    status: 'en_cours',
  });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    loadData();
  }, [page, rangePreset, range.from, range.to]);

  const loadData = async () => {
    try {
      const [d, s] = await Promise.all([
        api.deals.list({ page: String(page), limit: '20' }),
        api.deals.stats(rangePreset !== 'all'
          ? { ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) }
          : {}),
      ]);
      setDeals(d.deals);
      setTotal(d.total);
      setStats(s);
    } catch (err) {
      console.error('Erreur chargement deals:', err);
    } finally {
      setLoading(false);
    }
  };

  const getContactName = (deal: Deal) =>
    deal.contactName || `#${deal.contactId}`;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      if (!pickedContact) {
        setFormError('Sélectionnez un prospect');
        return;
      }
      await api.deals.create({
        contactId: pickedContact.id,
        amount: Number(form.amount),
        siteType: form.siteType,
        status: form.status,
      });
      setShowCreate(false);
      setPickedContact(null);
      setForm({ amount: '', siteType: 'vitrine_simple', status: 'en_cours' });
      loadData();
      toast('Deal créé', 'success');
    } catch (err: any) {
      toast('Erreur lors de la création du deal', 'error');
      setFormError(err?.message || 'Erreur lors de la création');
    }
  };

  const handleStatusChange = async (dealId: number, newStatus: string) => {
    try {
      await api.deals.update(dealId, { status: newStatus });
      setDeals(prev => prev.map(d => d.id === dealId ? { ...d, status: newStatus } : d));
      loadData();
      toast('Statut mis à jour', 'success');
    } catch (err) {
      toast('Erreur lors de la mise à jour du statut', 'error');
    }
  };

  const handleDelete = (id: number) => {
    setDeleteTarget(id);
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deals.delete(deleteTarget);
      loadData();
      toast('Deal supprimé', 'success');
    } catch (err) {
      toast('Erreur lors de la suppression du deal', 'error');
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DateRangePicker value={range} preset={rangePreset} onChange={onRangeChange} />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Deals</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Deals Signés</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.signed || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Chiffre d'Affaires Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.totalRevenue || 0)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">CA signé sur la période</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.periodRevenue || 0)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Taux de Closing</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.closingRate || 0}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Header + Create Button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Liste des Deals</h2>
        <Button onClick={() => { setPickedContact(null); setForm({ amount: '', siteType: 'vitrine_simple', status: 'en_cours' }); setFormError(''); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nouveau Deal
        </Button>
      </div>

      {/* Deals Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Type de site</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Date de création</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deals.map((deal) => {
                return (
                  <TableRow key={deal.id}>
                    <TableCell className="font-medium">{getContactName(deal)}</TableCell>
                    <TableCell>{formatCurrency(deal.amount)}</TableCell>
                    <TableCell>{SITE_TYPES[deal.siteType] || deal.siteType}</TableCell>
                    <TableCell>
                      <Select
                        value={deal.status}
                        onChange={(e) => handleStatusChange(deal.id, e.target.value)}
                        className="w-40 h-8 text-xs"
                      >
                        {Object.entries(DEAL_STATUSES).map(([key, s]) => (
                          <option key={key} value={key}>{s.label}</option>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>{formatDate(deal.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] h-7 w-7" title="Modifier"
                          onClick={() => openEdit(deal)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {isAdmin && (
                          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] h-7 w-7" title="Supprimer"
                            onClick={() => handleDelete(deal.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {deals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Aucun deal trouvé
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <Pagination page={page} totalPages={Math.ceil(total / 20)} onPageChange={setPage} />

      {/* Create Dialog */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)}>
        <DialogHeader>
          <DialogTitle>Nouveau Deal</DialogTitle>
        </DialogHeader>
        {formError && (
          <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </div>
        )}
        <form onSubmit={handleCreate} className="space-y-4 mt-4">
          <div>
            <label htmlFor="deal-contact" className="text-sm font-medium">Contact *</label>
            <div className="mt-1">
              <ContactPicker
                id="deal-contact"
                value={pickedContact}
                onChange={setPickedContact}
                required
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Montant (€) *</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })}
              required
              className="mt-1"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Type de site *</label>
            <Select value={form.siteType} onChange={e => setForm({ ...form, siteType: e.target.value })} required className="mt-1">
              {Object.entries(SITE_TYPES).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Statut *</label>
            <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} required className="mt-1">
              {Object.entries(DEAL_STATUSES).map(([key, s]) => (
                <option key={key} value={key}>{s.label}</option>
              ))}
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Annuler</Button>
            <Button type="submit">Créer le Deal</Button>
          </DialogFooter>
        </form>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Supprimer ce deal ?"
        confirmLabel="Supprimer"
        destructive
        onConfirm={doDelete}
        onClose={() => setDeleteTarget(null)}
      />

      <Dialog open={!!editingDeal} onClose={() => setEditingDeal(null)}>
        <DialogHeader>
          <DialogTitle>Modifier le deal — {editingDeal && getContactName(editingDeal)}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleEditSave} className="space-y-4 mt-4">
          <div>
            <label htmlFor="edit-deal-amount" className="text-sm font-medium">Montant (€)</label>
            <Input
              id="edit-deal-amount"
              type="number"
              min="0"
              step="0.01"
              value={editForm.amount}
              onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
              className="mt-1"
              placeholder="0.00"
            />
          </div>
          <div>
            <label htmlFor="edit-deal-site" className="text-sm font-medium">Type de site</label>
            <Select id="edit-deal-site" value={editForm.siteType} onChange={e => setEditForm({ ...editForm, siteType: e.target.value })} className="mt-1">
              {Object.entries(SITE_TYPES).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="edit-deal-status" className="text-sm font-medium">Statut</label>
            <Select id="edit-deal-status" value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })} className="mt-1">
              {Object.entries(DEAL_STATUSES).map(([key, s]) => (
                <option key={key} value={key}>{s.label}</option>
              ))}
            </Select>
          </div>
          {editError && <p className="text-sm text-destructive">{editError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingDeal(null)}>Annuler</Button>
            <Button type="submit">Enregistrer</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
