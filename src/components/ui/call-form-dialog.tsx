import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Button } from './button';
import { Input } from './input';
import { Select } from './select';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from './dialog';
import { ContactPicker, PickedContact } from './contact-picker';
import { useToast } from './toast';
import { CALL_RESULTS, OBJECTIONS } from '../../lib/utils';
import { Phone as PhoneIcon } from 'lucide-react';

export interface CallFormContact {
  id: number;
  businessName?: string | null;
  phone?: string | null;
  nextStep?: string | null;
}

interface CallFormDialogProps {
  open: boolean;
  /** Fixed-call target (contact detail, follow-ups, contacts list). Omit to let the user search one. */
  contact?: CallFormContact | null;
  /** Show the contact search picker (manual call logging). */
  allowContactChoice?: boolean;
  defaultResult?: string;
  /** Prefilled duration in seconds (timer-based quick calls). */
  defaultDuration?: string;
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY_FORM = {
  duration: '',
  result: 'interesse',
  objection: '',
  notes: '',
  nextStep: '',
  nextStepAt: '',
};

/**
 * Single shared call-logging dialog. The three legacy copies (Calls log,
 * Follow-ups, Contacts quick call) drifted apart; this one owns the payload
 * rules shared with PhoningPage (duration positive integer, optional
 * nextStep/nextStepAt, server-side validation).
 */
export function CallFormDialog({
  open,
  contact,
  allowContactChoice = false,
  defaultResult = 'interesse',
  defaultDuration = '',
  onClose,
  onSaved,
}: CallFormDialogProps) {
  const { toast } = useToast();
  const [picked, setPicked] = useState<PickedContact | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPicked(null);
      setForm({ ...EMPTY_FORM, result: defaultResult, duration: defaultDuration });
    }
  }, [open, contact?.id, defaultResult, defaultDuration]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const contactId = contact && !allowContactChoice ? contact.id : picked ? picked.id : undefined;
    const duration = form.duration && Number(form.duration) > 0 ? Math.floor(Number(form.duration)) : undefined;
    setSaving(true);
    try {
      await api.calls.create({
        contactId,
        duration,
        result: form.result,
        objection: form.objection || undefined,
        notes: form.notes || undefined,
        nextStep: form.nextStep || undefined,
        nextStepAt: form.nextStepAt || undefined,
      });
      toast('Appel enregistré', 'success');
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      toast("Erreur lors de l'enregistrement de l'appel", 'error');
    } finally {
      setSaving(false);
    }
  };

  const headline = !open
    ? ''
    : allowContactChoice
      ? 'Enregistrer un appel'
      : contact
        ? `Enregistrer un appel — ${contact.businessName || `#${contact.id}`}`
        : 'Enregistrer un appel';

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>{headline}</DialogTitle>
      </DialogHeader>
      <form onSubmit={save} className="mt-4 space-y-4">
        {contact && !allowContactChoice && contact.phone && (
          <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
            <PhoneIcon className="h-4 w-4" /> {contact.phone}
          </div>
        )}
        {contact && !allowContactChoice && contact.nextStep && (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">À traiter : </span>{contact.nextStep}
          </p>
        )}
        {allowContactChoice && (
          <div>
            <label className="text-sm font-medium">Prospect</label>
            <div className="mt-1">
              <ContactPicker value={picked} onChange={setPicked} />
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="shared-call-duration" className="text-sm font-medium">Durée (secondes)</label>
            <Input
              id="shared-call-duration"
              type="number"
              min={1}
              value={form.duration}
              onChange={e => setForm({ ...form, duration: e.target.value })}
              className="mt-1"
              placeholder="—"
            />
          </div>
          <div>
            <label htmlFor="shared-call-result" className="text-sm font-medium">Résultat *</label>
            <Select
              id="shared-call-result"
              value={form.result}
              onChange={e => setForm({ ...form, result: e.target.value })}
              className="mt-1"
              required
            >
              {Object.entries(CALL_RESULTS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <label htmlFor="shared-call-objection" className="text-sm font-medium">Objection</label>
          <Select
            id="shared-call-objection"
            value={form.objection}
            onChange={e => setForm({ ...form, objection: e.target.value })}
            className="mt-1"
          >
            <option value="">Aucune</option>
            {Object.entries(OBJECTIONS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="shared-call-notes" className="text-sm font-medium">Notes</label>
          <textarea
            id="shared-call-notes"
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            className="mt-1 flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="shared-call-next-step" className="text-sm font-medium">Prochaine étape</label>
            <Input
              id="shared-call-next-step"
              value={form.nextStep}
              onChange={e => setForm({ ...form, nextStep: e.target.value })}
              className="mt-1"
              placeholder="Rappeler pour le devis"
            />
          </div>
          <div>
            <label htmlFor="shared-call-next-step-at" className="text-sm font-medium">Date de relance</label>
            <Input
              id="shared-call-next-step-at"
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              value={form.nextStepAt}
              onChange={e => setForm({ ...form, nextStepAt: e.target.value })}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
