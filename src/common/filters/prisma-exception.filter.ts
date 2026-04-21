import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { Prisma } from '@prisma/client'

/**
 * Translate common Prisma runtime errors into proper HTTP responses so that
 * uncaught cases (mostly dev mistakes) don't surface as opaque 500s.
 *
 * Services that want richer, domain-specific messages should still catch
 * the error locally (e.g. `UsersService.create` returns a friendlier
 * "Email already exists" message). This filter is the safety net.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaClientExceptionFilter.name)

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost
    const ctx = host.switchToHttp()
    const request = ctx.getRequest<{ url?: string }>()

    const { status, message, error } = this.map(exception)

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled Prisma error ${exception.code} at ${request?.url ?? '<unknown>'}: ${exception.message}`,
        exception.stack,
      )
    }

    httpAdapter.reply(
      ctx.getResponse(),
      {
        statusCode: status,
        error,
        message,
      },
      status,
    )
  }

  private map(exception: Prisma.PrismaClientKnownRequestError): {
    status: number
    message: string
    error: string
  } {
    switch (exception.code) {
      case 'P2002': {
        const target = this.formatTarget(exception.meta?.target)
        return {
          status: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: target
            ? `Unique constraint failed on ${target}`
            : 'Unique constraint failed',
        }
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          error: 'Not Found',
          message: (exception.meta?.cause as string | undefined) ?? 'Record not found',
        }
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'Foreign key constraint failed',
        }
      case 'P2014':
        return {
          status: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'Invalid relation: the change would violate a required relation',
        }
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Internal Server Error',
          message: `Database error (${exception.code})`,
        }
    }
  }

  private formatTarget(target: unknown): string | undefined {
    if (Array.isArray(target)) return target.join(', ')
    if (typeof target === 'string') return target
    return undefined
  }
}
