import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { ArrowLeft, Phone, Mail, MapPin, Star, ExternalLink, Gift } from 'lucide-react';
import { formatDate, formatDateTime, formatDuration, STAGES, CALL_RESULTS, OBJECTIONS } from '../lib/utils';
import type { Contact, Call } from '../types';

interface ReferralItem {
  id: number;
  referredName: string | null;
  referredPhone: string | null;
  status: string | null;
}

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [contact, setContact] = useState<Contact | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [referralsData, setReferralsData] = useState<{ referrals: ReferralItem[]; total: number; signed: number }>({ referrals: [], total: 0, signed: 0 });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    const contactId = Number(id);
    setLoading(true);
    Promise.all([
      api.contacts.get(contactId).catch(() => null),
      api.calls.byContact(contactId).catch(() => []),
      api.referrals.byContact(contactId).catch(() => ({ referrals: [], total: 0, signed: 0 })),
    ]).then(([contactData, callsData, referralsResult]) => {
      if (!contactData) {
        setNotFound(true);
      } else {
        setContact(contactData);
        setCalls(callsData || []);
        setReferralsData(referralsResult || { referrals: [], total: 0, signed: 0 });
      }
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  if (notFound || !contact) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Prospect introuvable</p>
        <Button asChild variant="outline">
          <Link to="/contacts"><ArrowLeft className="h-4 w-4 mr-2" /> Retour aux prospects</Link>
        </Button>
      </div>
    );
  }

  const stageInfo = STAGES[contact.stage || 'identifie'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/contacts"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{contact.businessName}</h1>
          {stageInfo && <Badge className={stageInfo.color}>{stageInfo.label}</Badge>}
        </div>
      </div>

      {/* Contact Info */}
      <Card>
        <CardHeader>
          <CardTitle>Informations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            {contact.contactName && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Contact:</span>
                <span className="font-medium">{contact.contactName}</span>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a href={`tel:${contact.phone}`} className="hover:underline">{contact.phone}</a>
              </div>
            )}
            {contact.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a>
              </div>
            )}
            {contact.activity && (
              <div>
                <span className="text-muted-foreground">Activité:</span>{' '}
                <span>{contact.activity}</span>
              </div>
            )}
            {contact.city && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{contact.city}</span>
              </div>
            )}
            {contact.googleRating && (
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500" />
                <span>{contact.googleRating}</span>
                {contact.googleReviews && <span className="text-muted-foreground">({contact.googleReviews} avis)</span>}
              </div>
            )}
            {contact.hasSite && (
              <div>
                <span className="text-muted-foreground">Site:</span>{' '}
                {contact.hasSite === 'pas_de_site' && <span className="text-red-500">Pas de site</span>}
                {contact.hasSite === 'site_vetuste' && <span className="text-yellow-500">Site vétuste</span>}
                {contact.hasSite === 'site_fonctionnel' && <span className="text-green-500">Site fonctionnel</span>}
                {contact.siteUrl && (
                  <a href={contact.siteUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1">
                    <ExternalLink className="h-3 w-3 inline" />
                  </a>
                )}
              </div>
            )}
            {contact.source && (
              <div>
                <span className="text-muted-foreground">Source:</span>{' '}
                <span>{contact.source}</span>
              </div>
            )}
            {contact.objection && (
              <div>
                <span className="text-muted-foreground">Objection:</span>{' '}
                <span>{OBJECTIONS[contact.objection] || contact.objection}</span>
              </div>
            )}
            {contact.createdAt && (
              <div>
                <span className="text-muted-foreground">Créé le:</span>{' '}
                <span>{formatDate(contact.createdAt)}</span>
              </div>
            )}
          </div>
          {contact.notes && (
            <div className="mt-4 p-3 rounded-lg bg-muted text-sm">
              <span className="text-muted-foreground">Notes:</span> {contact.notes}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Calls History */}
      <Card>
        <CardHeader>
          <CardTitle>Historique des appels</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Résultat</TableHead>
                <TableHead>Durée</TableHead>
                <TableHead>Objection</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.map((call) => (
                <TableRow key={call.id}>
                  <TableCell>{formatDateTime(call.date)}</TableCell>
                  <TableCell>
                    <Badge variant={call.result === 'rdv_obtenu' ? 'default' : call.result === 'interesse' ? 'secondary' : 'outline'}>
                      {CALL_RESULTS[call.result] || call.result}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDuration(call.duration)}</TableCell>
                  <TableCell>{call.objection ? OBJECTIONS[call.objection] || call.objection : '-'}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{call.notes || '-'}</TableCell>
                </TableRow>
              ))}
              {calls.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Aucun appel enregistré
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Referrals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Recommandations
            <Badge variant="secondary" className="ml-2">{referralsData.total}</Badge>
            {referralsData.signed > 0 && (
              <Badge className="bg-green-100 text-green-700 ml-1">{referralsData.signed} signée(s)</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referralsData.referrals.map((ref) => (
                <TableRow key={ref.id}>
                  <TableCell className="font-medium">{ref.referredName || '-'}</TableCell>
                  <TableCell>{ref.referredPhone || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={ref.status === 'convertie' ? 'default' : ref.status === 'en_attente' ? 'secondary' : 'outline'}>
                      {ref.status === 'convertie' ? 'Convertie' : ref.status === 'en_attente' ? 'En attente' : ref.status === 'perdue' ? 'Perdue' : ref.status || '-'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {referralsData.referrals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    Aucune recommandation
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
