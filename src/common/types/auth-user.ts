import { UserRole } from '@prisma/client'

/**
 * Minimal information about the authenticated principal for the current request.
 * Populated by `AuthGuard` on `req.user`.
 */
export interface AuthenticatedUser {
  id: string
  role: UserRole
}

/**
 * Callers that know the role (HTTP, from `AuthGuard`) should pass the full
 * `AuthenticatedUser` object. Contexts without a role (MCP, jobs) may pass a
 * plain user id; downstream services will query the role when needed.
 */
export type UserContext = string | AuthenticatedUser
