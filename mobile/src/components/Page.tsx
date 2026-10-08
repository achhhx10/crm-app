import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

export function Page({ title, back, action, children }: { title: string; back?: boolean; action?: ReactNode; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh pb-24">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-1 px-2 min-h-[60px]">
          {back ? (
            <button
              onClick={() => navigate(-1)}
              aria-label="Retour"
              className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-full active:bg-muted"
            >
              <ChevronLeft size={26} />
            </button>
          ) : (
            <div className="w-3" />
          )}
          <h1 className="flex-1 text-[19px] font-bold truncate px-1">{title}</h1>
          {action}
        </div>
      </header>
      <main className="px-4 pt-4 flex flex-col gap-3">{children}</main>
    </div>
  );
}
