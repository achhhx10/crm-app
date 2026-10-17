import React from 'react';
import { Badge, BadgeVariant } from './badge';
import { cn } from '../../lib/utils';
import { CALL_RESULTS, STAGES } from '../../lib/utils';
import { Shield, User, Ban } from 'lucide-react';

const CALL_RESULT_VARIANTS: Record<string, BadgeVariant> = {
  rdv_obtenu: 'success',
  interesse: 'warning',
  pas_interesse: 'destructive',
  messagerie: 'outline',
  pas_decroche: 'outline',
};

export function CallResultBadge({ result, className = '' }: { result: string | null | undefined; className?: string }) {
  return (
    <Badge variant={CALL_RESULT_VARIANTS[result || ''] || 'outline'} className={cn('whitespace-nowrap', className)}>
      {CALL_RESULTS[result || ''] || result || '-'}
    </Badge>
  );
}

export function StageBadge({ stage, className = '' }: { stage: string | null | undefined; className?: string }) {
  const info = STAGES[stage || 'identifie'] || STAGES.identifie;
  return (
    <Badge variant='outline' className={cn(info?.color, 'whitespace-nowrap', className)}>
      {info?.label || stage || '—'}
    </Badge>
  );
}

const DEAL_STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  en_cours: { label: 'En cours', variant: 'info' },
  signe: { label: 'Signé', variant: 'success' },
  perdu: { label: 'Perdu', variant: 'destructive' },
};

export function DealStatusBadge({ status, className = '' }: { status: string | null | undefined; className?: string }) {
  const meta = DEAL_STATUS_META[status || ''] || { label: status || '-', variant: 'secondary' as BadgeVariant };
  return (
    <Badge variant={meta.variant} className={cn('whitespace-nowrap', className)}>
      {meta.label}
    </Badge>
  );
}

export { DEAL_STATUS_META as DEAL_STATUSES };

const REFERRAL_STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  contacte: { label: 'Contacté', variant: 'info' },
  en_attente: { label: 'En attente', variant: 'warning' },
  signe: { label: 'Convertie', variant: 'success' },
  perdu: { label: 'Perdu', variant: 'destructive' },
};

/** Accepts the legacy French values written by older builds. */
export function normaliseReferralStatus(value: string | null | undefined): string {
  if (value === 'convertie') return 'signe';
  if (value === 'perdue') return 'perdu';
  return value || 'contacte';
}

export function ReferralStatusBadge({ status, className = '' }: { status: string | null | undefined; className?: string }) {
  const canonical = normaliseReferralStatus(status);
  const meta = REFERRAL_STATUS_META[canonical] || { label: canonical, variant: 'outline' as BadgeVariant };
  return (
    <Badge variant={meta.variant} className={cn('whitespace-nowrap', className)}>
      {meta.label}
    </Badge>
  );
}

export function DncBadge({
  reason,
  className = '',
  children,
}: {
  reason?: string | null;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Badge variant='destructive' title={reason || 'Ne plus appeler'} className={cn('whitespace-nowrap', className)}>
      {children ?? 'Ne pas appeler'}
    </Badge>
  );
}

export function RoleBadge({ role, className = '' }: { role: string | null | undefined; className?: string }) {
  return role === 'admin' ? (
    <Badge className={className}>
      <span className='flex items-center gap-1'>
        <Shield className='h-3 w-3' /> Admin
      </span>
    </Badge>
  ) : (
    <Badge variant='secondary' className={className}>
      <span className='flex items-center gap-1'>
        <User className='h-3 w-3' /> Démarcheur
      </span>
    </Badge>
  );
}
