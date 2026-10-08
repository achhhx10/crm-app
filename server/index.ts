import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import contactsRoutes from './routes/contacts.js';
import callsRoutes from './routes/calls.js';
import dealsRoutes from './routes/deals.js';
import referralsRoutes from './routes/referrals.js';
import dashboardRoutes from './routes/dashboard.js';
import importRoutes from './routes/import.js';
import { dbReady, pool } from './db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Trust the platform reverse proxy (Railway) so req.ip / rate limits are correct.
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// Logging
app.use(morgan('short'));

// CORS
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
}));

// Rate limiting - global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, veuillez réessayer plus tard' },
});
app.use(globalLimiter);

// Rate limiting - login (keyed on IP + email so one office doesn't lock everyone out)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip as string)}:${String((req.body as any)?.email || '').toLowerCase()}`,
  message: { error: 'Trop de tentatives de connexion, veuillez réessayer dans 15 minutes' },
});
app.use('/api/auth/login', loginLimiter);

app.use(express.json({ limit: '1mb' }));

// Health check (before auth middleware)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()), version: '1.1.1' });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/calls', callsRoutes);
app.use('/api/deals', dealsRoutes);
app.use('/api/referrals', referralsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/import', importRoutes);

// Serve frontend (same-origin mode; when the frontend is hosted separately
// e.g. Vercel, dist/ simply isn't present and the API runs standalone)
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  // Long-cache hashed assets, but never index.html / offline.html / manifest.
  app.use(express.static(distPath, {
    index: false,
    maxAge: '1y',
    immutable: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html') || filePath.endsWith('.json')) {
        res.setHeader('Cache-Control', 'no-store');
      }
    },
  }));
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'crm-api' });
  });
}

// JSON 404 for unknown API routes
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Route introuvable' });
});

// Global error handler (must be last)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Erreur serveur interne' });
});

// Process guards: exit so the platform restarts from a clean state.
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

async function start() {
  await dbReady;
  const server = app.listen(PORT, () => {
    console.log(`🚀 CRM Server running on http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    console.log('Shutting down...');
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
