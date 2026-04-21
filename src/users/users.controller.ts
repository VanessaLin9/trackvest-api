import { Body, Controller, Get, Post } from '@nestjs/common'
import { ApiBadRequestResponse, ApiCreatedResponse, ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger'
import { plainToInstance } from 'class-transformer'
import { UserRole } from '@prisma/client'
import { UsersService } from './users.service'
import { CreateUserDto } from './dto/user.create.dto'
import { UserResponseDto } from './dto/users.response.dto'
import { ErrorResponse } from 'src/common/dto'
import { Public } from '../common/decorators/public.decorator'
import { Roles } from '../common/decorators/roles.decorator'

@ApiTags('users')
@Controller('users')
@ApiBadRequestResponse({ type: ErrorResponse })
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Post()
  @Public()
  @ApiCreatedResponse({ type: UserResponseDto })
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    const created = await this.svc.create(dto)
    return plainToInstance(UserResponseDto, created, { excludeExtraneousValues: true })
  }

  @Get()
  @Roles(UserRole.admin)
  @ApiSecurity('user-id')
  @ApiOkResponse({ type: UserResponseDto, isArray: true })
  async findAll(): Promise<UserResponseDto[]> {
    const list = await this.svc.findAll()
    return list.map(e => plainToInstance(UserResponseDto, e, { excludeExtraneousValues: true }))
  }
}
