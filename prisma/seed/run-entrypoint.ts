import { PrismaClient } from '@prisma/client'

export async function runSeedEntrypoint(run: (prisma: PrismaClient) => Promise<void>) {
  const prisma = new PrismaClient()

  try {
    await run(prisma)
  } catch (error) {
    console.error(error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}
