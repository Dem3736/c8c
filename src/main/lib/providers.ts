import { spawn } from "node:child_process"
import type {
  AgentExecutionHandle,
  AgentProvider,
  AgentRunOptions,
  AgentRunResult,
  McpMutationResult,
  McpProvider,
  McpServerInfo,
  McpServerScope,
  McpTestResult,
  McpToolInfo,
  ProviderAuthStatus,
  ProviderHealth,
  ProviderId,
  SafetyProfile,
} from "@shared/types"
import { resolveSafetyProfile } from "@shared/provider-metadata"
import { spawnClaude, type ClaudeSpawnOptions } from "@claude-tools/runner"
import { createLegacyExecutionHandle } from "./agent-execution"
import { createClaudeSdkExecutionHandle } from "./claude-sdk-runtime"
import { getClaudeCodeSubscriptionStatus } from "./claude-subscription"
import { execClaude, findClaudeExecutable } from "./claude-cli"
import { buildCodexEnv, execCodex, findCodexExecutable } from "./codex-cli"
import {
  createCodexJsonNormalizerState,
  normalizeCodexJsonLine,
} from "./codex-json-normalizer"
import { getCodexApiKey, getProviderSettings } from "./provider-settings"
import {
  addMcpServer,
  discoverMcpTools,
  listAllMcpServers,
  listMcpServers,
  removeMcpServer,
  testMcpServer,
  toggleMcpServer,
  updateMcpServer,
} from "./mcp-manager"

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function execErrorOutput(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const stdout = "stdout" in error && typeof error.stdout === "string" ? error.stdout : ""
    const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr : ""
    const combined = [stdout, stderr].filter(Boolean).join("\n").trim()
    if (combined) return combined
  }
  return errorMessage(error)
}

function normalizeCliText(text: string): string {
  return text
    .replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function toClaudeSpawnOptions(options: AgentRunOptions): ClaudeSpawnOptions {
  return {
    ...options,
    onStdout: options.onStdout ? (data) => options.onStdout?.(data) : undefined,
    onStderr: options.onStderr ? (data) => options.onStderr?.(data) : undefined,
  }
}

function buildCodexToolPolicyPrefix(options: AgentRunOptions): string {
  const sections: string[] = []
  if (options.systemPrompts?.length) {
    sections.push(options.systemPrompts.join("\n\n"))
  }
  if (options.allowedTools?.length) {
    sections.push(`Allowed tools: ${options.allowedTools.join(", ")}.`)
  }
  if (options.disallowedTools?.length) {
    sections.push(`Disallowed tools: ${options.disallowedTools.join(", ")}. Never use them.`)
  }
  if (sections.length === 0) return options.prompt
  return `${sections.join("\n\n")}\n\n${options.prompt}`
}

function codexSafetyArgs(profile: SafetyProfile): string[] {
  switch (profile) {
    case "safe_readonly":
      return ["--sandbox", "read-only", "--ask-for-approval", "on-request"]
    case "workspace_untrusted":
      return ["--sandbox", "workspace-write", "--ask-for-approval", "untrusted"]
    case "ci_readonly":
      return ["--sandbox", "read-only", "--ask-for-approval", "never"]
    case "dangerous":
      return ["--dangerously-bypass-approvals-and-sandbox"]
    case "workspace_auto":
    default:
      return ["--sandbox", "workspace-write", "--ask-for-approval", "on-request"]
  }
}

async function checkClaudeAvailability(): Promise<ProviderHealth> {
  const executablePath = findClaudeExecutable() || undefined

  try {
    const { stdout, stderr } = await execClaude(["--version"], { timeout: 5_000 })
    const version = `${stdout}\n${stderr}`
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean)

    return {
      provider: "claude",
      available: true,
      executablePath,
      version,
      error: null,
    }
  } catch (error) {
    return {
      provider: "claude",
      available: false,
      executablePath,
      error: errorMessage(error) || "Claude CLI is not available.",
    }
  }
}

