import React, { useState } from 'react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';

export function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [progress, setProgress] = useState(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setResult(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.import.importWithProgress(formData, setProgress);
      setResult(res);
    } catch (err: any) {
      setResult({ error: err.message || 'Erreur lors de l\'import' });
    } finally {
      setImporting(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importer des prospects
          </CardTitle>
          <CardDescription>
            Importez votre fichier Excel ou CSV contenant les prospects à appeler.
            Le fichier doit contenir des colonnes comme : Nom entreprise, Nom contact, Téléphone, Email, Activité, Ville, etc.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
            />
            {file && (
              <p className="mt-2 text-sm text-muted-foreground">
                Fichier sélectionné : <span className="font-medium text-foreground">{file.name}</span>
              </p>
            )}
          </div>

          {importing && (
            <div className="w-full">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Import en cours...</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <Button onClick={handleImport} disabled={!file || importing} className="w-full">
            {importing ? 'Import en cours...' : 'Importer'}
          </Button>

          {result && (
            <div className={`p-4 rounded-lg ${result.error ? 'bg-destructive/10 text-destructive' : 'bg-green-50 text-green-700'}`}>
              {result.error ? (
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  <span>{result.error}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  <span>
                    {result.imported} prospects importés avec succès.
                    {result.errors?.length > 0 && ` ${result.errors.length} erreurs.`}
                  </span>
                </div>
              )}
              {result.errors?.length > 0 && (
                <ul className="mt-2 text-sm list-disc list-inside">
                  {result.errors.slice(0, 5).map((err: string, i: number) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Format attendu</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-2">
            <p>Le fichier doit contenir les colonnes suivantes (les noms de colonnes sont flexibles) :</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li><strong>Nom entreprise</strong> (requis)</li>
              <li><strong>Nom du contact</strong></li>
              <li><strong>Téléphone</strong></li>
              <li><strong>Email</strong></li>
              <li><strong>Activité</strong></li>
              <li><strong>Ville</strong></li>
              <li><strong>Site web</strong> (URL du site actuel)</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
