import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Plus, Gift, Award } from 'lucide-react';
import { useToast } from '../components/ui/toast';
import { formatDate } from '../lib/utils';
import { Pagination } from '../components/ui/pagination';
import type { Contact } from '../types';

export function ReferralsPage() {
  const { toast } = useToast();
  const [referrals, setReferrals] = useState<any[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState({
    sourceContactId: '', referredName: '', referredPhone: '', referredEmail: '',
  });

  useEffect(() => {
    loadReferrals();
    loadContacts();
  }, [page]);

  const loadReferrals = async () => {
    try {
      const [referralsData, statsData] = await Promise.all([
        api.referrals.list({ page: String(page), limit: '20' }),
        api.referrals.stats(),
      ]);
      setReferrals(referralsData.referrals);
      setTotal(referralsData.total);
      setStats(statsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadContacts = async () => {
    try {
      const { contacts } = await api.contacts.list({ limit: '1000' });
      setContacts(contacts);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.referrals.create({
        sourceContactId: form.sourceContactId ? Number(form.sourceContactId) : undefined,
        referredName: form.referredName || undefined,
        referredPhone: form.referredPhone || undefined,
        referredEmail: form.referredEmail || undefined,
      });
      setShowForm(false);
      resetForm();
      loadReferrals();
      toast('Recommandation ajoutée', 'success');
    } catch (err) {
      toast("Erreur lors de l'ajout", 'error');
    }
  };

  const handleUpdateStatus = async (id: number, status: string) => {
    try {
      await api.referrals.update(id, { status });
      loadReferrals();
      toast('Statut mis à jour', 'success');
    } catch (err) {
      toast('Erreur lors de la mise à jour', 'error');
    }
  };

  const resetForm = () => {
    setForm({ sourceContactId: '', referredName: '', referredPhone: '', referredEmail: '' });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement...</p></div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total recommandations</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">Minimum 5 recommandations</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">En attente</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.en_attente || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Converties</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.converties || 0}</div>
            <p className="text-xs text-muted-foreground">5 recommandations = site gratuit</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Ajouter une recommandation
        </Button>
      </div>

      {/* Referrals Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Prospect source</TableHead>
                <TableHead>Nom recommandé</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referrals.map((ref) => (
                <TableRow key={ref.id}>
                  <TableCell>{formatDate(ref.createdAt)}</TableCell>
                  <TableCell className="font-medium">{ref.sourceName || '-'}</TableCell>
                  <TableCell>{ref.referredName || '-'}</TableCell>
                  <TableCell>{ref.referredPhone || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={ref.status === 'convertie' ? 'default' : ref.status === 'en_attente' ? 'secondary' : 'outline'}>
                      {ref.status === 'convertie' ? 'Convertie' : ref.status === 'en_attente' ? 'En attente' : 'Perdue'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {ref.status === 'en_attente' && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleUpdateStatus(ref.id, 'convertie')}>
                          Convertie
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleUpdateStatus(ref.id, 'perdue')}>
                          Perdue
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {referrals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Aucune recommandation enregistrée
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <Pagination page={page} totalPages={Math.ceil(total / 20)} onPageChange={setPage} />

      {/* Add Referral Dialog */}
      <Dialog open={showForm} onClose={() => setShowForm(false)}>
        <DialogHeader>
          <DialogTitle>Ajouter une recommandation</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-medium">Prospect source</label>
            <Select value={form.sourceContactId} onChange={e => setForm({...form, sourceContactId: e.target.value})} className="mt-1">
              <option value="">Sélectionner un prospect...</option>
              {contacts.map(c => <option key={c.id} value={String(c.id)}>{c.businessName}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Nom du recommandé</label>
            <Input value={form.referredName} onChange={e => setForm({...form, referredName: e.target.value})} className="mt-1" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Téléphone</label>
              <Input value={form.referredPhone} onChange={e => setForm({...form, referredPhone: e.target.value})} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input value={form.referredEmail} onChange={e => setForm({...form, referredEmail: e.target.value})} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button type="submit">Ajouter</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
