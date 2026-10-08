import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Plus, SlidersHorizontal, Search, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { Page } from '../components/Page';
import { Button, Card, EmptyState, Input, Select, Sheet, Field, StageBadge } from '../components/ui';

const PAGE_SIZE = 20;

export function ContactsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ businessName: '', contactName: '', phone: '', city: '', activity: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async (p: number, reset: boolean) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const params: Record<string, string> = { page: String(p), limit: String(PAGE_SIZE) };
      if (search.trim()) params.search = search.trim();
      if (stage) params.stage = stage;
      const data = await api.contacts.list(params);
      setItems((prev) => (reset ? data.contacts : [...prev, ...data.contacts]));
      setTotal(data.total);
      setPage(p);
    } catch {
      // keep existing list on error
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [search, stage]);

  useEffect(() => {
    const t = setTimeout(() => load(1, true), search ? 400 : 0);
    return () => clearTimeout(t);
  }, [load]);

  async function create() {
    if (!form.businessName.trim()) {
      setFormError('Le nom du commerce est requis');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await api.contacts.create({
        businessName: form.businessName.trim(),
        contactName: form.contactName.trim() || null,
        phone: form.phone.trim() || null,
        city: form.city.trim() || null,
        activity: form.activity.trim() || null,
        notes: form.notes.trim() || null,
      });
      setShowAdd(false);
      setForm({ businessName: '', contactName: '', phone: '', city: '', activity: '', notes: '' });
      load(1, true);
    } catch (e: any) {
      setFormError(e.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  const activeFilters = (stage ? 1 : 0);

  return (
    <Page
      title={`Prospects (${total})`}
      action={
        <button onClick={() => setShowAdd(true)} aria-label="Ajouter un prospect" className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-full bg-primary text-primary-foreground mr-1">
          <Plus size={24} />
        </button>
      }
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e: any) => setSearch(e.target.value)} placeholder="Rechercher…" className="pl-10" />
        </div>
        <button
          onClick={() => setShowFilters(true)}
          aria-label="Filtres"
          className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl bg-card border border-border relative"
        >
          <SlidersHorizontal size={20} />
          {activeFilters > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-h-[22px] min-w-[22px] px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
              {activeFilters}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-10">Chargement…</p>
      ) : items.length === 0 ? (
        <EmptyState icon={<Search size={36} />} title="Aucun prospect" hint="Modifiez la recherche ou ajoutez-en un." />
      ) : (
        <>
          {items.map((c) => (
            <Link key={c.id} to={`/contacts/${c.id}`}>
              <Card className="active:opacity-80">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[16px] truncate">{c.businessName}</p>
                    <p className="text-[14px] text-muted-foreground truncate">
                      {[c.contactName, c.city].filter(Boolean).join(' · ') || '—'}
                    </p>
                    <div className="mt-2">
                      <StageBadge stage={c.stage} />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {c.phone ? (
                      <a
                        href={`tel:${c.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Appeler ${c.businessName}`}
                        className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-full bg-primary/10 text-primary"
                      >
                        <Phone size={20} />
                      </a>
                    ) : null}
                    <ChevronRight size={20} className="text-muted-foreground" />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
          {items.length < total && (
            <Button variant="secondary" onClick={() => load(page + 1, false)} disabled={loadingMore}>
              {loadingMore ? 'Chargement…' : `Voir plus (${items.length}/${total})`}
            </Button>
          )}
        </>
      )}

      <Sheet open={showFilters} onClose={() => setShowFilters(false)} title="Filtres">
        <div className="flex flex-col gap-3">
          <Field label="Étape">
            <Select value={stage} onChange={(e: any) => setStage(e.target.value)}>
              <option value="">Toutes</option>
              <option value="identifie">Identifié</option>
              <option value="contacte">Contacté</option>
              <option value="interesse">Intéressé</option>
              <option value="rdv_programme">RDV programmé</option>
              <option value="proposition_envoyee">Proposition envoyée</option>
              <option value="signe">Signé</option>
              <option value="perdu">Perdu</option>
            </Select>
          </Field>
          <Button
            variant="secondary"
            onClick={() => {
              setStage('');
              setShowFilters(false);
            }}
          >
            Réinitialiser
          </Button>
          <Button onClick={() => setShowFilters(false)}>Appliquer</Button>
        </div>
      </Sheet>

      <Sheet open={showAdd} onClose={() => setShowAdd(false)} title="Nouveau prospect">
        <div className="flex flex-col gap-3">
          <Field label="Commerce *">
            <Input value={form.businessName} onChange={(e: any) => setForm({ ...form, businessName: e.target.value })} placeholder="Boulangerie Martin" />
          </Field>
          <Field label="Contact">
            <Input value={form.contactName} onChange={(e: any) => setForm({ ...form, contactName: e.target.value })} placeholder="Jean Martin" />
          </Field>
          <Field label="Téléphone">
            <Input type="tel" value={form.phone} onChange={(e: any) => setForm({ ...form, phone: e.target.value })} placeholder="06…" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ville">
              <Input value={form.city} onChange={(e: any) => setForm({ ...form, city: e.target.value })} placeholder="Lyon" />
            </Field>
            <Field label="Activité">
              <Input value={form.activity} onChange={(e: any) => setForm({ ...form, activity: e.target.value })} placeholder="Boulangerie" />
            </Field>
          </div>
          {formError && <p className="text-destructive text-[14px]">{formError}</p>}
          <Button onClick={create} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </Sheet>
    </Page>
  );
}
