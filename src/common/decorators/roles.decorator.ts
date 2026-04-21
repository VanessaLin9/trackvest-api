import { SetMetadata } from '@nestjs/common'
import { UserRole } from '@prisma/client'

export const ROLES_KEY = 'roles'

/**
 * Restricts a route (or controller) to the given roles.
 * Enforced by `AuthGuard` once the user is authenticated.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles)
