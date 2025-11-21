import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { ApiOkResponse, ApiCreatedResponse, ApiTags, ApiBadRequestResponse, ApiHeader } from '@nestjs/swagger'
import { AccountsService } from './accounts.service'
import { CreateAndUpdateAccountDto } from './dto/account.createAndUpdate.dto'
import { AccountResponseDto } from './dto/account.response.dto'
import { plainToInstance } from 'class-transformer'
import { ErrorResponse } from 'src/common/dto'
import { CurrentUser } from '../common/decorators/current-user.decorator'

@ApiTags('accounts')
@Controller('accounts')
@ApiBadRequestResponse({ type: ErrorResponse })
@ApiHeader({ name: 'X-User-Id', description: 'User ID', required: true })
export class AccountsController {
  constructor(private readonly svc: AccountsService) {}

  @Post()
  @ApiCreatedResponse({ type: AccountResponseDto })
  async create(
    @Body() dto: CreateAndUpdateAccountDto,
    @CurrentUser() userId: string,
  ): Promise<AccountResponseDto> {
    const created = await this.svc.create(dto, userId)
    return plainToInstance(AccountResponseDto, created, { excludeExtraneousValues: true })
  }

  @Get()
  @ApiOkResponse({ type: AccountResponseDto, isArray: true })
  async findAll(@CurrentUser() userId: string): Promise<AccountResponseDto[]> {
    const list = await this.svc.findAll(userId)
    return list.map(e => plainToInstance(AccountResponseDto, e, { excludeExtraneousValues: true }))
  }

  @Get(':id')
  @ApiOkResponse({ type: AccountResponseDto })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ): Promise<AccountResponseDto> {
    const e = await this.svc.findOne(id, userId)
    return plainToInstance(AccountResponseDto, e, { excludeExtraneousValues: true })
  }

  @Patch(':id')
  @ApiOkResponse({ type: AccountResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: CreateAndUpdateAccountDto,
    @CurrentUser() userId: string,
  ): Promise<AccountResponseDto> {
    const e = await this.svc.update(id, dto, userId)
    return plainToInstance(AccountResponseDto, e, { excludeExtraneousValues: true })
  }

  @Delete(':id')
  @ApiOkResponse({ type: AccountResponseDto })
  async remove(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ): Promise<AccountResponseDto> {
    const e = await this.svc.remove(id, userId)
    return plainToInstance(AccountResponseDto, e, { excludeExtraneousValues: true })
  }
}
