import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../lib/api';
import { Page } from '../components/Page';
import { Button, Card, EmptyState, Field, Input, Select, Sheet } from '../components/ui';

export function DealsPage() {
  const [stats, setStats] = useState<any>(null);
  const [deals, setDeals] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ businessName: '', amount: '', status: 'en_cours' });
  const [found, setFound] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true);
    try {
      const [s, d] = await Promise.all([api.deals.stats(), api.deals.list({ limit: '50' })]);
      setStats(s);
      setDeals(d.deals);
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
      setError('Choisissez un prospect existant');
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Montant invalide');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.deals.create({ contactId: match.id, amount, status: form.status });
      setShowNew(false);
      setForm({ businessName: '', amount: '', status: 'en_cours' });
      setFound([]);
      refresh();
    } catch (e: any) {
      setError(e.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(deal: any, status: string) {
    await api.deals.update(deal.id, { status });
    refresh();
  }

  return (
    <Page
      title={`Deals (${total})`}
      action={
        <button onClick={() => setShowNew(true)} aria-label="Nouveau deal" className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-full bg-primary text-primary-foreground mr-1">
          <Plus size={24} />
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <Card className="text-center">
          <p className="text-[24px] font-bold">{stats?.signed ?? '—'}</p>
          <p className="text-[13px] text-muted-foreground">Signés</p>
        </Card>
        <Card className="text-center">
          <p className="text-[24px] font-bold">{stats ? `${stats.closingRate}%` : '—'}</p>
          <p className="text-[13px] text-muted-foreground">Closing</p>
        </Card>
        <Card className="col-span-2 text-center">
          <p className="text-[24px] font-bold">{stats ? `${Number(stats.totalRevenue).toLocaleString('fr-FR')} €` : '—'}</p>
          <p className="text-[13px] text-muted-foreground">Revenu signé</p>
        </Card>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-10">Chargement…</p>
      ) : deals.length === 0 ? (
        <EmptyState icon={<span className="text-[36px]">€</span>} title="Aucun deal" />
      ) : (
        deals.map((d) => (
          <Card key={d.id}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-[16px]">{Number(d.amount).toLocaleString('fr-FR')} €</p>
              <span className="text-[13px] text-muted-foreground">{d.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button onClick={() => setStatus(d, 'signe')} className="min-h-[48px] rounded-xl bg-green-500/15 text-green-600 dark:text-green-400 font-semibold">
                Signé
              </button>
              <button onClick={() => setStatus(d, 'perdu')} className="min-h-[48px] rounded-xl bg-destructive/10 text-destructive font-semibold">
                Perdu
              </button>
            </div>
          </Card>
        ))
      )}

      <Sheet open={showNew} onClose={() => setShowNew(false)} title="Nouveau deal">
        <div className="flex flex-col gap-3">
          <Field label="Prospect">
            <Input value={form.businessName} onChange={(e: any) => searchContact(e.target.value)} placeholder="Nom du commerce…" />
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
          <Field label="Montant (€)">
            <Input type="number" inputMode="decimal" min={0} value={form.amount} onChange={(e: any) => setForm({ ...form, amount: e.target.value })} placeholder="1500" />
          </Field>
          {error && <p className="text-destructive text-[14px]">{error}</p>}
          <Button onClick={save} disabled={saving}>{saving ? '…' : 'Créer'}</Button>
        </div>
      </Sheet>
    </Page>
  );
}
