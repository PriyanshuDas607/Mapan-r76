import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { prisma } from './utils/prisma';
import { generateKeyPairIfNotExists } from './services/signatureService';
import authRouter       from './routes/auth';
import instrumentRouter from './routes/instrument';
import testRouter       from './routes/test';
import verifyRouter     from './routes/verify';
import usersRouter      from './routes/users';
import labsRouter       from './routes/labs';

dotenv.config();

// ─── One-time startup tasks ────────────────────────────────────────────────────
generateKeyPairIfNotExists();

const app = express();

// ─── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// ─── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({ windowMs: 60 * 1000, max: 100 });
app.use(limiter);

// ─── Static file serving — PDFs ───────────────────────────────────────────────
const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads', 'reports');
app.use('/uploads/reports', express.static(UPLOADS_DIR));

// ─── Authenticated API routes ──────────────────────────────────────────────────
app.use('/api/v1/auth',        authRouter);
app.use('/api/v1/instruments', instrumentRouter);
app.use('/api/v1/tests',       testRouter);
app.use('/api/v1/users',       usersRouter);
app.use('/api/v1/labs',        labsRouter);

// ─── Public API routes (no auth required) ─────────────────────────────────────
// QR code verification — accessible without login
app.use('/api/v1/verify', verifyRouter);

// ─── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ success: true, db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ success: false, db: 'disconnected', timestamp: new Date().toISOString() });
  }
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => {
  console.log(`🚀 Legal Metrology Backend — http://localhost:${PORT}`);
  console.log(`🔐 RBAC: 4-tier hierarchy (SUPER_ADMIN → LAB_ADMIN → SUPERVISOR → TEST_ENGINEER)`);
  console.log(`📋 Verify endpoint: http://localhost:${PORT}/api/v1/verify/:reportId`);
  console.log(`❤️  Health check:   http://localhost:${PORT}/health`);
});
