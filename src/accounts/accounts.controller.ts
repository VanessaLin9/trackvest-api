import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { ApiOkResponse, ApiCreatedResponse, ApiTags, ApiBadRequestResponse, ApiHeader } from '@nestjs/swagger'
import { AccountsService } from './accounts.service'
import { CreateAndUpdateAccountDto } from './dto/account.createAndUpdate.dto'
import { AccountResponseDto } from './dto/account.response.dto'
import { plainToInstance } from 'class-transformer'
import { ErrorResponse } from 'src/common/dto'
import { AuthUser } from '../common/decorators/auth-user.decorator'
import { OwnershipService } from '../common/services/ownership.service'
import { AuthenticatedUser } from '../common/types/auth-user'

@ApiTags('accounts')
@Controller('accounts')
@ApiBadRequestResponse({ type: ErrorResponse })
@ApiHeader({ name: 'X-User-Id', description: 'User ID', required: true })
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
  ): Promise<AccountResponseDto> {
    this.ownershipService.assertSameUserOrAdmin(dto.userId, user)
    const created = await this.svc.create(dto, user)
    return plainToInstance(AccountResponseDto, created, { excludeExtraneousValues: true })
  }

  @Get()
  @ApiOkResponse({ type: AccountResponseDto, isArray: true })
  async findAll(@AuthUser() user: AuthenticatedUser): Promise<AccountResponseDto[]> {
    const list = await this.svc.findAll(user)
    return list.map(e => plainToInstance(AccountResponseDto, e, { excludeExtraneousValues: true }))
  }

  @Get(':id')
  @ApiOkResponse({ type: AccountResponseDto })
  async findOne(
    @Param('id') id: string,
    @AuthUser() user: AuthenticatedUser,
  ): Promise<AccountResponseDto> {
    const e = await this.svc.findOne(id, user)
    return plainToInstance(AccountResponseDto, e, { excludeExtraneousValues: true })
  }

  @Patch(':id')
  @ApiOkResponse({ type: AccountResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: CreateAndUpdateAccountDto,
    @AuthUser() user: AuthenticatedUser,
  ): Promise<AccountResponseDto> {
    this.ownershipService.assertSameUserOrAdmin(dto.userId, user)
    const e = await this.svc.update(id, dto, user)
    return plainToInstance(AccountResponseDto, e, { excludeExtraneousValues: true })
  }

  @Delete(':id')
  @ApiOkResponse({ type: AccountResponseDto })
  async remove(
    @Param('id') id: string,
    @AuthUser() user: AuthenticatedUser,
  ): Promise<AccountResponseDto> {
    const e = await this.svc.remove(id, user)
    return plainToInstance(AccountResponseDto, e, { excludeExtraneousValues: true })
  }
}
