import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { ApiBadRequestResponse, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { AccountsService } from './accounts.service'
import { CreateAndUpdateAccountDto } from './dto/account.createAndUpdate.dto'
import { AccountResponseDto } from './dto/account.response.dto'
import { ErrorResponse } from 'src/common/dto'
import { AuthUser } from '../common/decorators/auth-user.decorator'
import { Serialize } from '../common/interceptors/serialize.interceptor'
import { AuthenticatedUser } from '../common/types/auth-user'

@ApiTags('accounts')
@Controller('accounts')
@ApiBadRequestResponse({ type: ErrorResponse })
@ApiCookieAuth('access_token')
@Serialize(AccountResponseDto)
export class AccountsController {
  constructor(private readonly svc: AccountsService) {}

  // 新帳戶屬於 access token 的使用者。不接受 body.userId，避免客戶端指定別人的帳（PR #46）。
  @Post()
  @ApiCreatedResponse({ type: AccountResponseDto })
  async create(
    @Body() dto: CreateAndUpdateAccountDto,
    @AuthUser() user: AuthenticatedUser,
  ) {
    return this.svc.create(dto, user)
  }

  @Get()
  @ApiOkResponse({ type: AccountResponseDto, isArray: true })
  async findAll(@AuthUser() user: AuthenticatedUser) {
    return this.svc.findAll(user)
  }

  @Get(':id')
  @ApiOkResponse({ type: AccountResponseDto })
  async findOne(
    @Param('id') id: string,
    @AuthUser() user: AuthenticatedUser,
  ) {
    return this.svc.findOne(id, user)
  }

  // 更新只改名稱、類型、幣別、券商。userId 留在原帳戶上，不能靠 body 轉給別人（PR #46）。
  @Patch(':id')
  @ApiOkResponse({ type: AccountResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: CreateAndUpdateAccountDto,
    @AuthUser() user: AuthenticatedUser,
  ) {
    return this.svc.update(id, dto, user)
  }

  @Delete(':id')
  @ApiOkResponse({ type: AccountResponseDto })
  async remove(
    @Param('id') id: string,
    @AuthUser() user: AuthenticatedUser,
  ) {
    return this.svc.remove(id, user)
  }
}
