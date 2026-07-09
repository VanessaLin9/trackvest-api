import { ConflictException, Injectable } from '@nestjs/common'
import { Currency, Prisma, UserRole } from '@prisma/client'
import bcrypt from 'bcrypt'
import { AccountsService } from '../accounts/accounts.service'
import { DefaultChartProvisioningService } from '../gl/default-chart/default-chart-provisioning.service'
import { PrismaService } from '../prisma.service'
import { OnboardingSignupDto } from './dto/onboarding-signup.dto'

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly defaultChartProvisioningService: DefaultChartProvisioningService,
    private readonly accountsService: AccountsService,
  ) {}

  async signup(dto: OnboardingSignupDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10)
    const currency = dto.starterAccount.currency ?? Currency.TWD

    try {
      return await this.prisma.$transaction(async (db) => {
        const user = await db.user.create({
          data: {
            email: dto.email,
            passwordHash,
            role: UserRole.user,
          },
        })

        await this.defaultChartProvisioningService.provisionSystemAccounts(
          user.id,
          currency,
          db,
        )

        const starterAccount = await this.accountsService.createInTransaction(
          {
            userId: user.id,
            name: dto.starterAccount.name,
            type: dto.starterAccount.type,
            currency,
            broker: dto.starterAccount.broker,
          },
          db,
        )

        return { user, starterAccount }
      })
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email already exists')
      }
      throw error
    }
  }
}
