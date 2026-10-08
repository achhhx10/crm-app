import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Page } from '../components/Page';
import { Button, Card, EmptyState, Field, Input, Select, Sheet } from '../components/ui';

export function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'demarcheur' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setUsers(await api.auth.users());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function create() {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError('Nom, email et mot de passe requis');
      return;
    }
    if (form.password.length < 8) {
      setError('Mot de passe : 8 caractères minimum');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.auth.createUser({ ...form, name: form.name.trim(), email: form.email.trim() });
      setShowNew(false);
      setForm({ name: '', email: '', password: '', role: 'demarcheur' });
      refresh();
    } catch (e: any) {
      setError(e.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page
      title="Utilisateurs"
      back
      action={
        <button onClick={() => setShowNew(true)} aria-label="Nouvel utilisateur" className="min-h-[48px] px-4 rounded-full bg-primary text-primary-foreground font-semibold mr-1">
          + Nouveau
        </button>
      }
    >
      {loading ? (
        <p className="text-center text-muted-foreground py-10">Chargement…</p>
      ) : users.length === 0 ? (
        <EmptyState icon={<span className="text-[36px]">👥</span>} title="Aucun utilisateur" />
      ) : (
        users.map((u) => (
          <Card key={u.id}>
            <p className="font-bold">{u.name}</p>
            <p className="text-[14px] text-muted-foreground">{u.email} · {u.role}</p>
          </Card>
        ))
      )}

      <Sheet open={showNew} onClose={() => setShowNew(false)} title="Nouvel utilisateur">
        <div className="flex flex-col gap-3">
          <Field label="Nom *">
            <Input value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Email *">
            <Input type="email" value={form.email} onChange={(e: any) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Mot de passe * (8+ caractères)">
            <Input type="password" value={form.password} onChange={(e: any) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="Rôle">
            <Select value={form.role} onChange={(e: any) => setForm({ ...form, role: e.target.value })}>
              <option value="demarcheur">Démarcheur</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          {error && <p className="text-destructive text-[14px]">{error}</p>}
          <Button onClick={create} disabled={saving}>{saving ? '…' : 'Créer'}</Button>
        </div>
      </Sheet>
    </Page>
  );
}
