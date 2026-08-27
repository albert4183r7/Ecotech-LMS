import { PrismaClient } from "@prisma/client";

// ============================================
// Database client
//
// One client per process, kept on globalThis in development so a hot reload
// does not open a new connection pool on every edit.
//
// Query logging is a development tool. It was on everywhere, which meant every
// query and its parameters went to stdout in production: a cost on every
// request, and personal data written into whatever collects those logs. In
// production only errors are logged, which is what an operator actually acts
// on.
// ============================================

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const isProduction = process.env.NODE_ENV === "production";

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ["error"] : ["query", "warn", "error"],
  });

if (!isProduction) globalForPrisma.prisma = db;
