import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

/** Single shared Prisma client (repository layer for every entity class). */
export const prisma = new PrismaClient({
  datasources: { db: { url: env.databaseUrl } },
});
