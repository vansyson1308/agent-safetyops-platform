import { PrismaClient } from '@prisma/client';

// One client per process: each PrismaClient opens its own connection pool.
export const prisma = new PrismaClient();
