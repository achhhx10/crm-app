import React from 'react';
import { cn } from '../../lib/utils';

type SkeletonVariant = 'default' | 'card' | 'row' | 'text';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
}

export function Skeleton({ variant = 'default', className, ...props }: SkeletonProps) {
  const variantClasses: Record<SkeletonVariant, string> = {
    default: 'animate-pulse rounded-md bg-muted',
    card: 'animate-pulse rounded-lg border border-border/40 bg-muted/60',
    row: 'animate-pulse h-12 rounded-md bg-muted/70',
    text: 'animate-pulse h-4 rounded bg-muted',
  };

  return (
    <div
      className={cn(variantClasses[variant], className)}
      {...props}
    />
  );
}