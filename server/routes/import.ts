import { Router } from 'express';
import { db } from '../db/index.js';
import { contacts } from '../db/schema.js';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.js';
import multer from 'multer';
import * as XLSX from 'xlsx';
import fs from 'fs';

const router = Router();
const upload = multer({ dest: '/tmp/uploads/' });

function safeString(val: any): string {
  if (val === undefined || val === null) return '';
  return String(val).trim();
}

router.post('/excel', authMiddleware, requireRole('admin'), upload.single('file'), (req: AuthRequest, res: Response) => {
  const filePath = req.file?.path;
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Aucun fichier fourni' });
      return;
    }

    const workbook = XLSX.readFile(filePath!);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      res.status(400).json({ error: 'Le fichier est vide' });
      return;
    }

    const { mapping } = req.body;
    const fieldMapping = mapping ? JSON.parse(mapping) : {};

    let imported = 0;
    let skipped = 0;

    const insertMany = db.transaction((rows: any[]) => {
      for (const row of rows) {
        try {
          const businessName = safeString(row[fieldMapping.businessName || 'business_name'] || row[fieldMapping.businessName || 'Nom du commerce'] || row['business_name'] || row['Nom du commerce']);

          if (!businessName) {
            skipped++;
            continue;
          }

          db.insert(contacts).values({
            businessName,
            contactName: safeString(row[fieldMapping.contactName || 'contact_name'] || row[fieldMapping.contactName || 'Nom du contact'] || row['contact_name'] || row['Nom du contact']) || null,
            phone: safeString(row[fieldMapping.phone || 'phone'] || row[fieldMapping.phone || 'Téléphone'] || row['phone'] || row['Téléphone']) || null,
            email: safeString(row[fieldMapping.email || 'email'] || row['email']) || null,
            activity: safeString(row[fieldMapping.activity || 'activity'] || row[fieldMapping.activity || 'Métier'] || row['activity'] || row['Métier']) || null,
            city: safeString(row[fieldMapping.city || 'city'] || row[fieldMapping.city || 'Ville'] || row['city'] || row['Ville']) || null,
            googleRating: row[fieldMapping.googleRating || 'google_rating'] ? Number(row[fieldMapping.googleRating || 'google_rating']) : null,
            googleReviews: row[fieldMapping.googleReviews || 'google_reviews'] ? Number(row[fieldMapping.googleReviews || 'google_reviews']) : null,
            hasSite: safeString(row[fieldMapping.hasSite || 'has_site'] || row['has_site']) || 'non',
            siteUrl: safeString(row[fieldMapping.siteUrl || 'site_url'] || row['site_url']) || null,
            siteStatus: safeString(row[fieldMapping.siteStatus || 'site_status'] || row['site_status']) || 'pas_de_site',
            source: 'import_excel',
            stage: 'identifie',
            assignedTo: req.user!.userId,
          }).run();
          imported++;
        } catch (e) {
          skipped++;
        }
      }
    });

    insertMany(data);

    res.json({ imported, skipped, total: data.length });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'import' });
  } finally {
    if (filePath) {
      fs.unlink(filePath, () => {});
    }
  }
});

export default router;
