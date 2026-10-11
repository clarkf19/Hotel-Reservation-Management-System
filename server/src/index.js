import { env } from './config/env.js';
import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { startScheduler, stopScheduler } from './jobs/scheduler.js';
import { razorpayGateway } from './integrations/RazorpayGateway.js';

const app = createApp();

try {
  await prisma.$connect();
} catch (err) {
  console.error('\n[server] Cannot reach PostgreSQL. Start it first:  cd database && npm start\n', err.message);
  process.exit(1);
}

const server = app.listen(env.port, () => {
  console.log(`[server] HRMS API listening on http://localhost:${env.port}`);
  if (razorpayGateway.liveKeysRefused()) console.warn('[razorpay] LIVE keys detected and IGNORED — this project only allows Razorpay test mode (rzp_test_ keys). No real payments will be taken.');
  else if (razorpayGateway.configured()) console.log('[razorpay] Test mode enabled — no real money moves.');
  if (env.backgroundJobs) startScheduler();
});

const shutdown = async () => {
  stopScheduler();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
