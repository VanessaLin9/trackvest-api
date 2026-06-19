import { PrismaClient } from '@prisma/client'

export async function runSeedEntrypoint(run: (prisma: PrismaClient) => Promise<void>) {
  const prisma = new PrismaClient()
  let failed = false

  try {
    await run(prisma)
  } catch (error) {
    console.error(error)
    failed = true
  } finally {
    await prisma.$disconnect()
  }

  if (failed) {
    process.exit(1)
  }
}
