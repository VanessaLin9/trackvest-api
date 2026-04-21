// src/accounts/accounts.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Account, AccountType, Currency, GlAccountType, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import { CreateAndUpdateAccountDto } from './dto/account.createAndUpdate.dto'
import { OwnershipService } from '../common/services/ownership.service'
import { UserContext } from '../common/types/auth-user'
import { SUPPORTED_BROKER } from './account-broker.constants'

type DbClient = Prisma.TransactionClient | PrismaService

@Injectable()
export class AccountsService {
  constructor(
    private prisma: PrismaService,
    private ownershipService: OwnershipService,
  ) {}

  private getDb(db?: DbClient) {
    return db ?? this.prisma
  }

  private normalizeBroker(type: AccountType, broker?: string | null): string | null {
    const normalizedBroker = broker?.trim().toLowerCase() || null

    if (type !== AccountType.broker) {
      return null
    }

    if (!normalizedBroker) {
      return null
    }

    if (normalizedBroker !== SUPPORTED_BROKER) {
      throw new BadRequestException(
        `Broker must be ${SUPPORTED_BROKER} or empty for broker accounts`,
      )
    }

    return normalizedBroker
  }

  private buildAccountData(dto: CreateAndUpdateAccountDto) {
    const trimmedName = dto.name.trim()
    if (!trimmedName) {
      throw new BadRequestException('Account name is required')
    }

    return {
      userId: dto.userId,
      name: trimmedName,
      type: dto.type,
      currency: dto.currency,
      broker: this.normalizeBroker(dto.type, dto.broker),
    }
  }

  private formatCurrencyLabel(currency: Currency): string {
    switch (currency) {
      case 'TWD':
        return '台幣'
      case 'USD':
        return '美元'
      case 'JPY':
        return '日圓'
      case 'EUR':
        return '歐元'
      default:
        return currency
    }
  }

  private buildLinkedGlAccountName(account: Pick<Account, 'id' | 'name' | 'type' | 'currency'>): string {
    const accountTypeLabel =
      account.type === 'broker'
        ? '券商現金'
        : account.type === 'bank'
        ? '銀行'
        : '現金'

    return `資產-${accountTypeLabel}-${account.name}-${account.id.slice(0, 8)}(${this.formatCurrencyLabel(account.currency)})`
  }

  private async ensureLinkedGlAccount(account: Account, db?: DbClient) {
    await this.getDb(db).glAccount.upsert({
      where: { linkedAccountId: account.id },
      update: {
        userId: account.userId,
        name: this.buildLinkedGlAccountName(account),
        type: GlAccountType.asset,
        currency: account.currency,
        archivedAt: null,
      },
      create: {
        userId: account.userId,
        name: this.buildLinkedGlAccountName(account),
        type: GlAccountType.asset,
        currency: account.currency,
        linkedAccountId: account.id,
      },
    })
  }

  async create(dto: CreateAndUpdateAccountDto, _user: UserContext) {
    // Controller is responsible for `assertSameUserOrAdmin(dto.userId, user)`
    // before reaching here. We still verify the target user exists.
    await this.ownershipService.validateUserExists(dto.userId)

    return this.prisma.$transaction(async (db) => {
      const account = await db.account.create({ data: this.buildAccountData(dto) })
      await this.ensureLinkedGlAccount(account, db)
      return account
    })
  }

  async findAll(user: UserContext) {
    const { userId, isAdmin } = await this.ownershipService.resolveUser(user)
    return this.prisma.account.findMany({
      where: isAdmin ? undefined : { userId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOne(id: string, user: UserContext) {
    await this.ownershipService.validateAccountOwnership(id, user)

    const acc = await this.prisma.account.findUnique({ where: { id } })
    if (!acc) throw new NotFoundException('Account not found')
    return acc
  }

  async update(id: string, dto: CreateAndUpdateAccountDto, user: UserContext) {
    await this.ownershipService.validateAccountOwnership(id, user)

    return this.prisma.$transaction(async (db) => {
      const account = await db.account.update({
        where: { id },
        data: this.buildAccountData(dto),
      })
      await this.ensureLinkedGlAccount(account, db)
      return account
    })
  }

  async remove(id: string, user: UserContext) {
    await this.ownershipService.validateAccountOwnership(id, user)

    return this.prisma.account.delete({ where: { id } })
  }
}
