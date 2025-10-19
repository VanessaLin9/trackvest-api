// src/accounts/accounts.service.ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { CreateAccountDto } from './dto/account.create.dto'
import { UpdateAccountDto } from './dto/account.update.dto'

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreateAccountDto) {
    return this.prisma.account.create({ data: dto })
  }

  findAll(userId?: string) {
    return this.prisma.account.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOne(id: string) {
    const acc = await this.prisma.account.findUnique({ where: { id } })
    if (!acc) throw new NotFoundException('Account not found')
    return acc
  }

  async update(id: string, dto: UpdateAccountDto) {
    await this.findOne(id)
    return this.prisma.account.update({ where: { id }, data: dto })
  }

  async remove(id: string) {
    await this.findOne(id)
    return this.prisma.account.delete({ where: { id } })
  }
}
