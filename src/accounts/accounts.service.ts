// src/accounts/accounts.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Account, AccountType, Currency, GlAccountType, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import { CreateAndUpdateAccountDto } from './dto/account.createAndUpdate.dto'
import { OwnershipService } from '../common/services/ownership.service'
import { AuthenticatedUser, UserContext } from '../common/types/auth-user'
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

  /**
   * 新建只允許 cathay 或空（PR #3）。
   * 更新可沿用帳戶上已有的其他代碼，例如 seed 的 ib，不能改成新的不支援券商（PR #46）。
   */
  private normalizeBroker(
    type: AccountType,
    broker?: string | null,
    existingBroker?: string | null,
  ): string | null {
    const normalizedBroker = broker?.trim().toLowerCase() || null

    if (type !== AccountType.broker) {
      return null
    }

    if (!normalizedBroker) {
      return null
    }

    if (normalizedBroker === SUPPORTED_BROKER) {
      return normalizedBroker
    }

    const keptBroker = existingBroker?.trim().toLowerCase() || null
    if (keptBroker && normalizedBroker === keptBroker) {
      return keptBroker
    }

    throw new BadRequestException(
      `Broker must be ${SUPPORTED_BROKER} or empty for broker accounts`,
    )
  }

  private buildAccountData(
    input: CreateAndUpdateAccountDto & { userId: string },
    existingBroker?: string | null,
  ) {
    const trimmedName = input.name.trim()
    if (!trimmedName) {
      throw new BadRequestException('Account name is required')
    }

    return {
      userId: input.userId,
      name: trimmedName,
      type: input.type,
      currency: input.currency,
      broker: this.normalizeBroker(input.type, input.broker, existingBroker),
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

  /**
   * 呼叫端已開 transaction 時建立帳戶（onboarding signup 用；PR #32）。
   * 一併 ensure 連結的現金 GL；不開 nested `$transaction`。
   */
  async createInTransaction(
    dto: CreateAndUpdateAccountDto & { userId: string },
    db: DbClient,
  ) {
    const account = await db.account.create({ data: this.buildAccountData(dto) })
    await this.ensureLinkedGlAccount(account, db)
    return account
  }

  async create(dto: CreateAndUpdateAccountDto, user: AuthenticatedUser) {
    // HTTP 建立一律掛在 session user。onboarding 走 createInTransaction，自己帶新 user id（PR #46）。
    await this.ownershipService.validateUserExists(user.id)

    return this.prisma.$transaction(async (db) =>
      this.createInTransaction({ ...dto, userId: user.id }, db),
    )
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
      const existing = await db.account.findUnique({ where: { id } })
      if (!existing) throw new NotFoundException('Account not found')

      const account = await db.account.update({
        where: { id },
        data: this.buildAccountData({ ...dto, userId: existing.userId }, existing.broker),
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
