import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { UserRole } from '@prisma/client'
import { AuthConfig } from '../auth.config'

export interface AccessTokenPayload {
  sub: string
  role: UserRole
}

/**
 * 短壽命 JWT access token（PR #15）。Payload 只放 `{ sub, role }`，
 * 其餘資料現查，避免把過期狀態烤進 ~15 分鐘 token。
 */
@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AuthConfig,
  ) {}

  sign(userId: string, role: UserRole): string {
    const payload: AccessTokenPayload = { sub: userId, role }
    return this.jwt.sign(payload, {
      secret: this.config.jwtSecret,
      expiresIn: this.config.accessTtlSec,
    })
  }

  verify(token: string): AccessTokenPayload {
    try {
      const decoded = this.jwt.verify<AccessTokenPayload>(token, {
        secret: this.config.jwtSecret,
      })
      if (typeof decoded.sub !== 'string' || !decoded.role) {
        throw new UnauthorizedException('Invalid access token payload')
      }
      return decoded
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err
      throw new UnauthorizedException('Invalid or expired access token')
    }
  }
}
