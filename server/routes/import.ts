import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { contacts } from '../db/schema.js';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.js';
import multer from 'multer';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import os from 'os';

const router = Router();

const uploadDir = process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'crm-uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname) ||
      /spreadsheet|excel|csv/.test(file.mimetype);
    if (ok) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non supporté (xlsx, xls, csv uniquement)') as any, false);
    }
  },
});

function safeString(val: any): string {
  if (val === undefined || val === null) return '';
  return String(val).trim();
}

router.post('/excel', authMiddleware, requireRole('admin'), upload.single('file'), async (req: AuthRequest, res: Response) => {
  const filePath = (req as any).file?.path;
  try {
    if (!(req as any).file) {
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

    if (data.length > 20000) {
      res.status(400).json({ error: 'Fichier trop volumineux (max 20 000 lignes)' });
      return;
    }

    const { mapping } = req.body;
    let fieldMapping: Record<string, string> = {};
    if (mapping) {
      try {
        fieldMapping = JSON.parse(mapping);
      } catch {
        res.status(400).json({ error: 'Mapping invalide' });
        return;
      }
    }

    let imported = 0;
    let skipped = 0;
    const assignee = req.user!.userId;

    await db.transaction(async (tx) => {
      for (const row of data as any[]) {
        try {
          const businessName = safeString(row[fieldMapping.businessName || 'business_name'] || row[fieldMapping.businessName || 'Nom du commerce'] || row['business_name'] || row['Nom du commerce']);

          if (!businessName) {
            skipped++;
            continue;
          }

          await tx.insert(contacts).values({
            businessName,
            contactName: safeString(row[fieldMapping.contactName || 'contact_name'] || row[fieldMapping.contactName || 'Nom du contact'] || row['contact_name'] || row['Nom du contact']) || null,
            phone: safeString(row[fieldMapping.phone || 'phone'] || row[fieldMapping.phone || 'Téléphone'] || row['phone'] || row['Téléphone']) || null,
            email: safeString(row[fieldMapping.email || 'email'] || row['email']) || null,
            activity: safeString(row[fieldMapping.activity || 'activity'] || row[fieldMapping.activity || 'Métier'] || row['activity'] || row['Métier']) || null,
            city: safeString(row[fieldMapping.city || 'city'] || row[fieldMapping.city || 'Ville'] || row['city'] || row['Ville']) || null,
            googleRating: row[fieldMapping.googleRating || 'google_rating'] ? Number(row[fieldMapping.googleRating || 'google_rating']) : null,
            googleReviews: row[fieldMapping.googleReviews || 'google_reviews'] ? Number(row[fieldMapping.googleReviews || 'google_reviews']) : null,
            hasSite: safeString(row[fieldMapping.hasSite || 'has_site'] || row['has_site']) || 'pas_de_site',
            siteUrl: safeString(row[fieldMapping.siteUrl || 'site_url'] || row['site_url']) || null,
            siteStatus: safeString(row[fieldMapping.siteStatus || 'site_status'] || row['site_status']) || 'pas_de_site',
            source: 'import_excel',
            stage: 'identifie',
            assignedTo: assignee,
          });
          imported++;
        } catch (e) {
          skipped++;
        }
      }
    });

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

// Batch JSON import (admin only) - for scripted imports of pre-cleaned data.
// Accepts up to 500 contacts per request; each request counts once for rate limiting.
const batchContactSchema = z.object({
  businessName: z.string().min(1).max(200),
  contactName: z.string().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  activity: z.string().max(200).optional().nullable(),
  city: z.string().max(200).optional().nullable(),
  googleRating: z.number().min(0).max(5).optional().nullable(),
  googleReviews: z.number().int().min(0).optional().nullable(),
  hasSite: z.string().max(50).optional().nullable(),
  siteUrl: z.string().max(500).optional().nullable(),
  siteStatus: z.string().max(50).optional().nullable(),
  source: z.string().max(100).optional().nullable(),
  stage: z.string().max(50).optional().nullable(),
  placeId: z.string().max(200).optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  detailUrl: z.string().max(500).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

router.post('/batch', authMiddleware, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { contacts: items, source } = req.body;
    if (!Array.isArray(items) || items.length === 0 || items.length > 500) {
      res.status(400).json({ error: 'contacts doit être un tableau de 1 à 500 éléments' });
      return;
    }

    const assignee = req.user!.userId;
    let imported = 0;
    let skipped = 0;

    await db.transaction(async (tx) => {
      for (const raw of items) {
        const parsed = batchContactSchema.safeParse(raw);
        if (!parsed.success || !parsed.data.businessName.trim()) {
          skipped++;
          continue;
        }
        const c = parsed.data;
        try {
          await tx.insert(contacts).values({
            businessName: c.businessName.trim(),
            contactName: c.contactName?.trim() || null,
            phone: c.phone?.trim() || null,
            email: c.email?.trim() || null,
            activity: c.activity?.trim() || null,
            city: c.city?.trim() || null,
            googleRating: c.googleRating ?? null,
            googleReviews: c.googleReviews ?? null,
            hasSite: c.hasSite || (c.siteUrl ? 'site_fonctionnel' : 'pas_de_site'),
            siteUrl: c.siteUrl?.trim() || null,
            siteStatus: c.siteStatus || (c.siteUrl ? 'site_fonctionnel' : 'pas_de_site'),
            source: c.source || source || 'import_batch',
            stage: c.stage || 'identifie',
            placeId: c.placeId?.trim() || null,
            latitude: c.latitude ?? null,
            longitude: c.longitude ?? null,
            detailUrl: c.detailUrl?.trim() || null,
            notes: c.notes?.trim() || null,
            assignedTo: assignee,
          });
          imported++;
        } catch {
          skipped++;
        }
      }
    });

    res.json({ imported, skipped, total: items.length });
  } catch (error) {
    console.error('Batch import error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'import' });
  }
});

export default router;
