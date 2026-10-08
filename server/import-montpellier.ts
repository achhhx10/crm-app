import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/crm.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

interface ProspectData {
  businessName: string;
  activity: string;
  city: string;
  address: string;
  googleRating: number | null;
  googleReviews: number | null;
  phone: string | null;
  siteUrl: string | null;
}

const prospects: ProspectData[] = [
  { businessName: "Les déménageurs bretons Montpellier - SARL LEVERT", activity: "Services de déménagement et de stockage", city: "Montpellier", address: "6 bis Bd Berthelot", googleRating: 4.3, googleReviews: 59, phone: "04 48 04 34 34", siteUrl: "https://montpellier.demenageurs-bretons.fr/" },
  { businessName: "Rapid Déménagement - Demenageur Montpellier", activity: "Entreprise de déménagement", city: "Montpellier", address: "30 Rue du Mas de Lemasson", googleRating: 5.0, googleReviews: 98, phone: "04 67 47 33 23", siteUrl: "http://www.rapiddemenagement.com/" },
  { businessName: "DEMENAGEMENT Isaia Patrick", activity: "Entreprise de déménagement", city: "Montpellier", address: "18 Rue Ernest Michel", googleRating: null, googleReviews: null, phone: null, siteUrl: null },
  { businessName: "Express Déplacement", activity: "Entreprise de déménagement", city: "Montpellier", address: "14 Rue du Général Maurin", googleRating: 5.0, googleReviews: 99, phone: "07 83 49 30 59", siteUrl: "https://express-deplacement.netlify.app/" },
  { businessName: "Genesis Déménagement", activity: "Entreprise de déménagement", city: "Montpellier", address: "38 Av. de Toulouse", googleRating: 4.9, googleReviews: 62, phone: "04 11 91 86 63", siteUrl: "https://www.genesis-demenagement.fr/" },
  { businessName: "BS Logistique - Déménageur Montpellier Déménagement", activity: "Entreprise de déménagement", city: "Montpellier", address: "772 Rue de las Sorbes", googleRating: 4.9, googleReviews: 96, phone: "06 25 19 68 30", siteUrl: "https://www.facebook.com/BS-Logistique-34-111337213565746/" },
  { businessName: "Deménagement Transmanudem", activity: "Société de transport routier", city: "Montpellier", address: "", googleRating: 4.7, googleReviews: 124, phone: "04 67 06 88 29", siteUrl: "https://transmanudem-montpellier.fr/" },
  { businessName: "Dts 34", activity: "Entreprise de déménagement", city: "Montpellier", address: "9 Rue des Manguiers", googleRating: 5.0, googleReviews: 59, phone: "06 59 09 06 45", siteUrl: "https://www.demenageurs34.fr/" },
  { businessName: "Déménagement Goupil", activity: "Entreprise de déménagement", city: "Montpellier", address: "10 All. Françoise Rosay", googleRating: 4.9, googleReviews: 147, phone: null, siteUrl: "https://www.demenagement-goupil.fr/" },
  { businessName: "Go déménagement", activity: "Services de déménagement et de stockage", city: "Montpellier", address: "", googleRating: 5.0, googleReviews: 76, phone: "06 18 06 46 10", siteUrl: "https://godemenagements.fr/" },
  { businessName: "ADM 34 Déménagement", activity: "Services de déménagement et de stockage", city: "Montpellier", address: "546 Rue André Marie Ampère", googleRating: 4.9, googleReviews: 262, phone: "06 98 74 05 46", siteUrl: "http://www.adm34.fr/" },
  { businessName: "Déménagement Line Express", activity: "Entreprise de déménagement", city: "Montpellier", address: "116 Rue Danton", googleRating: 5.0, googleReviews: 131, phone: "07 60 04 04 47", siteUrl: "http://demenagementlineexpress.fr/" },
  { businessName: "Alliance Services Débarras", activity: "Entreprise de déménagement", city: "Montpellier", address: "9 Rue Dessalle Possel", googleRating: null, googleReviews: null, phone: "06 59 68 13 10", siteUrl: null },
  { businessName: "ADM", activity: "Entreprise de déménagement", city: "Montpellier", address: "10 Bd Ledru Rollin", googleRating: 2.8, googleReviews: 9, phone: null, siteUrl: null },
  { businessName: "TLS FRANCE DEMENAGEMENT - Déménageur Montpellier", activity: "Services de déménagement et de stockage", city: "Montpellier", address: "9 Espl. de l'Europe", googleRating: 4.9, googleReviews: 103, phone: "09 83 80 57 70", siteUrl: "https://tlsfrancedemenagement.com/" },
  { businessName: "D.F.T déménagements Les Gentlemen Du Déménagement", activity: "Entreprise de déménagement", city: "Montpellier", address: "2650 Av. de Maurin", googleRating: 4.4, googleReviews: 108, phone: "04 67 58 11 38", siteUrl: "https://www.demenagementdft.com/" },
  { businessName: "Déménageurs du Soleil", activity: "Entreprise de déménagement", city: "Montpellier", address: "15 Av. de Nîmes", googleRating: 4.9, googleReviews: 12, phone: "04 66 84 54 76", siteUrl: "https://www.demenageurs-du-soleil.fr/" },
  { businessName: "Help déménagement", activity: "Services de déménagement et de stockage", city: "Montpellier", address: "15 Rue du Carignan", googleRating: 5.0, googleReviews: 102, phone: "06 67 05 36 68", siteUrl: "http://www.helpdemenagement.com/" },
  { businessName: "OCCITANIE DÉMÉNAGEMENT - Déménageur Montpellier", activity: "Entreprise de déménagement", city: "Montpellier", address: "48 Rue Claude Balbastre", googleRating: 4.9, googleReviews: 37, phone: "04 11 93 90 26", siteUrl: "https://occitanie-demenagement.fr/" },
  { businessName: "AS Déménagement Montpellier", activity: "Services de déménagement et de stockage", city: "Montpellier", address: "654 Av. Georges Frêche", googleRating: 4.9, googleReviews: 180, phone: "04 67 92 85 37", siteUrl: "http://www.as-demenagement.fr/" },
  { businessName: "Les Déménagements Cullell", activity: "Services de déménagement et de stockage", city: "Montpellier", address: "5 Rue de la garrigue", googleRating: 4.9, googleReviews: 139, phone: "04 67 10 01 89", siteUrl: "https://www.demenagementmontpellier.com/" },
  { businessName: "Ac Coursing Déménagement", activity: "Entreprise de déménagement", city: "Montpellier", address: "48 Rue Claude Balbastre", googleRating: 5.0, googleReviews: 226, phone: "07 51 24 90 26", siteUrl: "https://ac-coursing.fr/" },
  { businessName: "Exel demenagement", activity: "Entreprise de déménagement", city: "Montpellier", address: "20 Rue Louis Braille", googleRating: 5.0, googleReviews: 12, phone: "06 11 95 86 97", siteUrl: "https://exceldemenagement.fr/" },
  { businessName: "DLT DEMENAGEMENT", activity: "Services de déménagement et de stockage", city: "Montpellier", address: "286 Rue de Leyde", googleRating: 5.0, googleReviews: 110, phone: "07 55 32 01 89", siteUrl: "https://dltdemenagement.com/" },
  { businessName: "Max Transports", activity: "Entreprise de déménagement", city: "Montpellier", address: "48 Rue Claude Balbastre", googleRating: 4.9, googleReviews: 244, phone: "06 62 59 00 87", siteUrl: "http://www.maxtransports.com/" },
  { businessName: "Amtd", activity: "Entreprise de déménagement", city: "Montpellier", address: "21 Pass. Soixante Quinze", googleRating: null, googleReviews: null, phone: null, siteUrl: null },
  { businessName: "Mon Déménageur Montpellier", activity: "Services de déménagement et de stockage", city: "Montpellier", address: "79 Av. Clément Ader", googleRating: 5.0, googleReviews: 165, phone: "06 51 51 04 37", siteUrl: "https://mondemenageur.net/" },
  { businessName: "Mistral Déménagement", activity: "Entreprise de déménagement", city: "Montpellier", address: "150 Av. de Heidelberg", googleRating: 5.0, googleReviews: 12, phone: "06 62 10 59 97", siteUrl: "https://mistral-demenagement.com/" },
  { businessName: "Débarras Montpellier", activity: "Entreprise de déménagement", city: "Montpellier", address: "", googleRating: 5.0, googleReviews: 4, phone: "06 79 74 56 19", siteUrl: null },
  { businessName: "DÉMÉTRANS Montpellier", activity: "Entreprise de déménagement", city: "Montpellier", address: "48 Rue Claude Balbastre", googleRating: 5.0, googleReviews: 55, phone: "07 63 74 93 94", siteUrl: "https://www.demetrans.fr/" },
  { businessName: "EDS - Entreprise Déménagement Services", activity: "Services de déménagement et de stockage", city: "Montpellier", address: "740 Av. des Apothicaires", googleRating: 4.9, googleReviews: 80, phone: "06 03 31 71 01", siteUrl: "https://eds-demenagement.fr/" },
  { businessName: "Csa Déménagement 34", activity: "Services de déménagement et de stockage", city: "Montpellier", address: "387 Rue du Moulin des 7 Cans", googleRating: 5.0, googleReviews: 5, phone: "07 80 04 09 61", siteUrl: "https://csademenagement34.wixsite.com/csa-d" },
  { businessName: "DEMENAGEMENT bucha", activity: "Entreprise de déménagement", city: "Montpellier", address: "24 Av. du Pont Juvénal", googleRating: null, googleReviews: null, phone: null, siteUrl: null },
  { businessName: "K.n.m Transport", activity: "Société de transport routier", city: "Montpellier", address: "3 Rue Brueys", googleRating: null, googleReviews: null, phone: null, siteUrl: null },
  { businessName: "Transport Sud De France", activity: "Transporteur de véhicules", city: "Montpellier", address: "6B Bureau3, Bd Berthelot", googleRating: 5.0, googleReviews: 6, phone: "06 03 82 70 49", siteUrl: "https://transportsuddefrance.fr/" },
  { businessName: "BOXOR DÉMÉNAGEMENT", activity: "Services de déménagement et de stockage", city: "Montpellier", address: "", googleRating: 5.0, googleReviews: 1, phone: "06 38 02 52 27", siteUrl: "https://boxor.square.site/" },
  { businessName: "Arnal Bazille - Déménageur Montpellier", activity: "Services de déménagement et de stockage", city: "Montpellier", address: "", googleRating: 4.9, googleReviews: 430, phone: "04 67 65 31 30", siteUrl: "http://www.arnalbazillebox.com/" },
  { businessName: "Transtech Fineart", activity: "Services de déménagement et de stockage", city: "Montpellier", address: "20 Av. du Pont Juvénal", googleRating: null, googleReviews: null, phone: null, siteUrl: "http://www.transtech-fineart.com/" },
  { businessName: "Move home", activity: "Entreprise de déménagement", city: "Montpellier", address: "9 Rue Plagne", googleRating: null, googleReviews: null, phone: null, siteUrl: null },
  { businessName: "Elites Déménagement", activity: "Entreprise de déménagement", city: "Montpellier", address: "450 Rue Baden Powell", googleRating: 5.0, googleReviews: 2, phone: "06 85 18 80 89", siteUrl: "https://www.elitesdemenagement.com/" },
  { businessName: "T.M.E Transport Meubles Electroménager", activity: "Société de transport routier", city: "Montpellier", address: "809 Rue Favre de Saint-Castor", googleRating: 2.4, googleReviews: 33, phone: null, siteUrl: null },
  { businessName: "Mory Ducros", activity: "Société de transport routier", city: "Montpellier", address: "34 Rue du Mas Saint-Pierre", googleRating: 1.0, googleReviews: 2, phone: null, siteUrl: null },
  { businessName: "DMAX MONTPELLIER (CASTELNAU-LE-LEZ)", activity: "Services de déménagement et de stockage", city: "Montpellier", address: "", googleRating: 4.2, googleReviews: 41, phone: "04 67 55 06 68", siteUrl: "https://www.dmax.fr/implantation/agence-dmax-montpellier/" },
  { businessName: "GALANDEM TRANSPORT ROBERT MONTPELLIER", activity: "Entreprise de déménagement", city: "Montpellier", address: "", googleRating: 5.0, googleReviews: 105, phone: "07 60 77 04 04", siteUrl: "https://www.societemontpellierdemenagement.fr/" },
  { businessName: "Stockeco", activity: "Garde-meubles en libre-service", city: "Montpellier", address: "182 Rue de la Font de la Banquière", googleRating: 5.0, googleReviews: 14, phone: "06 12 06 62 68", siteUrl: "https://stockeco.fr/" },
  { businessName: "Ma Livraison", activity: "Société de transport routier", city: "Montpellier", address: "7 Rue Ferdinand Fabre", googleRating: 4.0, googleReviews: 1, phone: "0 899 49 10 09", siteUrl: null },
  { businessName: "Déménagement La Languedocienne", activity: "Entreprise de déménagement", city: "Montpellier", address: "34 Avenue Clément Ader", googleRating: 5.0, googleReviews: 2, phone: "04 67 06 88 28", siteUrl: "https://transmanudem-montpellier.fr/" },
  { businessName: "Pcs Durand & Associes", activity: "Entreprise de déménagement", city: "Montpellier", address: "261 Rue Simone Signoret", googleRating: null, googleReviews: null, phone: null, siteUrl: null },
  { businessName: "Transportitou", activity: "Service de débarras de maison", city: "Montpellier", address: "", googleRating: 5.0, googleReviews: 3, phone: "06 89 75 03 05", siteUrl: "http://www.transportitou.com/" },
  { businessName: "OZ Transport Vehicule SVR", activity: "Société de transport routier", city: "Montpellier", address: "2310 Bd Paul Valéry", googleRating: null, googleReviews: null, phone: null, siteUrl: null },
  { businessName: "Livvite", activity: "Société de transport routier", city: "Montpellier", address: "23 Av. Saint-Lazare", googleRating: null, googleReviews: null, phone: null, siteUrl: null },
  { businessName: "Aubert Matthieu", activity: "Entreprise de déménagement", city: "Montpellier", address: "28 Av. Georges Clemenceau", googleRating: null, googleReviews: null, phone: null, siteUrl: null },
  { businessName: "TOPDEM-LOCAKIM déménagement", activity: "Services de déménagement et de stockage", city: "Montpellier", address: "48 Rue Claude Balbastre", googleRating: null, googleReviews: null, phone: "07 53 14 28 59", siteUrl: null },
  { businessName: "Déménagements SIAD", activity: "Services de déménagement et de stockage", city: "Montpellier", address: "1025 rue Henri Becquerel, 10 Parc Club du Millénaire", googleRating: null, googleReviews: null, phone: "04 67 20 41 30", siteUrl: "http://demenagementsiad.site-solocal.com/" },
  { businessName: "David Transport", activity: "Service de livraison", city: "Montpellier", address: "", googleRating: 3.6, googleReviews: 85, phone: "04 99 51 25 45", siteUrl: null },
  { businessName: "OMC Déménagement Transport", activity: "Services de déménagement et de stockage", city: "Montpellier", address: "3 Rue des Escalettes", googleRating: 4.7, googleReviews: 66, phone: "04 67 85 01 06", siteUrl: "http://www.demenagement-france.com/" },
  { businessName: "Demenagements Del sol", activity: "Entreprise de déménagement", city: "Montpellier", address: "106 Av. du Puech de Massane", googleRating: null, googleReviews: null, phone: null, siteUrl: null },
  { businessName: "Transports Brel", activity: "Société de transport routier", city: "Montpellier", address: "", googleRating: 4.4, googleReviews: 41, phone: "04 67 42 55 56", siteUrl: "http://www.transports-brel.fr/" },
  { businessName: "DEMENAGEMENT Isaia Patrick", activity: "Entreprise de déménagement", city: "Montpellier", address: "18 Rue Ernest Michel", googleRating: null, googleReviews: null, phone: null, siteUrl: null },
  { businessName: "Demenagements Del sol", activity: "Entreprise de déménagement", city: "Montpellier", address: "106 Av. du Puech de Massane", googleRating: null, googleReviews: null, phone: null, siteUrl: null },
  { businessName: "Transports Brel", activity: "Société de transport routier", city: "Montpellier", address: "", googleRating: 4.4, googleReviews: 41, phone: "04 67 42 55 56", siteUrl: "http://www.transports-brel.fr/" },
];

