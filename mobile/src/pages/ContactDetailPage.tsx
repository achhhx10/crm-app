import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Phone, Mail, MapPin, Pencil, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { Page } from '../components/Page';
import { Button, Card, EmptyState, Field, Input, Select, Sheet, StageBadge, STAGES, stageLabel, Textarea } from '../components/ui';

export function ContactDetailPage() {
  const { id } = useParams();
  const contactId = Number(id);
  const [contact, setContact] = useState<any>(null);
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [edit, setEdit] = useState({ stage: '', objection: '', notes: '' });
  const [callForm, setCallForm] = useState({ result: 'pas_decroche', notes: '' });
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try {
      const [c, h] = await Promise.all([api.contacts.get(contactId), api.calls.byContact(contactId)]);
      setContact(c);
      setCalls(h);
      setEdit({ stage: c.stage || 'identifie', objection: c.objection || '', notes: c.notes || '' });
    } catch {
      setContact(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  async function saveEdit() {
    setSaving(true);
    try {
      await api.contacts.update(contactId, { stage: edit.stage, objection: edit.objection || null, notes: edit.notes || null });
      setShowEdit(false);
      refresh();
    } finally {
      setSaving(false);
    }
  }

  async function logCall() {
    setSaving(true);
    try {
      await api.calls.create({ contactId, result: callForm.result, notes: callForm.notes || null });
      setShowCall(false);
      setCallForm({ result: 'pas_decroche', notes: '' });
      refresh();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Page title="Prospect" back>
        <div className="bg-card border border-border rounded-lg p-4" aria-busy="true" aria-label="Chargement">
          <div className="skeleton h-6 w-2/3 mb-3" />
          <div className="skeleton h-4 w-1/2 mb-2" />
          <div className="skeleton h-4 w-1/3" />
        </div>
      </Page>
    );
  }

  if (!contact) {
    return (
      <Page title="Prospect" back>
        <EmptyState icon={<span className="text-[36px]">?</span>} title="Prospect introuvable" />
      </Page>
    );
  }

  return (
    <Page
      title={contact.businessName}
      back
      action={
        <button onClick={() => setShowEdit(true)} aria-label="Modifier" className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-full active:bg-muted mr-1">
          <Pencil size={22} />
        </button>
      }
    >
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-[18px] break-words">{contact.businessName}</p>
            {contact.contactName && <p className="text-muted-foreground">{contact.contactName}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <StageBadge stage={contact.stage} />
              {contact.activity && <span className="text-[13px] text-muted-foreground">{contact.activity}</span>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          {contact.phone ? (
            <a href={`tel:${contact.phone}`} className="min-h-[52px] rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2">
              <Phone size={20} /> Appeler
            </a>
          ) : null}
          <Button variant="secondary" onClick={() => setShowCall(true)}>
            <Plus size={20} /> Noter un appel
          </Button>
        </div>
        <div className="mt-4 flex flex-col gap-2 text-[15px]">
          {contact.phone && (
            <p className="flex items-center gap-2">
              <Phone size={16} className="text-muted-foreground shrink-0" />
              <a href={`tel:${contact.phone}`} className="break-all font-mono-num">{contact.phone}</a>
            </p>
          )}
          {contact.email && (
            <p className="flex items-center gap-2">
              <Mail size={16} className="text-muted-foreground shrink-0" />
              <a href={`mailto:${contact.email}`} className="break-all">{contact.email}</a>
            </p>
          )}
          {contact.city && (
            <p className="flex items-center gap-2">
              <MapPin size={16} className="text-muted-foreground shrink-0" /> {contact.city}
            </p>
          )}
          {contact.objection && <p className="text-muted-foreground">Objection : {contact.objection}</p>}
          {contact.notes && <p className="whitespace-pre-wrap">{contact.notes}</p>}
        </div>
      </Card>

      <h2 className="text-[17px] font-bold mt-2">Historique des appels ({calls.length})</h2>
      {calls.length === 0 ? (
        <EmptyState icon={<Phone size={32} />} title="Aucun appel noté" />
      ) : (
        calls.map((call) => (
          <Card key={call.id}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{call.result}</p>
              <span className="text-[13px] text-muted-foreground shrink-0">
                {call.date ? new Date(call.date).toLocaleDateString('fr-FR') : ''}
              </span>
            </div>
            {call.notes && <p className="text-[14px] text-muted-foreground mt-1">{call.notes}</p>}
          </Card>
        ))
      )}

      <Link to="/pipeline">
        <Button variant="secondary">Voir dans le pipeline</Button>
      </Link>

      <Sheet open={showEdit} onClose={() => setShowEdit(false)} title="Modifier le prospect">
        <div className="flex flex-col gap-3">
          <Field label="Étape">
            <Select value={edit.stage} onChange={(e: any) => setEdit({ ...edit, stage: e.target.value })}>
              {STAGES.map((s) => (
                <option key={s} value={s}>{stageLabel(s)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Objection">
            <Input value={edit.objection} onChange={(e: any) => setEdit({ ...edit, objection: e.target.value })} />
          </Field>
          <Field label="Notes">
            <Textarea value={edit.notes} onChange={(e: any) => setEdit({ ...edit, notes: e.target.value })} />
          </Field>
          <Button onClick={saveEdit} disabled={saving}>{saving ? '…' : 'Enregistrer'}</Button>
        </div>
      </Sheet>

      <Sheet open={showCall} onClose={() => setShowCall(false)} title="Noter un appel">
        <div className="flex flex-col gap-3">
          <Field label="Résultat">
            <Select value={callForm.result} onChange={(e: any) => setCallForm({ ...callForm, result: e.target.value })}>
              <option value="pas_decroche">Pas décroché</option>
              <option value="messagerie">Messagerie</option>
              <option value="decroche">Décroché</option>
              <option value="rdv_obtenu">RDV obtenu</option>
              <option value="refus">Refus</option>
              <option value="a_rappeler">À rappeler</option>
            </Select>
          </Field>
          <Field label="Notes">
            <Textarea value={callForm.notes} onChange={(e: any) => setCallForm({ ...callForm, notes: e.target.value })} />
          </Field>
          <Button onClick={logCall} disabled={saving}>{saving ? '…' : 'Enregistrer'}</Button>
        </div>
      </Sheet>
    </Page>
  );
}
