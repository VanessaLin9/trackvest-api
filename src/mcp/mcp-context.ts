import { DEFAULT_MCP_USER_ID } from './mcp.constants'

export function resolveOwnerUserId() {
  return process.env.MCP_DEFAULT_USER_ID || DEFAULT_MCP_USER_ID
}
