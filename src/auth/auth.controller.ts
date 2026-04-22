import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { ErrorResponse } from '../common/dto'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { Public } from '../common/decorators/public.decorator'
import { Serialize } from '../common/interceptors/serialize.interceptor'
import { AuthConfig, REFRESH_TOKEN_COOKIE } from './auth.config'
import { clearSessionCookies, setSessionCookies } from './auth.cookies'
import { AuthService } from './auth.service'
import { AuthUserDto } from './dto/auth-user.dto'
import { LoginDto } from './dto/login.dto'

@ApiTags('auth')
@Controller('auth')
@ApiBadRequestResponse({ type: ErrorResponse })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AuthConfig,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Serialize(AuthUserDto)
  @ApiOkResponse({ type: AuthUserDto })
  @ApiUnauthorizedResponse({ type: ErrorResponse })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.login(dto)
    setSessionCookies(res, this.config, session.accessToken, session.refreshToken)
    return session.user
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Serialize(AuthUserDto)
  @ApiCookieAuth(REFRESH_TOKEN_COOKIE)
  @ApiOkResponse({ type: AuthUserDto })
  @ApiUnauthorizedResponse({ type: ErrorResponse })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE]
    if (!token) throw new UnauthorizedException('Missing refresh token')
    const session = await this.auth.refreshSession(token)
    setSessionCookies(res, this.config, session.accessToken, session.refreshToken)
    return session.user
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(REFRESH_TOKEN_COOKIE)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE]
    await this.auth.logout(token)
    clearSessionCookies(res, this.config)
  }

  @Get('me')
  @Serialize(AuthUserDto)
  @ApiOkResponse({ type: AuthUserDto })
  @ApiUnauthorizedResponse({ type: ErrorResponse })
  async me(@CurrentUser() userId: string) {
    return this.auth.getMe(userId)
  }
}
