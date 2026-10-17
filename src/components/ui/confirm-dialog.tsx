import React, { useState } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from './dialog';
import { Button } from './button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<unknown> | unknown;
  onClose: () => void;
}

/**
 * Accessible replacement for the native window.confirm() used across pages:
 * onConfirm runs async (the dialog stays busy while it resolves), closes on
 * success and stays open on failure so the caller's toast is not lost.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      /* the caller showed the error toast */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      {description && (
        <p className="mt-3 text-sm text-muted-foreground whitespace-pre-line">{description}</p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button type="button" variant={destructive ? 'destructive' : 'default'} onClick={confirm} disabled={busy}>
          {busy ? '…' : confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
