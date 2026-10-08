import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

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
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, veuillez réessayer plus tard' },
});
app.use(globalLimiter);

// Rate limiting - login (stricter)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion, veuillez réessayer dans 15 minutes' },
});
app.use('/api/auth/login', loginLimiter);

app.use(express.json());

// Health check (before auth middleware)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()), version: '1.0.0' });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/calls', callsRoutes);
app.use('/api/deals', dealsRoutes);
app.use('/api/referrals', referralsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/import', importRoutes);

// Serve frontend
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, { maxAge: '1y', immutable: true }));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('*', (_req, res) => {
    res.status(404).json({ error: 'Frontend not built. Run "npm run build" first.' });
  });
}

// Global error handler (must be last)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Erreur serveur interne' });
});

// Process guards
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

app.listen(PORT, () => {
  console.log(`🚀 CRM Server running on http://localhost:${PORT}`);
});
