import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { AccountsService } from './accounts.service'
import { CreateAccountDto } from './dto/create-account.dto'
import { UpdateAccountDto } from './dto/update-account.dto'

@Controller('accounts')
export class AccountsController {
  constructor(private readonly svc: AccountsService) {}

  @Post()
  create(@Body() dto: CreateAccountDto) {
    return this.svc.create(dto)
  }

  @Get()
  findAll(@Query() q: UpdateAccountDto ) {
    return this.svc.findAll()
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.svc.update(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id)
  }
}