async function checkCodexAvailability(): Promise<ProviderHealth> {
  const executablePath = findCodexExecutable() || undefined

  try {
    const { stdout, stderr } = await execCodex(["--version"], { timeout: 5_000 })
    const version = `${stdout}\n${stderr}`
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("WARNING:"))

    return {
      provider: "codex",
      available: true,
      executablePath,
      version,
      error: null,
    }
  } catch (error) {
    return {
      provider: "codex",
      available: false,
      executablePath,
      error: errorMessage(error) || "Codex CLI is not available.",
    }
  }
}

export function isCodexHeadlessAuthCheckError(text: string): boolean {
  const normalized = normalizeCliText(text).toLowerCase()
  return normalized.includes("raw mode is not supported")
    || normalized.includes("could not report auth status in non-interactive mode")
    || normalized.includes("sign in with chatgpt")
    || normalized.includes("paste an api key")
}

export function sanitizeCodexAuthError(text: string): string {
  const normalized = normalizeCliText(text)
  if (!normalized) {
    return "Codex CLI is not authenticated."
  }

  if (isCodexHeadlessAuthCheckError(normalized)) {
    return "Codex CLI could not report auth status in non-interactive mode. This Codex version may require a real terminal for `codex login status`."
  }

  if (/not authenticated|not logged in|login required|please log in|unauthorized|forbidden|401/i.test(normalized)) {
    return "Codex CLI is not authenticated."
  }

  return normalized
}

export function parseCodexAuth(output: string, apiKeyConfigured: boolean): ProviderAuthStatus {
  const normalized = normalizeCliText(output)
  if (/logged in using chatgpt/i.test(normalized)) {
    return {
      provider: "codex",
      authenticated: true,
      authMethod: "chatgpt",
      accountLabel: "ChatGPT",
      apiKeyConfigured,
      error: null,
    }
  }

  if (/logged in using api key/i.test(normalized)) {
    return {
      provider: "codex",
      authenticated: true,
      authMethod: "api_key",
      accountLabel: "CLI API key",
      apiKeyConfigured,
      error: null,
    }
  }

  if (apiKeyConfigured) {
    return {
      provider: "codex",
      authenticated: true,
      authMethod: "api_key",
      accountLabel: "App-managed CODEX_API_KEY",
      apiKeyConfigured: true,
      error: null,
    }
  }

  return {
    provider: "codex",
    authenticated: false,
    authMethod: null,
    accountLabel: null,
    apiKeyConfigured: false,
    error: sanitizeCodexAuthError(normalized),
  }
}

async function fallbackCodexAuthStatus(apiKeyConfigured: boolean): Promise<ProviderAuthStatus | null> {
  try {
    await execCodex(["mcp", "list", "--json"], { timeout: 10_000 })
    return {
      provider: "codex",
      authenticated: true,
      authMethod: apiKeyConfigured ? "api_key" : "chatgpt",
      accountLabel: apiKeyConfigured
        ? "App-managed CODEX_API_KEY"
        : "ChatGPT subscription",
      apiKeyConfigured,
      error: null,
    }
  } catch (error) {
    const message = sanitizeCodexAuthError(execErrorOutput(error))
    if (/not authenticated|login required|unauthorized|forbidden|401/i.test(message)) {
      return {
        provider: "codex",
        authenticated: false,
        authMethod: null,
        accountLabel: null,
        apiKeyConfigured,
        error: message,
      }
    }
    return null
  }
}

interface CodexMcpTransport {
  type?: string
  url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  bearer_token_env_var?: string | null
  http_headers?: Record<string, string> | null
}

interface CodexMcpServer {
  name: string
  enabled?: boolean
  disabled_reason?: string | null
  transport?: CodexMcpTransport
  enabled_tools?: string[] | null
  disabled_tools?: string[] | null
}

function codexTransportType(transport?: CodexMcpTransport): McpServerInfo["type"] {
  if (!transport) return "stdio"
  if (transport.type === "streamable_http" || transport.type === "http") return "http"
  if (transport.type === "sse") return "sse"
  return "stdio"
}

function codexServerToInfo(server: CodexMcpServer): McpServerInfo {
  return {
    name: server.name,
    provider: "codex",
    scope: "user",
    type: codexTransportType(server.transport),
    command: server.transport?.command,
    args: server.transport?.args,
    url: server.transport?.url,
    env: server.transport?.env,
    headers: server.transport?.http_headers || undefined,
    disabled: server.enabled === false,
  }
}

