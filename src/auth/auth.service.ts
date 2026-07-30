import { Injectable, UnauthorizedException } from '@nestjs/common'
import bcrypt from 'bcrypt'
import { PrismaService } from '../prisma.service'
import { AuthUserDto } from './dto/auth-user.dto'
import { LoginDto } from './dto/login.dto'
import { AccessTokenService } from './tokens/access-token.service'
import { IssuedRefreshToken, RefreshTokenService } from './tokens/refresh-token.service'

export interface AuthSession {
  user: AuthUserDto
  accessToken: string
  refreshToken: string
  refreshTokenExpiresAt: Date
}

/** Cookie JWT session：login／refresh／logout（PR #15）。 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessTokenService,
    private readonly refresh: RefreshTokenService,
  ) {}

  async login(dto: LoginDto): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, email: true, role: true, passwordHash: true },
    })
    // 無論 user 是否存在都跑 bcrypt，避免用 timing 探測帳號存在（PR #15）。
    const fallbackHash = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8pfwzvK9yZ.pLLd6DEFvmZqGzzCqOG'
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? fallbackHash)
    if (!user || !ok) {
      throw new UnauthorizedException('Invalid email or password')
    }

    const accessToken = this.access.sign(user.id, user.role)
    const issued = await this.refresh.issueForUser(user.id)

    return this.toSession(user, accessToken, issued)
  }

  async refreshSession(rawRefreshToken: string): Promise<AuthSession> {
    const rotated = await this.refresh.rotate(rawRefreshToken)
    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
      select: { id: true, email: true, role: true },
    })
    if (!user) {
      await this.refresh.revokeAllForUser(rotated.userId)
      throw new UnauthorizedException('User no longer exists')
    }
    const accessToken = this.access.sign(user.id, user.role)
    return this.toSession(user, accessToken, rotated)
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return
    await this.refresh.revoke(rawRefreshToken)
  }

  async getMe(userId: string): Promise<AuthUserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    })
    if (!user) throw new UnauthorizedException('User not found')
    return user
  }

  private toSession(
    user: { id: string; email: string; role: AuthUserDto['role'] },
    accessToken: string,
    refresh: IssuedRefreshToken,
  ): AuthSession {
    return {
      user: { id: user.id, email: user.email, role: user.role },
      accessToken,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt,
    }
  }
}
