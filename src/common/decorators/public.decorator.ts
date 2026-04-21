import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'isPublic'

/**
 * Marks a route (or controller) as publicly accessible, bypassing `AuthGuard`.
 * Use sparingly: health checks, sign-up, public catalogs.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