async function listCodexServers(): Promise<CodexMcpServer[]> {
  const { stdout } = await execCodex(["mcp", "list", "--json"], { timeout: 10_000 })
  const parsed = JSON.parse(stdout) as unknown
  return Array.isArray(parsed) ? parsed.filter((item): item is CodexMcpServer => Boolean(item && typeof item === "object")) : []
}

async function getCodexServer(name: string): Promise<CodexMcpServer> {
  const { stdout } = await execCodex(["mcp", "get", name, "--json"], { timeout: 10_000 })
  return JSON.parse(stdout) as CodexMcpServer
}

class ClaudeAgentProvider implements AgentProvider {
  readonly id = "claude" as const

  checkAvailability(): Promise<ProviderHealth> {
    return checkClaudeAvailability()
  }

  async getAuthStatus(): Promise<ProviderAuthStatus> {
    const status = await getClaudeCodeSubscriptionStatus()
    return {
      provider: "claude",
      authenticated: status.loggedIn,
      authMethod: status.authMethod,
      accountLabel: status.apiProvider,
      error: status.error,
    }
  }

  async runInteractive(options: AgentRunOptions): Promise<AgentRunResult> {
    return spawnClaude(toClaudeSpawnOptions(options))
  }

  async runTask(options: AgentRunOptions): Promise<AgentRunResult> {
    return spawnClaude(toClaudeSpawnOptions(options))
  }

  async executeInteractive(options: AgentRunOptions): Promise<AgentExecutionHandle> {
    try {
      return await createClaudeSdkExecutionHandle(options)
    } catch {
      return createLegacyExecutionHandle(this.id, options, this.runInteractive.bind(this))
    }
  }

  async executeTask(options: AgentRunOptions): Promise<AgentExecutionHandle> {
    try {
      return await createClaudeSdkExecutionHandle(options)
    } catch {
      return createLegacyExecutionHandle(this.id, options, this.runTask.bind(this))
    }
  }

  cancel(_sessionId: string): boolean {
    return false
  }
}

class CodexAgentProvider implements AgentProvider {
  readonly id = "codex" as const

  checkAvailability(): Promise<ProviderHealth> {
    return checkCodexAvailability()
  }

  async getAuthStatus(): Promise<ProviderAuthStatus> {
    const apiKeyConfigured = Boolean(await getCodexApiKey())
    try {
      const { stdout, stderr } = await execCodex(["login", "status"], { timeout: 10_000 })
      const parsed = parseCodexAuth([stdout, stderr].filter(Boolean).join("\n"), apiKeyConfigured)
      if (!parsed.authenticated && isCodexHeadlessAuthCheckError(parsed.error || "")) {
        return await fallbackCodexAuthStatus(apiKeyConfigured) ?? parsed
      }
      return parsed
    } catch (error) {
      const message = sanitizeCodexAuthError(execErrorOutput(error))
      if (isCodexHeadlessAuthCheckError(message)) {
        const fallback = await fallbackCodexAuthStatus(apiKeyConfigured)
        if (fallback) return fallback
      }

      if (apiKeyConfigured) {
        return {
          provider: "codex",
          authenticated: true,
          authMethod: "api_key",
          accountLabel: "App-managed CODEX_API_KEY",
          apiKeyConfigured: true,
          error: null,
        }
      }

      return {
        provider: "codex",
        authenticated: false,
        authMethod: null,
        accountLabel: null,
        apiKeyConfigured,
        error: message,
      }
    }
  }

  async runInteractive(options: AgentRunOptions): Promise<AgentRunResult> {
    return this.runCodex(options)
  }

  async runTask(options: AgentRunOptions): Promise<AgentRunResult> {
    return this.runCodex(options)
  }

  cancel(_sessionId: string): boolean {
    return false
  }

