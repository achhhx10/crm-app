import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { Button, Input, Field } from '../components/ui';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.auth.login(email.trim(), password);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col justify-center px-6 pb-16">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <span className="flex items-center justify-center h-12 w-12 rounded-2xl bg-primary text-primary-foreground text-[22px] font-extrabold shadow-[0_4px_16px_-2px_hsl(var(--primary)/0.6)]">
            C
          </span>
          <div>
            <h1 className="text-[24px] font-extrabold leading-[1.1]">CRM Mobile</h1>
            <p className="text-muted-foreground text-sm">Prospection terrain</p>
          </div>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Email professionnel">
            <Input type="email" required autoComplete="email" value={email} onChange={(e: any) => setEmail(e.target.value)} placeholder="vous@entreprise.com" />
          </Field>
          <Field label="Mot de passe">
            <Input type="password" required autoComplete="current-password" value={password} onChange={(e: any) => setPassword(e.target.value)} placeholder="••••••••" />
          </Field>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button type="submit" disabled={loading} className="mt-1">
            {loading && <Loader2 size={20} className="animate-spin" />}
            Se connecter
          </Button>
        </form>
      </div>
    </div>
  );
}
