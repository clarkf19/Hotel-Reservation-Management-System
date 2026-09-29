import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { getSettings } from './lib/settings.js';
import { errorHandler, notFoundHandler, traceContext } from './middleware/common.js';
import authRoutes from './routes/auth.routes.js';
import reservationRoutes from './routes/reservation.routes.js';
import guestRoutes from './routes/guest.routes.js';
import staffRoutes from './routes/staff.routes.js';
import { llmAvailable } from './integrations/AIConciergeService.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: [env.clientOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'], exposedHeaders: ['Content-Disposition'] }));
  app.use(express.json({ limit: '200kb' }));
  if (!env.isTest) app.use(morgan('dev'));
  app.use(traceContext);

  app.get('/api/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', service: 'HRMS API', time: new Date().toISOString() });
  });

  /** Public hotel information (SE-2: browsing without login) */
  app.get('/api/public/info', async (_req, res) => {
    const s = await getSettings();
    res.json({ hotelName: s.hotelName, checkInTime: s.checkInTime, checkOutTime: s.checkOutTime, baseCurrency: s.baseCurrency, taxRatePercent: s.taxRatePercent, freeCancellationHours: s.freeCancellationHours, paymentHoldMinutes: s.paymentHoldMinutes, conciergeMode: llmAvailable() ? 'LLM' : 'KNOWLEDGE_BASE' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api', reservationRoutes);
  app.use('/api', staffRoutes);
  app.use('/api', guestRoutes);
  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
