/** True only when the env var is exactly the string "true". */
export function isEnvFlagTrue(name: string): boolean {
  return process.env[name] === 'true'
}
