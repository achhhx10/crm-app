import React from 'react';
import { useLocation } from 'react-router-dom';
import { useMotionValueEvent, useScroll } from 'motion/react';
import { Menu } from 'lucide-react';
import { cn } from '../../lib/utils';

const pageTitles: Record<string, string> = {
  '/': 'Tableau de bord',
  '/pipeline': 'Pipeline de vente',
  '/contacts': 'Prospects',
  '/contacts/:id': 'Fiche prospect',
  '/deals': 'Deals',
  '/calls': 'Appels',
  '/referrals': 'Recommandations',
  '/import': 'Import de prospects',
  '/users': 'Gestion des utilisateurs',
  '/settings': 'Paramètres',
};

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const location = useLocation();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = React.useState(false);

  useMotionValueEvent(scrollY, 'change', (y) => {
    setScrolled(y > 8);
  });

  const title = pageTitles[location.pathname] || pageTitles[`/contacts/:id`] || 'CRM';

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-16 items-center border-b px-6 transition-[box-shadow,background-color] duration-300',
        scrolled
          ? 'border-b bg-background/90 shadow-card backdrop-blur supports-[backdrop-filter]:bg-background/70 dark:shadow-card-dark'
          : 'border-transparent bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'
      )}
    >
      <button
        onClick={onMenuClick}
        aria-label="Menu de navigation"
        aria-expanded={false}
        className="mr-3 min-h-[44px] min-w-[44px] rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
    </header>
  );
}