import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AuthConfig } from './auth.config'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { AccessTokenService } from './tokens/access-token.service'
import { RefreshTokenService } from './tokens/refresh-token.service'

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthConfig, AccessTokenService, RefreshTokenService, AuthService],
  exports: [AuthConfig, AccessTokenService],
})
export class AuthModule {}
