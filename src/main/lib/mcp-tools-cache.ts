import type { McpToolInfo } from "@shared/types"

const TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheEntry {
  tools: McpToolInfo[]
  storedAt: number
}

const cache = new Map<string, CacheEntry>()

export function getCachedTools(serverName: string): McpToolInfo[] | null {
  const entry = cache.get(serverName)
  if (!entry) return null
  if (Date.now() - entry.storedAt > TTL_MS) {
    cache.delete(serverName)
    return null
  }
  return entry.tools
}

export function setCachedTools(serverName: string, tools: McpToolInfo[]): void {
  cache.set(serverName, { tools, storedAt: Date.now() })
}

export function invalidateCache(serverName?: string): void {
  if (serverName) {
    cache.delete(serverName)
  } else {
    cache.clear()
  }
}

export function getAllCachedTools(): McpToolInfo[] {
  const now = Date.now()
  const all: McpToolInfo[] = []
  for (const [key, entry] of cache) {
    if (now - entry.storedAt > TTL_MS) {
      cache.delete(key)
      continue
    }
    all.push(...entry.tools)
  }
  return all
}
