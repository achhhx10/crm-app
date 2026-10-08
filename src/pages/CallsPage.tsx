import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Plus, Search, Phone } from 'lucide-react';
import { useToast } from '../components/ui/toast';
import { CALL_RESULTS, OBJECTIONS, formatDate, formatDateTime, formatDuration } from '../lib/utils';
import type { Contact } from '../types';

export function CallsPage() {
  const { toast } = useToast();
  const [calls, setCalls] = useState<any[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [contactFilter, setContactFilter] = useState('');
  const [form, setForm] = useState({
    contactId: '', duration: '', result: 'pas_decroche', objection: '', notes: '', nextStep: '',
  });

  useEffect(() => {
    loadCalls();
    loadContacts();
  }, [contactFilter]);

  const loadCalls = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (contactFilter) params.contactId = contactFilter;
      const [callsData, statsData] = await Promise.all([
        api.calls.list(params),
        api.calls.stats(),
      ]);
      setCalls(callsData);
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
      await api.calls.create({
        contactId: form.contactId ? Number(form.contactId) : undefined,
        duration: form.duration ? Number(form.duration) : undefined,
        result: form.result,
        objection: form.objection || undefined,
        notes: form.notes || undefined,
        nextStep: form.nextStep || undefined,
      });
      setShowForm(false);
      resetForm();
      loadCalls();
      toast('Appel enregistré', 'success');
    } catch (err) {
      toast("Erreur lors de l'enregistrement de l'appel", 'error');
    }
  };

  const resetForm = () => {
    setForm({ contactId: '', duration: '', result: 'pas_decroche', objection: '', notes: '', nextStep: '' });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement...</p></div>;
  }

  return (
    <div className="space-y-6">
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
            <CardTitle className="text-sm font-medium">Ce mois</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.month || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">RDV obtenus</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.rdv || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px]">
          <Select value={contactFilter} onChange={(e) => setContactFilter(e.target.value)}>
            <option value="">Tous les contacts</option>
            {contacts.map(c => <option key={c.id} value={String(c.id)}>{c.businessName}</option>)}
          </Select>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.map((call) => (
                <TableRow key={call.id}>
                  <TableCell>{formatDateTime(call.date)}</TableCell>
                  <TableCell className="font-medium">{call.contactName || 'Sans contact'}</TableCell>
                  <TableCell>
                    <Badge variant={call.result === 'rdv_obtenu' ? 'default' : call.result === 'interesse' ? 'secondary' : 'outline'}>
                      {CALL_RESULTS[call.result] || call.result}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDuration(call.duration)}</TableCell>
                  <TableCell>{call.objection ? OBJECTIONS[call.objection] || call.objection : '-'}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{call.notes || '-'}</TableCell>
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
      <Dialog open={showForm} onClose={() => setShowForm(false)}>
        <DialogHeader>
          <DialogTitle>Enregistrer un appel</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-medium">Contact</label>
            <Select value={form.contactId} onChange={e => setForm({...form, contactId: e.target.value})} className="mt-1">
              <option value="">Sélectionner un contact...</option>
              {contacts.map(c => <option key={c.id} value={String(c.id)}>{c.businessName}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Durée (secondes)</label>
              <Input type="number" value={form.duration} onChange={e => setForm({...form, duration: e.target.value})} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Résultat *</label>
              <Select value={form.result} onChange={e => setForm({...form, result: e.target.value})} className="mt-1" required>
                {Object.entries(CALL_RESULTS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Objection</label>
            <Select value={form.objection} onChange={e => setForm({...form, objection: e.target.value})} className="mt-1">
              <option value="">Aucune</option>
              {Object.entries(OBJECTIONS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm({...form, notes: e.target.value})}
              className="mt-1 flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Prochaine étape</label>
            <Input value={form.nextStep} onChange={e => setForm({...form, nextStep: e.target.value})} className="mt-1" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button type="submit">Enregistrer</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
