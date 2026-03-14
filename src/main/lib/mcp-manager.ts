import { readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { execClaude } from "./claude-cli"
import type { McpServerInfo, McpServerScope, McpTestResult, McpToolInfo, McpTransportType } from "@shared/types"

// ── Config file paths ───────────────────────────────────

function projectMcpPath(projectPath: string): string {
  return join(projectPath, ".mcp.json")
}

function userMcpPath(): string {
  return join(homedir(), ".claude.json")
}

// ── Config file parsing ─────────────────────────────────

interface McpJsonEntry {
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  headers?: Record<string, string>
  disabled?: boolean
  autoApprove?: string[]
  type?: string
}

interface McpJsonFile {
  mcpServers?: Record<string, McpJsonEntry>
}

interface ClaudeConfigFile {
  mcpServers?: Record<string, McpJsonEntry>
  projects?: Record<string, {
    mcpServers?: Record<string, McpJsonEntry>
  }>
}

async function readClaudeConfig(): Promise<ClaudeConfigFile | null> {
  try {
    const raw = await readFile(userMcpPath(), "utf-8")
    return JSON.parse(raw) as ClaudeConfigFile
  } catch {
    return null
  }
}

function inferTransport(entry: McpJsonEntry): McpTransportType {
  if (entry.type === "sse") return "sse"
  if (entry.type === "http") return "http"
  if (entry.url) {
    return entry.url.includes("/sse") ? "sse" : "http"
  }
  return "stdio"
}

function entryToServerInfo(name: string, entry: McpJsonEntry, scope: McpServerScope): McpServerInfo {
  const type = inferTransport(entry)
  return {
    name,
    scope,
    type,
    command: entry.command,
    args: entry.args,
    url: entry.url,
    env: entry.env,
    headers: entry.headers,
    disabled: entry.disabled,
    autoApprove: entry.autoApprove,
  }
}

async function readMcpJson(filePath: string): Promise<McpJsonFile | null> {
  try {
    const raw = await readFile(filePath, "utf-8")
    return JSON.parse(raw) as McpJsonFile
  } catch {
    return null
  }
}

async function writeMcpJson(filePath: string, data: McpJsonFile): Promise<void> {
  await writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8")
}

// ── Public API ──────────────────────────────────────────

export async function listMcpServers(projectPath?: string): Promise<McpServerInfo[]> {
  const servers: McpServerInfo[] = []

  // Local-scoped servers: {projectPath}/.mcp.json
  if (projectPath) {
    const localConfig = await readMcpJson(projectMcpPath(projectPath))
    if (localConfig?.mcpServers) {
      for (const [name, entry] of Object.entries(localConfig.mcpServers)) {
        servers.push(entryToServerInfo(name, entry, "local"))
      }
    }
  }

  // Read ~/.claude.json once for both project and user scopes
  const claudeConfig = await readClaudeConfig()
  if (claudeConfig) {
    // Project-scoped servers: ~/.claude.json → projects[projectPath].mcpServers
    if (projectPath && claudeConfig.projects?.[projectPath]?.mcpServers) {
      for (const [name, entry] of Object.entries(claudeConfig.projects[projectPath].mcpServers!)) {
        servers.push(entryToServerInfo(name, entry, "project"))
      }
    }

    // User-scoped servers: ~/.claude.json → mcpServers (top-level)
    if (claudeConfig.mcpServers) {
      for (const [name, entry] of Object.entries(claudeConfig.mcpServers)) {
        servers.push(entryToServerInfo(name, entry, "user"))
      }
    }
  }

  return servers
}

export async function listAllMcpServers(): Promise<McpServerInfo[]> {
  const servers: McpServerInfo[] = []
  const claudeConfig = await readClaudeConfig()
  if (!claudeConfig) return servers

  // User-scope (global)
  if (claudeConfig.mcpServers) {
    for (const [name, entry] of Object.entries(claudeConfig.mcpServers)) {
      servers.push(entryToServerInfo(name, entry, "user"))
    }
  }

  // Project-scope: iterate ALL projects
  if (claudeConfig.projects) {
    for (const [projectPath, projectConfig] of Object.entries(claudeConfig.projects)) {
      if (projectConfig.mcpServers) {
        for (const [name, entry] of Object.entries(projectConfig.mcpServers)) {
          servers.push({ ...entryToServerInfo(name, entry, "project"), projectPath })
        }
      }
    }
  }

  return servers
}

export async function addMcpServer(
  server: McpServerInfo,
  projectPath?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Claude CLI --scope: local (.mcp.json), project (~/.claude.json per-project), user (~/.claude.json global)
    const cliScope = server.scope

    // Build the JSON config for add-json
    const config: McpJsonEntry = {}
    if (server.type === "stdio") {
      if (server.command) config.command = server.command
      if (server.args?.length) config.args = server.args
    } else {
      if (server.url) config.url = server.url
      if (server.headers && Object.keys(server.headers).length > 0) config.headers = server.headers
    }
    if (server.env && Object.keys(server.env).length > 0) config.env = server.env

    const args = ["mcp", "add-json", server.name, JSON.stringify(config), "--scope", cliScope]
    const cwd = (cliScope === "local" || cliScope === "project") && projectPath ? projectPath : undefined
    await execClaude(args, { cwd, timeout: 10_000 })
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}

export async function removeMcpServer(
  name: string,
  scope: McpServerScope,
  projectPath?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const args = ["mcp", "remove", name, "--scope", scope]
    const cwd = (scope === "local" || scope === "project") && projectPath ? projectPath : undefined
    await execClaude(args, { cwd, timeout: 10_000 })
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}

export async function toggleMcpServer(
  name: string,
  scope: McpServerScope,
  disabled: boolean,
  projectPath?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (scope === "local") {
      // Local scope: {projectPath}/.mcp.json
      if (!projectPath) {
        return { success: false, error: "Project path required for local scope." }
      }
      const filePath = projectMcpPath(projectPath)
      const config = await readMcpJson(filePath)
      if (!config?.mcpServers?.[name]) {
        return { success: false, error: `Server "${name}" not found in local config.` }
      }
      if (disabled) {
        config.mcpServers[name].disabled = true
      } else {
        delete config.mcpServers[name].disabled
      }
      await writeMcpJson(filePath, config)
    } else {
      // Project or user scope: both live in ~/.claude.json
      const filePath = userMcpPath()
      const raw = await readFile(filePath, "utf-8").catch(() => "{}")
      const claudeConfig = JSON.parse(raw) as ClaudeConfigFile

      if (scope === "project") {
        if (!projectPath) {
          return { success: false, error: "Project path required for project scope." }
        }
        const entry = claudeConfig.projects?.[projectPath]?.mcpServers?.[name]
        if (!entry) {
          return { success: false, error: `Server "${name}" not found in project config.` }
        }
        if (disabled) {
          entry.disabled = true
        } else {
          delete entry.disabled
        }
      } else {
        // user scope
        const entry = claudeConfig.mcpServers?.[name]
        if (!entry) {
          return { success: false, error: `Server "${name}" not found in user config.` }
        }
        if (disabled) {
          entry.disabled = true
        } else {
          delete entry.disabled
        }
      }

      await writeFile(filePath, JSON.stringify(claudeConfig, null, 2) + "\n", "utf-8")
    }

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}

export async function updateMcpServer(
  name: string,
  server: McpServerInfo,
  projectPath?: string,
): Promise<{ success: boolean; error?: string }> {
  // Remove old, then add new
  const removeResult = await removeMcpServer(name, server.scope, projectPath)
  if (!removeResult.success) return removeResult
  return addMcpServer(server, projectPath)
}

// ── Phase 2: Testing & Discovery ────────────────────────

export async function testMcpServer(
  name: string,
  scope: McpServerScope,
  projectPath?: string,
): Promise<McpTestResult> {
  const start = Date.now()
  try {
    const args = ["mcp", "get", name, "--scope", scope]
    const cwd = (scope === "local" || scope === "project") && projectPath ? projectPath : undefined
    const { stdout } = await execClaude(args, { cwd, timeout: 30_000 })
    const latencyMs = Date.now() - start

    // Parse tool list from output
    const tools = parseToolsFromGetOutput(stdout, name)
    return { healthy: true, tools, latencyMs }
  } catch (error) {
    const latencyMs = Date.now() - start
    const message = error instanceof Error ? error.message : String(error)
    return { healthy: false, tools: [], error: message, latencyMs }
  }
}

function parseToolsFromGetOutput(stdout: string, serverName: string): McpToolInfo[] {
  const tools: McpToolInfo[] = []

  // `claude mcp get` outputs a list of tools, typically one per line
  // Format varies but commonly: "tool_name - description" or just tool names
  const lines = stdout.split("\n").filter((line) => line.trim())

  for (const line of lines) {
    const trimmed = line.trim()
    // Skip header/metadata lines
    if (trimmed.startsWith("Server:") || trimmed.startsWith("Type:") || trimmed.startsWith("Command:") || trimmed.startsWith("URL:") || trimmed.startsWith("Status:") || trimmed.startsWith("Tools")) continue
    if (trimmed === "" || trimmed === "---") continue

    // Try "- tool_name: description" format
    const dashMatch = trimmed.match(/^[-*]\s+(\S+?)(?::\s*(.*))?$/)
    if (dashMatch) {
      const toolName = dashMatch[1]
      const description = dashMatch[2]?.trim() || undefined
      tools.push({
        name: toolName,
        serverName,
        qualifiedName: `mcp__${serverName}__${toolName}`,
        description,
      })
      continue
    }

    // Try "tool_name - description" format
    const separatorMatch = trimmed.match(/^(\S+)\s+[-–]\s+(.*)$/)
    if (separatorMatch) {
      tools.push({
        name: separatorMatch[1],
        serverName,
        qualifiedName: `mcp__${serverName}__${separatorMatch[1]}`,
        description: separatorMatch[2].trim() || undefined,
      })
    }
  }

  return tools
}

export async function discoverMcpTools(
  serverName?: string,
  projectPath?: string,
): Promise<McpToolInfo[]> {
  const servers = await listMcpServers(projectPath)
  const targets = serverName
    ? servers.filter((s) => s.name === serverName && !s.disabled)
    : servers.filter((s) => !s.disabled)

  const allTools: McpToolInfo[] = []

  for (const server of targets) {
    const result = await testMcpServer(server.name, server.scope, projectPath)
    if (result.healthy) {
      allTools.push(...result.tools)
    }
  }

  return allTools
}
