// src/accounts/accounts.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common'
import { ApiOkResponse, ApiCreatedResponse, ApiTags } from '@nestjs/swagger'
import { AccountsService } from './accounts.service'
import { CreateAccountDto } from './dto/account.create.dto'
import { UpdateAccountDto } from './dto/account.update.dto'
import { AccountResponseDto } from './dto/account.response.dto'
import { plainToInstance } from 'class-transformer'

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly svc: AccountsService) {}

  @Post()
  @ApiCreatedResponse({ type: AccountResponseDto })
  async create(@Body() dto: CreateAccountDto, @Req() req: Request): Promise<AccountResponseDto> {
    console.log('RAW BODY =', req.body)
    console.log('DTO KEYS =', Object.keys(dto))
    console.log('DTO INSTANCE =', dto)
    const created = await this.svc.create(dto)
    return plainToInstance(AccountResponseDto, created, { excludeExtraneousValues: true })
  }

  @Get()
  @ApiOkResponse({ type: AccountResponseDto, isArray: true })
  async findAll(@Query('userId') userId?: string): Promise<AccountResponseDto[]> {
    const list = await this.svc.findAll(userId)
    return list.map(e => plainToInstance(AccountResponseDto, e, { excludeExtraneousValues: true }))
  }

  @Get(':id')
  @ApiOkResponse({ type: AccountResponseDto })
  async findOne(@Param('id') id: string): Promise<AccountResponseDto> {
    const e = await this.svc.findOne(id)
    return plainToInstance(AccountResponseDto, e, { excludeExtraneousValues: true })
  }

  @Patch(':id')
  @ApiOkResponse({ type: AccountResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateAccountDto): Promise<AccountResponseDto> {
    const e = await this.svc.update(id, dto)
    return plainToInstance(AccountResponseDto, e, { excludeExtraneousValues: true })
  }

  @Delete(':id')
  @ApiOkResponse({ type: AccountResponseDto })
  async remove(@Param('id') id: string): Promise<AccountResponseDto> {
    const e = await this.svc.remove(id)
    return plainToInstance(AccountResponseDto, e, { excludeExtraneousValues: true })
  }
}
