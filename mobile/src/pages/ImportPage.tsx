import { useState } from 'react';
import { Page } from '../components/Page';
import { Card } from '../components/ui';

export function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState('');

  async function send() {
    if (!file) return;
    setStatus('Envoi…');
    try {
      const token = localStorage.getItem('crm_token');
      const base = (import.meta.env.VITE_API_URL as string | undefined) || '/api';
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${base}/import/excel`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any).error || 'Erreur');
      setStatus(`Importé : ${data.imported}, ignorés : ${data.skipped} (total ${data.total})`);
    } catch (e: any) {
      setStatus(`Erreur : ${e.message}`);
    }
  }

  return (
    <Page title="Import" back>
      <Card>
        <p className="text-[14px] text-muted-foreground mb-3">Fichier Excel ou CSV (max 10 Mo, 20 000 lignes).</p>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="w-full min-h-[48px] text-[16px]"
        />
        {file && <p className="text-[14px] mt-2 break-all">{file.name}</p>}
        <button
          onClick={send}
          disabled={!file}
          className="mt-3 w-full min-h-[52px] rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
        >
          Importer
        </button>
        {status && <p className="text-[14px] mt-3">{status}</p>}
      </Card>
    </Page>
  );
}
