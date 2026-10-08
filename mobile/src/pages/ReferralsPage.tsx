import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../lib/api';
import { Page } from '../components/Page';
import { Button, Card, EmptyState, Field, Input, Sheet } from '../components/ui';

export function ReferralsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ businessName: '', referredName: '', referredPhone: '' });
  const [found, setFound] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true);
    try {
      const d = await api.referrals.list({ limit: '50' });
      setItems(d.referrals);
      setTotal(d.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function searchContact(name: string) {
    setForm({ ...form, businessName: name });
    if (name.trim().length < 2) {
      setFound([]);
      return;
    }
    try {
      const data = await api.contacts.list({ search: name.trim(), limit: '5' });
      setFound(data.contacts);
    } catch {
      setFound([]);
    }
  }

  async function save() {
    const match = found.find((c) => c.businessName.toLowerCase() === form.businessName.trim().toLowerCase()) || found[0];
    if (!match) {
      setError('Choisissez le commerce source');
      return;
    }
    if (!form.referredName.trim()) {
      setError('Le nom du recommandé est requis');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.referrals.create({
        sourceContactId: match.id,
        referredName: form.referredName.trim(),
        referredPhone: form.referredPhone.trim() || null,
      });
      setShowNew(false);
      setForm({ businessName: '', referredName: '', referredPhone: '' });
      setFound([]);
      refresh();
    } catch (e: any) {
      setError(e.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(r: any, status: string) {
    await api.referrals.update(r.id, { status });
    refresh();
  }

  return (
    <Page
      title={`Recommandations (${total})`}
      action={
        <button onClick={() => setShowNew(true)} aria-label="Nouvelle recommandation" className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-full bg-primary text-primary-foreground mr-1">
          <Plus size={24} />
        </button>
      }
    >
      {loading ? (
        <p className="text-center text-muted-foreground py-10">Chargement…</p>
      ) : items.length === 0 ? (
        <EmptyState icon={<span className="text-[36px]">🤝</span>} title="Aucune recommandation" />
      ) : (
        items.map((r) => (
          <Card key={r.id}>
            <p className="font-bold text-[16px]">{r.referredName}</p>
            {r.referredPhone && <a href={`tel:${r.referredPhone}`} className="text-primary text-[15px]">{r.referredPhone}</a>}
            <div className="flex items-center justify-between mt-2">
              <span className="text-[13px] text-muted-foreground">{r.status}</span>
              <div className="flex gap-2">
                <button onClick={() => setStatus(r, 'signe')} className="min-h-[44px] px-4 rounded-xl bg-green-500/15 text-green-600 dark:text-green-400 text-[14px] font-semibold">
                  Convertie
                </button>
                <button onClick={() => setStatus(r, 'perdu')} className="min-h-[44px] px-4 rounded-xl bg-muted text-muted-foreground text-[14px] font-semibold">
                  Perdue
                </button>
              </div>
            </div>
          </Card>
        ))
      )}

      <Sheet open={showNew} onClose={() => setShowNew(false)} title="Nouvelle recommandation">
        <div className="flex flex-col gap-3">
          <Field label="Commerce source">
            <Input value={form.businessName} onChange={(e: any) => searchContact(e.target.value)} placeholder="Qui recommande ?" />
          </Field>
          {found.length > 0 && (
            <div className="flex flex-col gap-1">
              {found.map((c) => (
                <button key={c.id} onClick={() => { setForm({ ...form, businessName: c.businessName }); setFound([c]); }} className="min-h-[48px] px-4 rounded-xl bg-card border border-border text-left font-medium truncate">
                  {c.businessName}
                </button>
              ))}
            </div>
          )}
          <Field label="Nom du recommandé *">
            <Input value={form.referredName} onChange={(e: any) => setForm({ ...form, referredName: e.target.value })} />
          </Field>
          <Field label="Téléphone">
            <Input type="tel" value={form.referredPhone} onChange={(e: any) => setForm({ ...form, referredPhone: e.target.value })} />
          </Field>
          {error && <p className="text-destructive text-[14px]">{error}</p>}
          <Button onClick={save} disabled={saving}>{saving ? '…' : 'Enregistrer'}</Button>
        </div>
      </Sheet>
    </Page>
  );
}