  private async runCodex(options: AgentRunOptions): Promise<AgentRunResult> {
    const executable = findCodexExecutable() || "codex"
    const settings = await getProviderSettings()
    const safetyProfile = resolveSafetyProfile(
      options.executionMode,
      options.safetyProfile || settings.safetyProfile,
    )
    const prompt = buildCodexToolPolicyPrefix(options)
    const args: string[] = [
      "exec",
      "--json",
      "--ephemeral",
      "--color",
      "never",
      "--skip-git-repo-check",
      "-C",
      options.workdir,
      ...codexSafetyArgs(safetyProfile),
    ]

    if (options.model) {
      args.push("-m", options.model)
    }

    for (const dir of options.addDirs || []) {
      if (!dir) continue
      args.push("--add-dir", dir)
    }

    if (options.extraArgs?.length) {
      args.push(...options.extraArgs)
    }

    args.push(prompt)

    const env = await buildCodexEnv(options.extraEnv)

    return new Promise<AgentRunResult>((resolve, reject) => {
      const startedAt = Date.now()
      const child = spawn(executable, args, {
        cwd: options.workdir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      })
      const normalizerState = createCodexJsonNormalizerState()
      let stdoutBuffer = ""
      let killed = false
      let aborted = Boolean(options.abortSignal?.aborted)

      if (child.pid) {
        options.onSpawn?.(child.pid)
      }

      const onAbort = () => {
        aborted = true
        if (child.killed) return
        killed = child.kill("SIGTERM")
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL")
          }
        }, 2_000).unref()
      }

      if (options.abortSignal) {
        if (options.abortSignal.aborted) {
          onAbort()
        } else {
          options.abortSignal.addEventListener("abort", onAbort, { once: true })
        }
      }

      child.stdout.on("data", (data: Buffer) => {
        stdoutBuffer += data.toString()
        const lines = stdoutBuffer.split(/\r?\n/)
        stdoutBuffer = lines.pop() || ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          const normalized = normalizeCodexJsonLine(trimmed, normalizerState)
          if (normalized.length === 0) {
            options.onStderr?.(Buffer.from(`${trimmed}\n`))
            continue
          }

          for (const eventLine of normalized) {
            options.onStdout?.(Buffer.from(`${eventLine}\n`))
          }
        }
      })

      child.stderr.on("data", (data: Buffer) => {
        options.onStderr?.(data)
      })

      child.on("error", (error) => {
        reject(error)
      })

      child.on("close", (code, signal) => {
        if (stdoutBuffer.trim()) {
          const normalized = normalizeCodexJsonLine(stdoutBuffer.trim(), normalizerState)
          for (const eventLine of normalized) {
            options.onStdout?.(Buffer.from(`${eventLine}\n`))
          }
        }

        resolve({
          success: code === 0 && !aborted,
          exitCode: code,
          signal,
          killed: killed || child.killed,
          aborted,
          durationMs: Date.now() - startedAt,
          pid: child.pid,
        })
      })
    })
  }
}

class ClaudeMcpProvider implements McpProvider {
  readonly id = "claude" as const

  async listServers(scope?: McpServerScope, projectPath?: string): Promise<McpServerInfo[]> {
    const servers = await listMcpServers(projectPath)
    const withProvider = servers.map((server) => ({ ...server, provider: "claude" as const }))
    return scope ? withProvider.filter((server) => server.scope === scope) : withProvider
  }

  async listAllServers(): Promise<McpServerInfo[]> {
    const servers = await listAllMcpServers()
    return servers.map((server) => ({ ...server, provider: "claude" as const }))
  }

  addServer(server: McpServerInfo, projectPath?: string): Promise<McpMutationResult> {
    return addMcpServer(server, projectPath)
  }

  updateServer(name: string, server: McpServerInfo, projectPath?: string): Promise<McpMutationResult> {
    return updateMcpServer(name, server, projectPath)
  }

  removeServer(name: string, scope: McpServerScope, projectPath?: string): Promise<McpMutationResult> {
    return removeMcpServer(name, scope, projectPath)
  }

  toggleServer(
    name: string,
    scope: McpServerScope,
    disabled: boolean,
    projectPath?: string,
  ): Promise<McpMutationResult> {
    return toggleMcpServer(name, scope, disabled, projectPath)
  }

