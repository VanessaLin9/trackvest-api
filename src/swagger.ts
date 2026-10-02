import { DocumentBuilder } from '@nestjs/swagger'
import { REFRESH_TOKEN_COOKIE } from './auth/auth.config'

/** 與 /docs 同一份 OpenAPI。匯出檔給 trackvest-web 產生型別（PR #46）。 */
export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('Trackvest API')
    .setDescription('API for investment bookkeeping')
    .setVersion('0.2.0')
    .addCookieAuth('access_token', { type: 'apiKey', in: 'cookie', name: 'access_token' })
    .addCookieAuth(REFRESH_TOKEN_COOKIE, { type: 'apiKey', in: 'cookie', name: REFRESH_TOKEN_COOKIE })
    .addTag('auth', 'Login / refresh / logout / me')
    .addTag('health', 'Health check')
    .addTag('users', 'User management')
    .addTag('onboarding', 'First-run signup and initialization')
    .addTag('accounts', 'Cash/Broker/Bank accounts')
    .addTag('assets', 'Tradable assets catalog')
    .addTag('transactions', 'Transaction records')
    .addTag('gl', 'Double-entry ledger(entries & postings)')
    .build()
}
