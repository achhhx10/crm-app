import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { RoleBadge } from '../components/ui/status-badges';
import { User, KeyRound } from 'lucide-react';
import { useToast } from '../components/ui/toast';

export function SettingsPage() {
  const { toast } = useToast();
  const [me, setMe] = useState<{ id: number; name: string; email: string; role: string } | null>(null);
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    api.auth.me()
      .then((data: any) => {
        setMe(data);
        setName(data.name || '');
      })
      .catch(() => toast('Impossible de charger le profil', 'error'));
  }, [toast]);

  const syncStoredUser = (patch: Partial<{ name: string; email: string; role: string }>) => {
    try {
      const stored = JSON.parse(localStorage.getItem('crm_user') || '{}');
      localStorage.setItem('crm_user', JSON.stringify({ ...stored, ...patch }));
    } catch {
      /* stored profile is cosmetic */
    }
  };

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me) return;
    setSavingName(true);
    try {
      const updated = await api.auth.updateMe({ name });
      setMe((prev: any) => ({ ...prev, name: updated.name }));
      syncStoredUser({ name: updated.name });
      toast('Profil mis à jour', 'success');
    } catch (err: any) {
      toast(err?.message || 'Erreur lors de la mise à jour', 'error');
    } finally {
      setSavingName(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    if (newPassword.length < 8) {
      setPwdError('Le nouveau mot de passe doit contenir au moins 8 caractères');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('Les deux mots de passe ne correspondent pas');
      return;
    }
    setSavingPwd(true);
    try {
      await api.auth.updateMe({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast('Mot de passe modifié', 'success');
    } catch (err: any) {
      setPwdError(err?.message || 'Erreur lors du changement de mot de passe');
    } finally {
      setSavingPwd(false);
    }
  };

  if (!me) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mon compte</h1>
        <p className="text-sm text-muted-foreground">Modifiez votre profil et votre mot de passe.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <User className="h-4 w-4 text-primary" /> Profil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground shrink-0">Email:</span>
              <span className="font-medium truncate">{me.email}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground shrink-0">Rôle:</span>
              <RoleBadge role={me.role} />
            </div>
          </div>
          <form onSubmit={saveName} className="max-w-md space-y-3">
            <div>
              <label htmlFor="settings-name" className="text-sm font-medium">Nom affiché</label>
              <Input
                id="settings-name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="mt-1"
                placeholder="Votre nom"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={savingName || name === me.name}>
                {savingName ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </form>
          <p className="text-xs text-muted-foreground">
            Votre email est votre identifiant de connexion — seul un administrateur peut le modifier.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <KeyRound className="h-4 w-4 text-primary" /> Mot de passe
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePassword} className="max-w-md space-y-3">
            <div>
              <label htmlFor="settings-pwd-current" className="text-sm font-medium">Mot de passe actuel</label>
              <Input
                id="settings-pwd-current"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="settings-pwd-new" className="text-sm font-medium">Nouveau mot de passe (8 caractères min.)</label>
              <Input
                id="settings-pwd-new"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="settings-pwd-confirm" className="text-sm font-medium">Confirmer le nouveau mot de passe</label>
              <Input
                id="settings-pwd-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="mt-1"
              />
            </div>
            {pwdError && <p className="text-sm text-destructive">{pwdError}</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={savingPwd}>
                {savingPwd ? 'Enregistrement…' : 'Changer le mot de passe'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
