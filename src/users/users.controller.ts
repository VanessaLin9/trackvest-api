import { Body, Controller, Get, Post } from '@nestjs/common'
import { ApiBadRequestResponse, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { plainToInstance } from 'class-transformer'
import { UsersService } from './users.service'
import { CreateUserDto } from './dto/user.create.dto'
import { UserResponseDto } from './dto/users.response.dto'
import { ErrorResponse } from 'src/common/dto'

@ApiTags('users')
@Controller('users')
@ApiBadRequestResponse({ type: ErrorResponse })
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
    return []
  }
}
