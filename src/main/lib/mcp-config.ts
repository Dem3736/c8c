import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"

export type WebSearchBackend = "builtin" | "exa"

interface McpServerEntry {
  command?: string
  args?: string[]
  env?: Record<string, string>
  disabled?: boolean
  autoApprove?: string[]
  [key: string]: unknown
}

interface McpConfig {
  mcpServers: Record<string, McpServerEntry>
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeMcpConfig(raw: unknown): McpConfig | null {
  if (!isObject(raw)) return null

  const nested = raw.mcpServers
  if (isObject(nested)) {
    return { mcpServers: nested as Record<string, McpServerEntry> }
  }

  const flatEntries = Object.entries(raw).filter(([key, value]) => key !== "mcpServers" && isObject(value))
  if (flatEntries.length === 0) return null

  const mcpServers: Record<string, McpServerEntry> = {}
  for (const [name, entry] of flatEntries) {
    mcpServers[name] = entry as McpServerEntry
  }
  return { mcpServers }
}

async function readMcpConfig(filePath: string): Promise<McpConfig | null> {
  try {
    const raw = await readFile(filePath, "utf-8")
    const parsed = JSON.parse(raw) as unknown
    return normalizeMcpConfig(parsed)
  } catch {
    return null
  }
}

function findUpwards(startDir: string, relativePath: string): string | undefined {
  let dir = resolve(startDir)
  while (true) {
    const candidate = join(dir, relativePath)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

function resolveExaProxyScriptPath(): string | undefined {
  const candidates = [
    resolve(process.cwd(), "node_modules/@claude-tools/mcp-search-proxy/dist/exa.js"),
    resolve(process.cwd(), "packages/shared-claude-tools/packages/mcp-search-proxy/dist/exa.js"),
    resolve(process.resourcesPath || "", "app.asar.unpacked/node_modules/@claude-tools/mcp-search-proxy/dist/exa.js"),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

function resolveMcpKeyringPath(projectPath?: string): string | undefined {
  const fromEnv = process.env.MCP_KEYRING_PATH?.trim()
  if (fromEnv && existsSync(fromEnv)) return fromEnv

  const candidates: Array<string | undefined> = [
    projectPath ? findUpwards(projectPath, "data/config/mcp-keyring.json") : undefined,
    projectPath ? findUpwards(projectPath, "data/mcp-keyring.json") : undefined,
    findUpwards(process.cwd(), "data/config/mcp-keyring.json"),
    findUpwards(process.cwd(), "data/mcp-keyring.json"),
    resolve(process.cwd(), "../agents-os/data/config/mcp-keyring.json"),
    resolve(process.cwd(), "../agent-os/data/config/mcp-keyring.json"),
  ]

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return undefined
}

function withExaServer(config: McpConfig, projectPath?: string): McpConfig {
  const exaProxyPath = resolveExaProxyScriptPath()
  if (!exaProxyPath) return config

  const existing = config.mcpServers.exa
  const existingEnv = isObject(existing?.env)
    ? (existing?.env as Record<string, string>)
    : {}
  const keyringPath = resolveMcpKeyringPath(projectPath)
  const runtimeEnv: Record<string, string> = {
    ...existingEnv,
  }
  // In Electron main process, process.execPath points to the app binary.
  // Force Node mode so MCP proxy starts as a headless script process, not a GUI instance.
  runtimeEnv.ELECTRON_RUN_AS_NODE = "1"
  if (keyringPath) {
    runtimeEnv.MCP_KEYRING_PATH = keyringPath
  }

  config.mcpServers.exa = {
    ...(isObject(existing) ? existing : {}),
    command: process.execPath,
    args: [exaProxyPath],
    env: runtimeEnv,
  }

  return config
}

export function buildClaudeExtraArgs(mcpConfigPath?: string): string[] {
  const args = ["--verbose", "--output-format", "stream-json"]
  if (mcpConfigPath) {
    args.push(`--mcp-config=${mcpConfigPath}`)
  }
  return args
}

export async function prepareWorkspaceMcpConfig(
  workspace: string,
  projectPath?: string,
  backend?: WebSearchBackend,
): Promise<string | undefined> {
  const workspaceMcpPath = join(workspace, ".mcp.json")
  const sources = [
    projectPath ? join(projectPath, ".mcp.json") : undefined,
    workspaceMcpPath,
  ].filter((value): value is string => Boolean(value))

  let config: McpConfig | null = null
  for (const sourcePath of sources) {
    if (!existsSync(sourcePath)) continue
    const loaded = await readMcpConfig(sourcePath)
    if (loaded) {
      config = loaded
      break
    }
  }

  if (backend === "exa") {
    config = withExaServer(config ?? { mcpServers: {} }, projectPath)
  }

  if (!config) return undefined

  await writeFile(workspaceMcpPath, JSON.stringify(config, null, 2), "utf-8")
  return workspaceMcpPath
}
