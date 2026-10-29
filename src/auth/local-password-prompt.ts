import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import type { ReadStream, WriteStream } from 'node:tty'
import { LocalPasswordResetError } from './local-password-reset'

export async function readHiddenPassword(
  prompt: string,
  input: ReadStream = process.stdin,
  output: WriteStream = process.stdout,
): Promise<string> {
  if (!input.isTTY || !output.isTTY) {
    throw new LocalPasswordResetError('Run this command in an interactive terminal. Piped passwords are not accepted.')
  }

  // Let readline handle editing and raw-mode cleanup, but discard all echoed input.
  const silentOutput = new Writable({
    write(_chunk, _encoding, done) { done() },
  })
  const reader = createInterface({ input, output: silentOutput, terminal: true, historySize: 0 })
  const controller = new AbortController()
  const cancel = () => controller.abort()
  reader.once('SIGINT', cancel)
  reader.once('close', cancel)
  output.write(prompt)

  try {
    return await reader.question('', { signal: controller.signal })
  } catch {
    throw new LocalPasswordResetError('Password reset cancelled. No changes were made.')
  } finally {
    reader.close()
    silentOutput.destroy()
    output.write('\n')
  }
}
