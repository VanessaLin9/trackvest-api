import { PassThrough } from 'node:stream'
import type { ReadStream, WriteStream } from 'node:tty'
import { readHiddenPassword } from './local-password-prompt'

function terminal() {
  const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode: jest.fn() })
  const output = Object.assign(new PassThrough(), { isTTY: true })
  let displayed = ''
  output.on('data', (chunk: Buffer) => { displayed += chunk.toString() })
  return {
    input: input as unknown as ReadStream,
    output: output as unknown as WriteStream,
    rawMode: input.setRawMode,
    displayed: () => displayed,
  }
}

describe('hidden password prompt', () => {
  it('accepts a password without echoing it and restores terminal mode', async () => {
    const tty = terminal()
    const answer = readHiddenPassword('New password: ', tty.input, tty.output)
    // Backspace and Unicode are handled by readline, without echoing either.
    tty.input.emit('data', Buffer.from('秘密-passwordx\x7f\r'))
    await expect(answer).resolves.toBe('秘密-password')
    expect(tty.displayed()).toBe('New password: \n')
    expect(tty.rawMode.mock.calls).toEqual([[true], [false]])
  })

  it.each(['\x03', '\x04'])('cancels on Ctrl+C or EOF without leaving raw mode enabled', async (control) => {
    const tty = terminal()
    const answer = readHiddenPassword('New password: ', tty.input, tty.output)
    tty.input.emit('data', Buffer.from(control))
    await expect(answer).rejects.toThrow(/cancelled/)
    expect(tty.rawMode.mock.calls).toEqual([[true], [false]])
    expect(tty.displayed()).toBe('New password: \n')
  })

  it('rejects piped input without starting a prompt', async () => {
    const tty = terminal()
    tty.input.isTTY = false
    await expect(readHiddenPassword('New password: ', tty.input, tty.output)).rejects.toThrow(/interactive terminal/)
    expect(tty.rawMode).not.toHaveBeenCalled()
    expect(tty.displayed()).toBe('')
  })
})
