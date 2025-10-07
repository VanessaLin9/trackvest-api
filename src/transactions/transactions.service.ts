import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  // 預設只回 isDeleted=false；?includeDeleted=true 可包含軟刪
  //   listAll(includeDeleted?: boolean) {
  //     return this.prisma.transaction.findMany({
  //       where: includeDeleted ? {} : { isDeleted: false },
  //       orderBy: { tradeTime: 'desc' },
  //       include: {
  //         account: { select: { name: true, currency: true, userId: true } },
  //         asset: { select: { symbol: true, name: true } },
  //         tags: { include: { tag: true } },
  //       },
  //       take: 50,
  //     });
  //   }

  //   softDelete(id: string) {
  //     return this.prisma.transaction.update({
  //       where: { id },
  //       data: { isDeleted: true, deletedAt: new Date() },
  //     });
  //   }

  //   restore(id: string) {
  //     return this.prisma.transaction.update({
  //       where: { id },
  //       data: { isDeleted: false, deletedAt: null },
  //     });
  //   }
}
