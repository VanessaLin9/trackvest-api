import { PrismaClient } from '@prisma/client'

/** Idempotent production bootstrap for system defaults — none required yet. */
export async function runProductionBootstrap(_prisma: PrismaClient) {
  console.log('Production bootstrap: no system defaults required at this time.')
}