  testServer(name: string, scope: McpServerScope, projectPath?: string): Promise<McpTestResult> {
    return testMcpServer(name, scope, projectPath)
  }

  async discoverTools(serverName?: string, projectPath?: string): Promise<McpToolInfo[]> {
    const tools = await discoverMcpTools(serverName, projectPath)
    return tools.map((tool) => ({ ...tool, provider: "claude" as const }))
  }
}

class CodexMcpProvider implements McpProvider {
  readonly id = "codex" as const

  async listServers(scope?: McpServerScope): Promise<McpServerInfo[]> {
    if (scope && scope !== "user") return []
    const servers = await listCodexServers()
    return servers.map(codexServerToInfo)
  }

  listAllServers(): Promise<McpServerInfo[]> {
    return this.listServers()
  }

  async addServer(server: McpServerInfo, _projectPath?: string): Promise<McpMutationResult> {
    try {
      const args = ["mcp", "add", server.name]
      if (server.type === "stdio") {
        for (const [key, value] of Object.entries(server.env || {})) {
          args.push("--env", `${key}=${value}`)
        }
        args.push("--")
        args.push(server.command || "")
        args.push(...(server.args || []))
      } else {
        args.push("--url", server.url || "")
      }

      await execCodex(args, { timeout: 15_000 })
      return { success: true }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  }

  async updateServer(name: string, server: McpServerInfo, _projectPath?: string): Promise<McpMutationResult> {
    const removed = await this.removeServer(name, server.scope, undefined)
    if (!removed.success) return removed
    return this.addServer(server, undefined)
  }

  async removeServer(name: string, _scope: McpServerScope, _projectPath?: string): Promise<McpMutationResult> {
    try {
      await execCodex(["mcp", "remove", name], { timeout: 10_000 })
      return { success: true }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  }

  async toggleServer(
    _name: string,
    _scope: McpServerScope,
    _disabled: boolean,
    _projectPath?: string,
  ): Promise<McpMutationResult> {
    return {
      success: false,
      error: "Codex CLI does not currently support enabling or disabling MCP servers in place. Remove or re-add the server instead.",
    }
  }

  async testServer(name: string, _scope: McpServerScope, _projectPath?: string): Promise<McpTestResult> {
    const startedAt = Date.now()
    try {
      const server = await getCodexServer(name)
      const tools = Array.isArray(server.enabled_tools)
        ? server.enabled_tools.map((toolName) => ({
            name: toolName,
            serverName: name,
            qualifiedName: `mcp__${name}__${toolName}`,
            provider: "codex" as const,
          }))
        : []

      return {
        healthy: server.enabled !== false,
        tools,
        latencyMs: Date.now() - startedAt,
      }
    } catch (error) {
      return {
        healthy: false,
        tools: [],
        error: errorMessage(error),
        latencyMs: Date.now() - startedAt,
      }
    }
  }

  async discoverTools(serverName?: string): Promise<McpToolInfo[]> {
    if (serverName) {
      return (await this.testServer(serverName, "user", undefined)).tools
    }

    const servers = await listCodexServers()
    const tools: McpToolInfo[] = []
    for (const server of servers) {
      if (!Array.isArray(server.enabled_tools)) continue
      for (const toolName of server.enabled_tools) {
        tools.push({
          name: toolName,
          serverName: server.name,
          qualifiedName: `mcp__${server.name}__${toolName}`,
          provider: "codex",
        })
      }
    }
    return tools
  }
}

const claudeAgentProvider = new ClaudeAgentProvider()
const codexAgentProvider = new CodexAgentProvider()
const claudeMcpProvider = new ClaudeMcpProvider()
const codexMcpProvider = new CodexMcpProvider()

export function resolveAgentProvider(providerId: ProviderId): AgentProvider {
  if (providerId === "claude") return claudeAgentProvider
  if (providerId === "codex") return codexAgentProvider
  throw new Error(`Agent provider "${providerId}" is not implemented.`)
}

export function resolveMcpProvider(providerId: ProviderId): McpProvider {
  if (providerId === "claude") return claudeMcpProvider
  if (providerId === "codex") return codexMcpProvider
  throw new Error(`MCP provider "${providerId}" is not implemented.`)
}
