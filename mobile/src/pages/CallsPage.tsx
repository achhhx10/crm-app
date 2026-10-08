import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { api } from '../lib/api';
import { Page } from '../components/Page';
import { Button, Card, EmptyState, Field, Input, Select, Sheet, Textarea } from '../components/ui';

export function CallsPage() {
  const [stats, setStats] = useState<any>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ businessName: '', result: 'pas_decroche', notes: '' });
  const [found, setFound] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.calls.stats().then(setStats).catch(() => {});
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
      setError('Choisissez un prospect existant dans la liste');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.calls.create({ contactId: match.id, result: form.result, notes: form.notes || null });
      setShowNew(false);
      setForm({ businessName: '', result: 'pas_decroche', notes: '' });
      setFound([]);
      api.calls.stats().then(setStats).catch(() => {});
    } catch (e: any) {
      setError(e.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page
      title="Appels"
      action={
        <button onClick={() => setShowNew(true)} aria-label="Noter un appel" className="min-h-[48px] px-4 flex items-center gap-1 rounded-full bg-primary text-primary-foreground font-semibold mr-1">
          <Phone size={20} /> Noter
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <Card className="text-center">
          <p className="text-[24px] font-bold">{stats?.today ?? '—'}</p>
          <p className="text-[13px] text-muted-foreground">Aujourd'hui</p>
        </Card>
        <Card className="text-center">
          <p className="text-[24px] font-bold">{stats?.month ?? '—'}</p>
          <p className="text-[13px] text-muted-foreground">Ce mois</p>
        </Card>
        <Card className="text-center">
          <p className="text-[24px] font-bold">{stats?.rdvObtained ?? '—'}</p>
          <p className="text-[13px] text-muted-foreground">RDV obtenus</p>
        </Card>
        <Card className="text-center">
          <p className="text-[24px] font-bold">{stats ? `${stats.connectionRate}%` : '—'}</p>
          <p className="text-[13px] text-muted-foreground">Aboutissement</p>
        </Card>
      </div>

      <p className="text-[14px] text-muted-foreground">
        Pour appeler : ouvrez un prospect et touchez <strong>Appeler</strong>, puis revenez ici ou sur sa fiche pour noter le résultat.
      </p>
      <Link to="/contacts">
        <Button variant="secondary">Aller aux prospects</Button>
      </Link>

      <Sheet open={showNew} onClose={() => setShowNew(false)} title="Noter un appel">
        <div className="flex flex-col gap-3">
          <Field label="Prospect">
            <Input value={form.businessName} onChange={(e: any) => searchContact(e.target.value)} placeholder="Nom du commerce…" />
          </Field>
          {found.length > 0 && (
            <div className="flex flex-col gap-1">
              {found.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setForm({ ...form, businessName: c.businessName });
                    setFound([c]);
                  }}
                  className="min-h-[48px] px-4 rounded-xl bg-card border border-border text-left font-medium truncate"
                >
                  {c.businessName} <span className="text-muted-foreground">· {c.city || ''}</span>
                </button>
              ))}
            </div>
          )}
          <Field label="Résultat">
            <Select value={form.result} onChange={(e: any) => setForm({ ...form, result: e.target.value })}>
              <option value="pas_decroche">Pas décroché</option>
              <option value="messagerie">Messagerie</option>
              <option value="decroche">Décroché</option>
              <option value="rdv_obtenu">RDV obtenu</option>
              <option value="refus">Refus</option>
              <option value="a_rappeler">À rappeler</option>
            </Select>
          </Field>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {error && <p className="text-destructive text-[14px]">{error}</p>}
          <Button onClick={save} disabled={saving}>{saving ? '…' : 'Enregistrer'}</Button>
        </div>
      </Sheet>
    </Page>
  );
}
