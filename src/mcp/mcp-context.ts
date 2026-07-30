import { DEFAULT_MCP_USER_ID } from './mcp.constants'

/** MCP 目前無登入；以 env／預設 user 當資料 owner（PR #8）。 */
export function resolveOwnerUserId() {
  return process.env.MCP_DEFAULT_USER_ID || DEFAULT_MCP_USER_ID
}
