import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Card, CardContent } from '../components/ui/card';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { RoleBadge } from '../components/ui/status-badges';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { useToast } from '../components/ui/toast';
import { Plus, Pencil } from 'lucide-react';

export function UsersPage() {
  const { toast } = useToast();
  const currentUser = JSON.parse(localStorage.getItem('crm_user') || '{}');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'demarcheur' });
  const [formError, setFormError] = useState('');
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'demarcheur', password: '' });
  const [editError, setEditError] = useState('');

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

  const openEdit = (u: any) => {
    setEditingUser(u);
    setEditForm({ name: u.name, email: u.email, role: u.role || 'demarcheur', password: '' });
    setEditError('');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError('');
    const payload: { name: string; email: string; role: string; password?: string } = {
      name: editForm.name,
      email: editForm.email,
      role: editForm.role,
    };
    if (editForm.password) payload.password = editForm.password;
    try {
      await api.auth.updateUser(editingUser.id, payload);
      setEditingUser(null);
      loadUsers();
      toast('Utilisateur modifié', 'success');
    } catch (err: any) {
      setEditError(err?.message || 'Erreur lors de la modification');
    }
  };

  const doDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      await api.auth.deleteUser(deleteTarget.id);
      loadUsers();
      toast('Utilisateur supprimé', 'success');
    } catch (err: any) {
      toast('Erreur lors de la suppression', 'error');
      throw err;
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
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] h-7 w-7" title="Modifier"
                        onClick={() => openEdit(u)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      {u.id !== currentUser.id && (
                        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] h-7 w-7" title="Supprimer"
                          onClick={() => setDeleteTarget({ id: u.id, name: u.name })}>
                          <span className="text-destructive text-xs">✕</span>
                        </Button>
                      )}
                    </div>
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

      <Dialog open={!!editingUser} onClose={() => setEditingUser(null)}>
        <DialogHeader>
          <DialogTitle>Modifier l'utilisateur</DialogTitle>
        </DialogHeader>
        {editError && (
          <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {editError}
          </div>
        )}
        <form onSubmit={handleSaveEdit} className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-medium">Nom *</label>
            <Input value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} required className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Email *</label>
            <Input type="email" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} required className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Mot de passe</label>
            <Input
              type="password"
              value={editForm.password}
              onChange={e => setEditForm({...editForm, password: e.target.value})}
              placeholder="Laisser vide pour conserver le mot de passe actuel"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Rôle</label>
            <Select
              value={editForm.role}
              onChange={e => setEditForm({...editForm, role: e.target.value})}
              disabled={editingUser?.id === currentUser.id}
              className="mt-1"
            >
              <option value="demarcheur">Démarcheur</option>
              <option value="admin">Admin</option>
            </Select>
            {editingUser?.id === currentUser.id && (
              <p className="text-xs text-muted-foreground mt-1">Vous ne pouvez pas modifier votre propre rôle.</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>Annuler</Button>
            <Button type="submit">Enregistrer</Button>
          </DialogFooter>
        </form>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Supprimer l'utilisateur "${deleteTarget?.name}" ?`}
        description="Action définitive. Ses appels et leads assignés restent en base."
        confirmLabel="Supprimer"
        destructive
        onConfirm={doDeleteUser}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
