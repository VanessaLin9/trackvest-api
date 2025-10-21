import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { plainToInstance } from 'class-transformer'
import { UsersService } from './users.service'
import { CreateUserDto } from './dto/user.create.dto'
import { UserResponseDto } from './dto/users.response.dto'

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Post()
  @ApiCreatedResponse({ type: UserResponseDto })
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    const created = await this.svc.create(dto)
    return plainToInstance(UserResponseDto, created, { excludeExtraneousValues: true })
  }

  @Get()
  @ApiOkResponse({ type: UserResponseDto, isArray: true })
  async findAll(): Promise<UserResponseDto[]> {
    const list = await this.svc.findAll()
    return list.map(u => plainToInstance(UserResponseDto, u, { excludeExtraneousValues: true }))
  }

  @Get(':id')
  @ApiOkResponse({ type: UserResponseDto })
  async findOne(@Param('id') id: string): Promise<UserResponseDto> {
    const u = await this.svc.findOne(id)
    return plainToInstance(UserResponseDto, u, { excludeExtraneousValues: true })
  }
}
