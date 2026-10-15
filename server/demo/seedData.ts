/**
 * Demo dataset for validating the reporting layer.
 *
 * Lives under server/ so the HTTP seed endpoint can import it: src/ is excluded
 * from the Railway build, so nothing on the server may depend on it.
 *
 * Dates are anchored to "now" rather than fixed. Hardcoded dates drift: a dataset
 * pinned to a past month eventually shows zero trends, which is precisely the
 * thing it exists to prove.
 */

/** Days before today. `daysAgo(0)` is today. */
export function daysAgo(days: number, hour = 9): Date {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

export const SOURCE_LABELS: Record<string, string> = {
  google_maps: 'Google Maps',
  internet: 'Internet',
  bouche_a_oreille: 'Bouche-à-oreille',
  linkedin: 'LinkedIn',
  appel: 'Appel',
  autre: 'Autre',
  inconnu: 'Non renseigné',
};

/** [name, person, activity, phone, city, hasSite, stage, source, rating, reviews] */
export const CONTACTS: (string | number | null)[][] = [
  ['Boulangerie Marten',     'Marten',     'boulangerie', '+41 32 123 45 67', 'Delémont', 'pas_de_site',     'identifie',         'internet',         4.8, 52],
  ['Café du Marché',          'Aebischer',  'café',       '+41 32 987 65 43', 'Bienne',   'site_fonctionnel', 'interesse',        'google_maps',      4.6, 88],
  ['Garage Zenetti',          null,         'garage',     '+41 79 555 12 34', 'La Chaux', 'pas_de_site',     'contacte',          'bouche_a_oreille', 4.2, 17],
  ['Atelier Pugin SAS',       'Pugin',      'menuiserie', '+41 26 322 11 09', 'Fribourg', 'site_fonctionnel', 'rdv_programme',    'linkedin',         4.9, 134],
  ['Fromagerie Rieder',       'Rieder',     'fromagerie', '+41 27 721 45 60', 'Sion',     'pas_de_site',     'proposition_envoyee', 'internet',      4.4, 23],
  ['Imprimerie Vonarb',       null,         'imprimerie', '+41 24 427 80 15', 'Sierre',   'site_vetuste',     'perdu',            'appel',            3.4, 6],
  ['Transports Dunand',       'Dunand',     'transport',  '+41 21 711 22 33', 'Lausanne', 'pas_de_site',     'signe',            'google_maps',      4.7, 61],
  ['Cave de Pfister',         'Pfister',    'vins',       '+41 27 771 09 88', 'Sion',     'site_fonctionnel', 'interesse',        'bouche_a_oreille', 4.5, 44],
  ['Boucherie Nicolet',       'Nicolet',    'boucherie',  '+41 32 723 44 21', 'Neuchâtel', 'pas_de_site',     'contacte',          'internet',         4.3, 29],
  ['Plomberie Absolute',      'Absolute',   'plomberie',  '+41 79 888 77 66', 'Sierre',   'pas_de_site',     'identifie',         'appel',            4.1, 11],
];

/**
 * [contactIndex, daysAgo, result, objection|null, notes, nextStep|null, nextStepInDays|null]
 * nextStepInDays is relative to the call: negative means the callback is already
 * overdue, which is what populates the "À relancer" page.
 */
export const CALLS: (string | number | null)[][] = [
  [0, 58, 'pas_decroche',  null,              'Pas de réponse', null, null],
  [0, 48, 'messagerie',    null,              'Message vocal', null, null],
  [0, 38, 'pas_decroche',  null,              'Toujours injoignable', null, null],
  [0, 20, 'pas_decroche',  null,              'Relance 2', null, null],
  [1, 55, 'rdv_obtenu',    null,              'Rendez-vous fixé', null, null],
  [1, 41, 'interesse',     'trop_cher',      'Budget serré cette année', 'Relancer après devis', 3],
  [1, 19, 'pas_decroche',  null,              'Relance 2', null, null],
  [2, 52, 'pas_interesse', 'pas_de_temps',    'Pas le temps de refaire le site', null, null],
  [2, 30, 'pas_decroche',  null,              'Aucune réponse', null, null],
  [3, 47, 'rdv_obtenu',    null,              'Rendez-vous obtenu', null, null],
  [3, 28, 'interesse',     null,              'Devis vitrine transmis', null, null],
  [4, 44, 'interesse',     'trop_cher',      'Compare trois devis', null, null],
  [4, 17, 'interesse',     'faut_en_parler', 'Doit valider avec le comptable', 'Relancer le comptable', -2],
  [5, 39, 'pas_interesse', 'autre',          'Réponse trop évasive', null, null],
  [6, 36, 'rdv_obtenu',    null,              'Signature validé', null, null],
  [6,  6, 'interesse',     null,              'Contrat en signature', null, null],
  [7, 35, 'interesse',     'trop_cher',      'Intéressé par le multilingue', null, null],
  [7, 15, 'pas_decroche',  null,              'Pas de réponse', null, null],
  [8, 33, 'pas_interesse', 'pas_de_temps',    'En cours de modernisation', 'Rappeler dans 2 mois', 45],
  [8,  8, 'pas_decroche',  null,              'Relance 2', null, null],
  [9, 31, 'pas_decroche',  null,              'Pas de réponse', null, null],
  [9, 12, 'pas_decroche',  null,              'Relance 2', null, null],
  [2, 11, 'pas_decroche',  null,              'Relance 2', null, null],
  [1,  9, 'pas_decroche',  null,              'Relance 3', null, null],
  [4, 10, 'interesse',     'deja_equippe',   'Va faire son site l\'an prochain', null, null],
];

/** [contactIndex, daysAgoCreated, amount, status, siteType, daysAgoSigned|null] */
export const DEALS: (string | number | null)[][] = [
  [7, 34, 5400, 'signe',     'sur_mesure',       31],
  [3, 26, 4200, 'signe',     'vitrine_simple',   22],
  [6, 18, 6800, 'signe',     'vitrine_complete',  4],
  [1, 14, 3200, 'en_cours',  'vitrine_simple',   null],
  [4,  9, 9500, 'en_cours',  'ecommerce',        null],
  [7,  7, 3900, 'en_cours',  'vitrine_complete', null],
  [5, 29, 2100, 'perdu',     'vitrine_simple',   null],
];

/** Marks demo rows so they can be told apart from real ones and undone exactly. */
export const DEMO_SOURCE = 'demo';