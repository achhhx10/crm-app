import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Card, CardContent } from '../components/ui/card';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { useToast } from '../components/ui/toast';
import { Plus, Trash2, Shield, User } from 'lucide-react';

export function UsersPage() {
  const { toast } = useToast();
  const currentUser = JSON.parse(localStorage.getItem('crm_user') || '{}');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'demarcheur' });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await api.auth.users();
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      await api.auth.createUser(form);
      setShowForm(false);
      setForm({ name: '', email: '', password: '', role: 'demarcheur' });
      loadUsers();
      toast('Utilisateur créé', 'success');
    } catch (err: any) {
      toast("Erreur lors de la création de l'utilisateur", 'error');
      setFormError(err?.message || "Erreur lors de la création");
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Supprimer l'utilisateur "${name}" ?`)) return;
    try {
      await api.auth.deleteUser(id);
      loadUsers();
      toast('Utilisateur supprimé', 'success');
    } catch (err: any) {
      toast('Erreur lors de la suppression', 'error');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-pulse text-muted-foreground">Chargement...</div></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{users.length} utilisateur(s)</span>
        <Button onClick={() => { setFormError(''); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Ajouter un utilisateur
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="h-10 px-4 text-left font-medium text-muted-foreground">Nom</th>
                <th className="h-10 px-4 text-left font-medium text-muted-foreground">Email</th>
                <th className="h-10 px-4 text-left font-medium text-muted-foreground">Rôle</th>
                <th className="h-10 px-4 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b transition-colors hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                      {u.role === 'admin' ? (
                        <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> Admin</span>
                      ) : (
                        <span className="flex items-center gap-1"><User className="h-3 w-3" /> Démarcheur</span>
                      )}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.id !== currentUser.id && (
                      <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] h-7 w-7" title="Supprimer"
                        onClick={() => handleDelete(u.id, u.name)}>
                        <span className="text-destructive text-xs">✕</span>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-muted-foreground">Aucun utilisateur</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={showForm} onClose={() => { setShowForm(false); setFormError(''); }}>
        <DialogHeader>
          <DialogTitle>Ajouter un utilisateur</DialogTitle>
        </DialogHeader>
        {formError && (
          <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </div>
        )}
        <form onSubmit={handleCreate} className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-medium">Nom *</label>
            <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Email *</label>
            <Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Mot de passe *</label>
            <Input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Rôle</label>
            <Select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="mt-1">
              <option value="demarcheur">Démarcheur</option>
              <option value="admin">Admin</option>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setShowForm(false); setFormError(''); }}>Annuler</Button>
            <Button type="submit">Créer</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
