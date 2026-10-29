import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { PrismaClient } from '@prisma/client'
import { isEmail } from 'class-validator'
import { readHiddenPassword } from '../src/auth/local-password-prompt'
import {
  assertLocalPasswordResetAllowed,
  LocalPasswordResetError,
  resetLocalPassword,
} from '../src/auth/local-password-reset'

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: pnpm auth:reset-password:local <email>\nEnter the new password twice at the hidden prompts. Local PostgreSQL only.')
    return
  }
  if (args.length !== 1 || !isEmail(args[0].trim())) {
    throw new LocalPasswordResetError('Usage: pnpm auth:reset-password:local <email>. Do not pass a password as an argument.')
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new LocalPasswordResetError('Run this command in an interactive terminal. Piped passwords are not accepted.')
  }
  if (existsSync('.env')) loadEnvFile('.env')
  const target = assertLocalPasswordResetAllowed()
  const email = args[0].trim()
  console.log(`Account: ${email}`)
  console.log(`Local database: ${target.hostname}:${target.port || '5432'}${target.pathname} (schema: ${target.searchParams.get('schema') ?? 'public'})`)
  const password = await readHiddenPassword('New password: ')
  const confirmation = await readHiddenPassword('Confirm new password: ')

  const prisma = new PrismaClient()
  try {
    const result = await resetLocalPassword(prisma, email, password, confirmation)
    console.log(`Password reset for ${result.email}. Revoked ${result.revokedRefreshTokens} refresh token(s).`)
    console.log('Sign in with the new password. Existing access tokens remain valid until expiry (default: 15 minutes).')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  // Prisma errors may contain connection details. Never print arbitrary error data.
  console.error(error instanceof LocalPasswordResetError
    ? error.message
    : 'Password reset failed. Check the local database connection and migrations.')
  process.exitCode = 1
})
