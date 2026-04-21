import { Body, Controller, Get, Post } from '@nestjs/common'
import { ApiBadRequestResponse, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { UsersService } from './users.service'
import { CreateUserDto } from './dto/user.create.dto'
import { UserResponseDto } from './dto/users.response.dto'
import { ErrorResponse } from 'src/common/dto'
import { Public } from '../common/decorators/public.decorator'
import { Roles } from '../common/decorators/roles.decorator'
import { Serialize } from '../common/interceptors/serialize.interceptor'

@ApiTags('users')
@Controller('users')
@ApiBadRequestResponse({ type: ErrorResponse })
@Serialize(UserResponseDto)
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Post()
  @Public()
  @ApiCreatedResponse({ type: UserResponseDto })
  async create(@Body() dto: CreateUserDto) {
    return this.svc.create(dto)
  }

  @Get()
  @Roles(UserRole.admin)
  @ApiCookieAuth('access_token')
  @ApiOkResponse({ type: UserResponseDto, isArray: true })
  async findAll() {
    return this.svc.findAll()
  }
}
