import 'reflect-metadata'
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants'

export type CronHandlerMetadata = {
  cronTime: string
  timeZone?: string
}

export function getCronHandlerMetadata(
  prototype: object,
  methodName: string,
): CronHandlerMetadata {
  const handler = (prototype as Record<string, unknown>)[methodName]
  const options = Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, handler) as
    | CronHandlerMetadata
    | undefined

  if (!options?.cronTime) {
    throw new Error(`Missing ${SCHEDULE_CRON_OPTIONS} metadata on ${methodName}`)
  }

  return options
}

export function expectCronSchedule(
  prototype: object,
  methodName: string,
  expected: CronHandlerMetadata,
) {
  const options = getCronHandlerMetadata(prototype, methodName)

  expect(options.cronTime).toBe(expected.cronTime)
  expect(options.timeZone).toBe(expected.timeZone)
}
