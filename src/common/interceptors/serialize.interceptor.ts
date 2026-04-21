import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UseInterceptors,
} from '@nestjs/common'
import { ClassConstructor, plainToInstance } from 'class-transformer'
import { map, Observable } from 'rxjs'

/**
 * Convert a controller's raw return value (e.g. a Prisma entity) into the
 * given DTO using `excludeExtraneousValues`. Works transparently for
 * single objects and arrays. `null` / `undefined` are passed through.
 */
@Injectable()
export class SerializeInterceptor<T> implements NestInterceptor {
  constructor(private readonly dto: ClassConstructor<T>) {}

  intercept(_context: ExecutionContext, handler: CallHandler): Observable<unknown> {
    return handler.handle().pipe(
      map((data) => {
        if (data === null || data === undefined) return data
        return plainToInstance(this.dto, data, { excludeExtraneousValues: true })
      }),
    )
  }
}

/**
 * Apply {@link SerializeInterceptor} to a handler (or class).
 *
 * ```ts
 * @Get(':id')
 * @Serialize(AccountResponseDto)
 * findOne(@Param('id') id: string) {
 *   return this.svc.findOne(id)
 * }
 * ```
 */
export function Serialize<T>(dto: ClassConstructor<T>) {
  return UseInterceptors(new SerializeInterceptor(dto))
}
