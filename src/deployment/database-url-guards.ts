const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1'])

export function isLocalhostDatabaseUrl(databaseUrl: string): boolean {
  try {
    return LOCALHOST_HOSTS.has(new URL(databaseUrl).hostname.toLowerCase())
  } catch {
    return false
  }
}

export function parseDatabaseUrlHostname(databaseUrl: string): string | null {
  try {
    return new URL(databaseUrl).hostname
  } catch {
    return null
  }
}
