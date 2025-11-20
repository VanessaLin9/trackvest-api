import { Injectable, ConflictException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { CreateUserDto } from './dto/user.create.dto'
import { Prisma, UserRole } from '@prisma/client'
import * as bcrypt from 'bcrypt'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const hash = await bcrypt.hash(dto.password, 10)
    try {
      return await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash: hash,
          role: UserRole.user,
        },
      })
    } catch (e: unknown) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            throw new ConflictException('Email already exists')
        }
        throw e
    }
  }

  findAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    })
  }
}


