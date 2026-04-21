import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { ApiBadRequestResponse, ApiCreatedResponse, ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger'
import { AccountsService } from './accounts.service'
import { CreateAndUpdateAccountDto } from './dto/account.createAndUpdate.dto'
import { AccountResponseDto } from './dto/account.response.dto'
import { ErrorResponse } from 'src/common/dto'
import { AuthUser } from '../common/decorators/auth-user.decorator'
import { Serialize } from '../common/interceptors/serialize.interceptor'
import { OwnershipService } from '../common/services/ownership.service'
import { AuthenticatedUser } from '../common/types/auth-user'

@ApiTags('accounts')
@Controller('accounts')
@ApiBadRequestResponse({ type: ErrorResponse })
@ApiSecurity('user-id')
@Serialize(AccountResponseDto)
export class AccountsController {
  constructor(
    private readonly svc: AccountsService,
    private readonly ownershipService: OwnershipService,
  ) {}

  @Post()
  @ApiCreatedResponse({ type: AccountResponseDto })
  async create(
    @Body() dto: CreateAndUpdateAccountDto,
    @AuthUser() user: AuthenticatedUser,
  ) {
    this.ownershipService.assertSameUserOrAdmin(dto.userId, user)
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

  @Patch(':id')
  @ApiOkResponse({ type: AccountResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: CreateAndUpdateAccountDto,
    @AuthUser() user: AuthenticatedUser,
  ) {
    this.ownershipService.assertSameUserOrAdmin(dto.userId, user)
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
