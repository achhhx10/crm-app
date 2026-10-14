// Language detection for business leads.
// Ordered by decreasing trust: legal form in the name, vocabulary in the name,
// linguistic majority of the city, then the language of the public website.
//
// None of these is a statement about the person who answers the phone: it is the
// language the business chose to publish. Treat "language" as a hint for the
// caller's script, not as a fact.

const DE_FORM = /\b(GmbH|mbH|KG|OHG|UG|CmbA|KGaA)\b/;
const DE_AG = /(?:^|[\s&)(".,])AG(?:$|[\s,&.)("])/;
const FR_FORM = /\b(Sàrl|Sarl|SARL|EURL|SAS|SCA)\b/;
const IT_FORM = /\b(SpA|S\.p\.A\.|S\.r\.l\.|Srl)\b/;

const DE_WORDS = /\b(Schreinerei|Bäckerei|Metallbau|Elektro|Kies|Maler|Dachdecker|Gartenbau|Immobilien|Treppenbau|Sanitär|Zimmerei|Optik|Uhren|Schmuck|Blumen|Metzgerei|Schlosserei|Steuerberatung|Rechtsanwalt|notariat|Arztpraxis|Zahnarzt|Apotheke|Bauunternehmen|Spenglerei|Holzbau|Tiefbau|Druckerei|Verlag|Physiotherapie|Möbel|Kosmetik|Friseur|Reisebüro|Versicherung|Unternehmen|Handels|Industrie|Dienstleistung)\b/i;
const FR_WORDS = /\b(Plomberie|Charpente|Boulangerie|Peinture|Électricité|Maçonnerie|Jardins|Immobilier|Conseil|Notaire|Pharmacie|Pizzeria|Boucherie|Serrurerie|Régie|Coiffure|Optique|Transport|Assurance|Entreprise|Garage|Restaurant|Travaux|Architecture|Rénovation|Crèmerie|Bouchon|Cuisine|Épicerie|Banque|Cabinet|Médecin|Dentiste|Clinique|Institut|Artisans|Services)\b/i;

export const DE_CITIES = new Set([
  'Basel', 'Zürich', 'Winterthur', 'Luzern', 'St. Gallen', 'Zug', 'Schaffhausen', 'Thun',
  'Schwyz', 'Kloten', 'Dietikon', 'Wetzikon', 'Rapperswil', 'Bülach', 'Frauenfeld',
  'Kreuzlingen', 'Wil', 'Baar', 'Zollikon', 'Münsterlingen', 'Volketswil',
]);
export const FR_CITIES = new Set([
  'Genève', 'Lausanne', 'Neuchâtel', 'Yverdon-les-Bains', 'Fribourg', 'Sion', 'Montreux',
  'Nyon', 'Vevey', 'Morges', 'Delémont', 'Porrentruy', 'Moutier', 'Payerne', 'Aigle',
  'Martigny', 'Monthey', 'Carouge', 'Onex', 'Lancy', 'Meyrin',
]);
export const IT_CITIES = new Set([
  'Lugano', 'Locarno', 'Bellinzona', 'Mendrisio', 'Chiasso', 'Massagno', 'Ascona',
]);
// Officially bilingual; German is the working default in most cases but this is a guess.
export const BILINGUAL_CITIES = new Set([
  'Bern', 'Biel', 'Biel/Bienne', 'Fribourg', 'Chur', 'Brugg', 'Liestal',
]);

/**
 * Classify from the stored columns only.
 * @returns {{language: string, source: string}|null}
 */
export function detectFromFields(businessName, city) {
  const n = businessName || '';

  if (DE_FORM.test(n) || DE_AG.test(n)) return { language: 'de', source: 'legal_form' };
  if (FR_FORM.test(n)) return { language: 'fr', source: 'legal_form' };
  if (IT_FORM.test(n)) return { language: 'it', source: 'legal_form' };

  if (DE_WORDS.test(n)) return { language: 'de', source: 'vocabulary' };
  if (FR_WORDS.test(n)) return { language: 'fr', source: 'vocabulary' };

  if (city && DE_CITIES.has(city)) return { language: 'de', source: 'city' };
  if (city && FR_CITIES.has(city)) return { language: 'fr', source: 'city' };
  if (city && IT_CITIES.has(city)) return { language: 'it', source: 'city' };
  if (city && BILINGUAL_CITIES.has(city)) return { language: 'de', source: 'city' };

  return null;
}

const STOP = {
  de: 'der die das und ist von zu den mit sich auf für nicht auch werden oder eine einer einem im ein des als'.split(' '),
  fr: 'le la les et est de des du un une dans pour que qui sur avec pas plus au aux ce cette nous vous ils elles'.split(' '),
  en: 'the of and to in for is are with that this on it as at by be from or an your our we you'.split(' '),
  it: 'il la le e di che per con non una sono del della nel alla gli'.split(' '),
};

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classify from a fetched page. Trusts a declared lang first, falls back to a
 * stop-word ratio over visible text.
 * @returns {{language: string, source: string}|null}
 */
export function detectFromHtml(html, url) {
  if (!html) return null;

  // 1. declared language, most trustworthy signal a page offers
  const langAttr = /<html[^>]*\blang\s*=\s*["']?\s*([a-zA-Z-]{2,5})/i.exec(html);
  const ogLocale = /property\s*=\s*["']og:locale["'][^>]*content\s*=\s*["']([a-zA-Z-]{2,5})/i.exec(html);
  const declared = (langAttr?.[1] || ogLocale?.[1] || '').toLowerCase();
  const base = declared.split(/[-_]/)[0];
  if (['de', 'fr', 'it', 'en'].includes(base)) return { language: base, source: 'website' };

  // 2. stop-word ratio on visible text
  const text = stripHtml(html);
  if (text.length < 200) return null;
  const words = text.toLowerCase().match(/[a-zà-ÿäöüß']+/g);
  if (!words || words.length < 50) return null;

  const set = new Set(words);
  const scores = {};
  for (const [lang, list] of Object.entries(STOP)) {
    let hit = 0;
    for (const w of list) if (set.has(w)) hit++;
    scores[lang] = hit / list.length;
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topLang, topScore] = ranked[0];
  const [secondLang, secondScore] = ranked[1];
  // Require a clear margin, otherwise the page is inconclusive.
  if (topScore < 0.25 || topScore < secondScore * 1.35) return null;
  return { language: topLang, source: 'website', confidence: +(topScore).toFixed(2) };
}

/** Best-effort absolute URL from a possibly scheme-less stored value. */
export function normalizeUrl(u) {
  if (!u) return null;
  let s = u.trim();
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  try {
    const parsed = new URL(s);
    if (!parsed.hostname.includes('.')) return null;
    return parsed;
  } catch {
    return null;
  }
}