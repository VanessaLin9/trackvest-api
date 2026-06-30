import { BadRequestException, Injectable } from '@nestjs/common'
import { AccountType } from '@prisma/client'
import { SUPPORTED_BROKER } from '../accounts/account-broker.constants'
import { ImportBrokerAccount } from './transaction-import-orchestration.types'

@Injectable()
export class ImportBrokerAccountGuard {
  assertEligible(account: ImportBrokerAccount): void {
    if (account.type !== AccountType.broker) {
      throw new BadRequestException('Selected account is not a broker account')
    }

    if (!account.broker) {
      throw new BadRequestException('Selected account does not have a broker configured')
    }

    if (account.broker !== SUPPORTED_BROKER) {
      throw new BadRequestException(
        `Only ${SUPPORTED_BROKER} broker accounts are supported for CSV import`,
      )
    }
  }
}
