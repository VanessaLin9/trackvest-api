/** 僅當 env 字串恰為 `"true"` 才算開啟（PR #27）；其他值一律 false。 */
export function isEnvFlagTrue(name: string): boolean {
  return process.env[name] === 'true'
}
