import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { STAGES } from '../../lib/utils';
import type { Contact } from '../../types';
import { Button } from '../ui/button';
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Select } from '../ui/select';

export interface ContactTeamMember {
  id: number;
  name: string;
}

export interface ContactEditValues {
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  activity: string;
  city: string;
  hasSite: string;
  siteUrl: string;
  siteStatus: string;
  source: string;
  stage: string;
  notes: string;
  dnc: 0 | 1;
  dncReason: string;
  assignedTo: string;
}

interface ContactEditDialogProps {
  open: boolean;
  contact: Contact | null;
  isAdmin: boolean;
  team?: ContactTeamMember[];
  sources?: string[];
  onClose: () => void;
  onSaved: (contact: Contact) => void;
}

export const CONTACT_SOURCES = ['appel', 'internet', 'bouche_a_oreille', 'linkedin', 'autre'];

function valuesFromContact(contact: Contact | null): ContactEditValues {
  return {
    businessName: contact?.businessName || '',
    contactName: contact?.contactName || '',
    phone: contact?.phone || '',
    email: contact?.email || '',
    activity: contact?.activity || '',
    city: contact?.city || '',
    hasSite: contact?.hasSite || '',
    siteUrl: contact?.siteUrl || '',
    siteStatus: contact?.siteStatus || '',
    source: contact?.source || '',
    stage: contact?.stage || 'identifie',
    notes: contact?.notes || '',
    dnc: contact?.dnc ? 1 : 0,
    dncReason: contact?.dncReason || '',
    assignedTo: contact?.assignedTo ? String(contact.assignedTo) : '',
  };
}

export function ContactEditDialog({
  open,
  contact,
  isAdmin,
  team,
  sources = CONTACT_SOURCES,
  onClose,
  onSaved,
}: ContactEditDialogProps) {
  const [values, setValues] = useState<ContactEditValues>(() => valuesFromContact(contact));
  const [teamMembers, setTeamMembers] = useState<ContactTeamMember[]>(team || []);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(valuesFromContact(contact));
    setError('');
    setSaving(false);
  }, [open, contact]);

  useEffect(() => {
    if (!open || !isAdmin) return;
    if (team) {
      setTeamMembers(team);
      return;
    }
    let cancelled = false;
    api.auth.users()
      .then((res: any) => {
        if (cancelled) return;
        setTeamMembers(Array.isArray(res) ? res : res?.users || []);
      })
      .catch(() => {
        if (!cancelled) setTeamMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isAdmin, team]);

  const sourceOptions = contact?.source && !sources.includes(contact.source)
    ? [...sources, contact.source]
    : sources;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      const assignedTo = values.assignedTo.trim();
      const payload: Record<string, unknown> = {
        ...values,
        dnc: values.dnc,
      };
      if (isAdmin && /^\d+$/.test(assignedTo) && Number(assignedTo) > 0) {
        payload.assignedTo = Number(assignedTo);
      } else {
        delete payload.assignedTo;
      }
      const saved = contact
        ? await api.contacts.update(contact.id, payload)
        : await api.contacts.create(payload);
      onSaved(saved as Contact);
    } catch (err: any) {
      setError(err?.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>{contact ? 'Modifier le prospect' : 'Ajouter un prospect'}</DialogTitle>
      </DialogHeader>
      {error && (
        <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4 mt-4 max-h-[60vh] overflow-y-auto pr-2">
        <div>
          <label htmlFor="contact-businessName" className="text-sm font-medium">Nom de l'entreprise *</label>
          <Input id="contact-businessName" value={values.businessName} onChange={e => setValues({ ...values, businessName: e.target.value })} required className="mt-1" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="contact-contactName" className="text-sm font-medium">Nom du contact</label>
            <Input id="contact-contactName" value={values.contactName} onChange={e => setValues({ ...values, contactName: e.target.value })} className="mt-1" />
          </div>
          <div>
            <label htmlFor="contact-phone" className="text-sm font-medium">Téléphone</label>
            <Input id="contact-phone" value={values.phone} onChange={e => setValues({ ...values, phone: e.target.value })} className="mt-1" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="contact-email" className="text-sm font-medium">Email</label>
            <Input id="contact-email" value={values.email} onChange={e => setValues({ ...values, email: e.target.value })} className="mt-1" />
          </div>
          <div>
            <label htmlFor="contact-activity" className="text-sm font-medium">Activité</label>
            <Input id="contact-activity" value={values.activity} onChange={e => setValues({ ...values, activity: e.target.value })} className="mt-1" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="contact-city" className="text-sm font-medium">Ville</label>
            <Input id="contact-city" value={values.city} onChange={e => setValues({ ...values, city: e.target.value })} className="mt-1" />
          </div>
          <div>
            <label htmlFor="contact-source" className="text-sm font-medium">Source</label>
            <Select id="contact-source" value={values.source} onChange={e => setValues({ ...values, source: e.target.value })} className="mt-1">
              <option value="">Sélectionner...</option>
              {sourceOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="contact-hasSite" className="text-sm font-medium">A un site ?</label>
            <Select id="contact-hasSite" value={values.hasSite} onChange={e => setValues({ ...values, hasSite: e.target.value })} className="mt-1">
              <option value="">Sélectionner...</option>
              <option value="pas_de_site">Pas de site</option>
              <option value="site_vetuste">Site vétuste</option>
              <option value="site_fonctionnel">Site fonctionnel</option>
            </Select>
          </div>
          <div>
            <label htmlFor="contact-stage" className="text-sm font-medium">Stage</label>
            <Select id="contact-stage" value={values.stage} onChange={e => setValues({ ...values, stage: e.target.value })} className="mt-1">
              {Object.entries(STAGES).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
            </Select>
          </div>
        </div>
        {values.hasSite && values.hasSite !== 'pas_de_site' && (
          <div>
            <label htmlFor="contact-siteUrl" className="text-sm font-medium">URL du site</label>
            <Input id="contact-siteUrl" value={values.siteUrl} onChange={e => setValues({ ...values, siteUrl: e.target.value })} className="mt-1" />
          </div>
        )}
        <div>
          <label htmlFor="contact-notes" className="text-sm font-medium">Notes</label>
          <textarea id="contact-notes" value={values.notes} onChange={e => setValues({ ...values, notes: e.target.value })}
            className="mt-1 flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
        </div>
        {isAdmin && (
          <div>
            <label htmlFor="contact-assigned" className="text-sm font-medium">Commercial assigné</label>
            <Select id="contact-assigned" value={values.assignedTo} onChange={e => setValues({ ...values, assignedTo: e.target.value })}
              className="mt-1">
              <option value="">Personne</option>
              {teamMembers.map(u => <option key={u.id} value={String(u.id)}>{u.name}</option>)}
            </Select>
          </div>
        )}
        <div className="rounded-lg border border-border p-3">
          <label className="flex min-h-[44px] items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={values.dnc === 1}
              onChange={(e) => setValues({ ...values, dnc: e.target.checked ? 1 : 0 })}
              className="h-4 w-4 rounded border-input"
            />
            Ne plus appeler (opt-out)
          </label>
          <p className="text-xs text-muted-foreground mt-1">
            Masqué de la file de phoning et des listes pour toute l'équipe, sur tous les appareils.
          </p>
          {values.dnc === 1 && (
            <Input
              aria-label="Motif du refus d'appel"
              value={values.dncReason}
              onChange={e => setValues({ ...values, dncReason: e.target.value })}
              className="mt-2"
              placeholder="Motif (ex. : a demandé de ne plus être appelé)"
            />
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button type="submit" disabled={saving}>{contact ? 'Modifier' : 'Ajouter'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
