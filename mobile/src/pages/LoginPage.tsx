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
    <div className="min-h-dvh flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <h1 className="text-[28px] font-bold text-center">CRM Mobile</h1>
        <p className="text-center text-muted-foreground mt-1 mb-6">Connectez-vous pour continuer</p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Email">
            <Input type="email" required autoComplete="email" value={email} onChange={(e: any) => setEmail(e.target.value)} placeholder="vous@entreprise.com" />
          </Field>
          <Field label="Mot de passe">
            <Input type="password" required autoComplete="current-password" value={password} onChange={(e: any) => setPassword(e.target.value)} placeholder="••••••••" />
          </Field>
          {error && <p className="text-destructive text-[14px]">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 size={20} className="animate-spin" />}
            Se connecter
          </Button>
        </form>
      </div>
    </div>
  );
}
