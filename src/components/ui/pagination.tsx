import { Button } from './button';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;
  
  return (
    <div className="flex items-center justify-center gap-2">
      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onPageChange(page - 1)}>
        Précédent
      </Button>
      <span className="text-sm text-muted-foreground px-3">
        Page {page} / {totalPages}
      </span>
      <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>
        Suivant
      </Button>
    </div>
  );
}