function hasSite(url: string | null): string {
  return url ? "site_fonctionnel" : "pas_de_site";
}

function cleanPhone(phone: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\s+/g, ' ').trim();
  return cleaned === "" ? null : cleaned;
}

function importProspects() {
  console.log("🚀 Import des prospects déménageurs Montpellier...");
  
  const insert = db.prepare(`
    INSERT INTO contacts (business_name, contact_name, phone, email, activity, city, google_rating, google_reviews, has_site, site_url, site_status, source, stage, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let imported = 0;
  let skipped = 0;
  const now = Math.floor(Date.now() / 1000);

  for (const p of prospects) {
    try {
      const existing = db.prepare("SELECT id FROM contacts WHERE business_name = ?").get(p.businessName);
      if (existing) {
        console.log(`⏭️  Doublon ignoré: ${p.businessName}`);
        skipped++;
        continue;
      }

      insert.run(
        p.businessName,
        null,
        cleanPhone(p.phone),
        null,
        p.activity,
        p.city,
        p.googleRating,
        p.googleReviews,
        hasSite(p.siteUrl),
        p.siteUrl,
        hasSite(p.siteUrl),
        "google_maps",
        "identifie",
        now,
        now
      );
      console.log(`✅ Importé: ${p.businessName}`);
      imported++;
    } catch (e: any) {
      console.error(`❌ Erreur pour ${p.businessName}:`, e.message);
      skipped++;
    }
  }

  console.log(`\n📊 Résumé:`);
  console.log(`   Total: ${prospects.length}`);
  console.log(`   Importés: ${imported}`);
  console.log(`   Ignorés (doublons/erreurs): ${skipped}`);
}

importProspects();
db.close();