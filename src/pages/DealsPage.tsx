import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, DollarSign, TrendingUp, Trash2 } from 'lucide-react';
import { useToast } from '../components/ui/toast';
import { formatCurrency, formatDate, STAGES } from '../lib/utils';
import { Pagination } from '../components/ui/pagination';

const SITE_TYPES: Record<string, string> = {
  vitrine_simple: 'Vitrine Simple',
  vitrine_complete: 'Vitrine Complète',
  ecommerce: 'E-commerce',
  sur_mesure: 'Sur Mesure',
};

const DEAL_STATUSES: Record<string, { label: string; color: string }> = {
  en_cours: { label: 'En cours', color: 'bg-blue-100 text-blue-700' },
  signe: { label: 'Signé', color: 'bg-green-100 text-green-700' },
  perdu: { label: 'Perdu', color: 'bg-red-100 text-red-700' },
};

interface DealStats {
  total: number;
  signed: number;
  totalRevenue: number;
  monthRevenue: number;
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
  contactName?: string;
}

export function DealsPage() {
  const { toast } = useToast();
  const user = JSON.parse(localStorage.getItem('crm_user') || '{}');
  const isAdmin = user.role === 'admin';

  const [deals, setDeals] = useState<Deal[]>([]);
  const [stats, setStats] = useState<DealStats | null>(null);
  const [contacts, setContacts] = useState<{ id: number; businessName: string; contactName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    contactId: '',
    amount: '',
    siteType: 'vitrine_simple',
    status: 'en_cours',
  });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    loadData();
  }, [page]);

  const loadData = async () => {
    try {
      const [d, s, c] = await Promise.all([
        api.deals.list({ page: String(page), limit: '20' }),
        api.deals.stats(),
        api.contacts.list({ limit: '1000' }),
      ]);
      setDeals(d.deals);
      setTotal(d.total);
      setStats(s);
      setContacts(c.contacts || []);
    } catch (err) {
      console.error('Erreur chargement deals:', err);
    } finally {
      setLoading(false);
    }
  };

  const getContactName = (contactId: number) => {
    const contact = contacts.find(c => c.id === contactId);
    return contact ? (contact.businessName || contact.contactName || `#${contactId}`) : `#${contactId}`;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      await api.deals.create({
        contactId: Number(form.contactId),
        amount: Number(form.amount),
        siteType: form.siteType,
        status: form.status,
      });
      setShowCreate(false);
      setForm({ contactId: '', amount: '', siteType: 'vitrine_simple', status: 'en_cours' });
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

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer ce deal ?')) return;
    try {
      await api.deals.delete(id);
      loadData();
      toast('Deal supprimé', 'success');
    } catch (err) {
      toast('Erreur lors de la suppression du deal', 'error');
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
            <CardTitle className="text-sm font-medium">CA du Mois</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.monthRevenue || 0)}</div>
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
        <Button onClick={() => { setForm({ contactId: '', amount: '', siteType: 'vitrine_simple', status: 'en_cours' }); setFormError(''); setShowCreate(true); }}>
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
                const dealStatus = DEAL_STATUSES[deal.status] || { label: deal.status, color: 'bg-gray-100 text-gray-700' };
                return (
                  <TableRow key={deal.id}>
                    <TableCell className="font-medium">{getContactName(deal.contactId)}</TableCell>
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
                      {isAdmin && (
                        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] h-7 w-7" title="Supprimer"
                          onClick={() => handleDelete(deal.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
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
            <label className="text-sm font-medium">Contact *</label>
            <Select value={form.contactId} onChange={e => setForm({ ...form, contactId: e.target.value })} required className="mt-1">
              <option value="">Sélectionner un contact...</option>
              {contacts.map(c => (
                <option key={c.id} value={c.id}>{c.businessName || c.contactName || `#${c.id}`}</option>
              ))}
            </Select>
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
    </div>
  );
}
