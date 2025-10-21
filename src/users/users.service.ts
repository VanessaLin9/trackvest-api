import { Injectable, ConflictException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { CreateUserDto } from './dto/user.create.dto'
import { UserRole } from '@prisma/client'
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
    } catch (e: any) {
        if (e.code === 'P2002') throw new ConflictException('Email already exists')
        throw e
    }
}

  findAll() {
    return this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } })
  }

  async findOne(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } })
    if (!u) throw new NotFoundException('User not found')
    return u
  }
}
