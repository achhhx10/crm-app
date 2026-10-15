import React, { useEffect, useId, useRef, useState } from 'react';
import { api } from '../../lib/api';

export interface PickedContact {
  id: number;
  businessName: string | null;
  contactName: string | null;
  city: string | null;
}

interface ContactPickerProps {
  value: PickedContact | null;
  onChange: (contact: PickedContact | null) => void;
  placeholder?: string;
  required?: boolean;
  id?: string;
}

/**
 * Searches contacts server-side. The previous <select> was capped by the API at
 * 500 rows, which made most of the 39k database unreachable and rendered
 * unknown deals as "#12345".
 */
export function ContactPicker({
  value,
  onChange,
  placeholder = 'Rechercher un prospect…',
  required,
  id,
}: ContactPickerProps) {
  const reactId = useId();
  const inputId = id || `contact-picker-${reactId}`;
  const listId = `${inputId}-list`;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickedContact[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const skipNextSearch = useRef(false);

  useEffect(() => {
    if (value) setQuery(`${value.businessName || value.contactName || ''}${value.city ? ` — ${value.city}` : ''}`);
  }, [value]);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const { contacts } = await api.contacts.list({ search: term, limit: '8' });
        setResults(contacts || []);
        setHighlight(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const select = (contact: PickedContact) => {
    skipNextSearch.current = true;
    onChange(contact);
    setQuery(`${contact.businessName || contact.contactName || ''}${contact.city ? ` — ${contact.city}` : ''}`);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      setHighlight(h => Math.min(h + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (event.key === 'Enter' && open && results[highlight]) {
      event.preventDefault();
      select(results[highlight]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const clear = () => {
    skipNextSearch.current = true;
    onChange(null);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-required={required}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        placeholder={placeholder}
        value={query}
        required={required}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (!e.target.value.trim()) onChange(null); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label="Effacer le prospect sélectionné"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Effacer
        </button>
      )}
      {open && query.trim().length >= 2 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md"
        >
          {loading && results.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">Recherche…</li>
          )}
          {!loading && results.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">Aucun prospect trouvé</li>
          )}
          {results.map((contact, index) => (
            <li
              key={contact.id}
              role="option"
              aria-selected={index === highlight}
              onMouseDown={(e) => { e.preventDefault(); select(contact); }}
              onMouseEnter={() => setHighlight(index)}
              className={`cursor-pointer px-3 py-2 text-sm ${index === highlight ? 'bg-muted' : ''}`}
            >
              <span className="font-medium">{contact.businessName || contact.contactName || `#${contact.id}`}</span>
              {contact.city && <span className="ml-2 text-muted-foreground">{contact.city}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
