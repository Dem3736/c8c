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
import { createErroredExecutionHandle, createLegacyExecutionHandle } from "./agent-execution"
import { createClaudeSdkExecutionHandle } from "./claude-sdk-runtime"
import {
  canUseCodexAcpExecution,
  createCodexAcpExecutionHandle,
  probeCodexAcpAuthStatus,
} from "./codex-acp-runtime"
import { getClaudeCodeSubscriptionStatus } from "./claude-subscription"
import { execClaude, findClaudeExecutable } from "./claude-cli"
import { buildCodexEnv, execCodex, findCodexExecutable, supportsCodexExecSubcommand } from "./codex-cli"
import {
  createCodexJsonNormalizerState,
  normalizeCodexJsonLine,
} from "./codex-json-normalizer"
import { buildProviderExtraArgs } from "./mcp-config"
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
import { logInfo, logWarn } from "./structured-log"

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
  const legacyExtraArgs = [
    ...buildProviderExtraArgs("claude", options.mcpConfigPath),
    ...(options.disableSlashCommands ? ["--disable-slash-commands"] : []),
    ...(options.disableBuiltInTools ? ["--tools", ""] : []),
    ...(options.systemPrompts?.length
      ? ["--append-system-prompt", options.systemPrompts.join("\n\n")]
      : []),
    ...(options.extraArgs || []),
  ]

  return {
    ...options,
    extraArgs: legacyExtraArgs,
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

export function isCodexInteractiveEditorNoise(text: string): boolean {
  const normalized = normalizeCliText(text)
  if (!normalized) return false

  return normalized.includes("Vim: Warning:")
    || normalized.includes("E325: ATTENTION")
    || normalized.includes("Swap file")
    || normalized.includes(".codex/instructions.md")
}

export function summarizeCodexInteractiveEditorNoise(text: string): string {
  const normalized = normalizeCliText(text)
  const swapMatch = normalized.match(/swap file\s+"?([^"\s]+)"?/i)
  const swapFile = swapMatch?.[1] || null
  const swapSuffix = swapFile ? ` Swap file: ${swapFile}.` : ""

  return `Codex CLI attempted to open ~/.codex/instructions.md in an interactive editor during headless legacy execution.${swapSuffix}`
}

export function parseCodexAuth(output: string, apiKeyConfigured: boolean): ProviderAuthStatus {
  const normalized = normalizeCliText(output)
  if (/logged in using chatgpt/i.test(normalized)) {
    return {
      provider: "codex",
      state: "authenticated",
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
      state: "authenticated",
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
      state: "authenticated",
      authenticated: true,
      authMethod: "api_key",
      accountLabel: "App-managed CODEX_API_KEY",
      apiKeyConfigured: true,
      error: null,
    }
  }

  return {
    provider: "codex",
    state: isCodexHeadlessAuthCheckError(normalized) ? "unknown" : "unauthenticated",
    authenticated: false,
    authMethod: null,
    accountLabel: null,
    apiKeyConfigured,
    error: sanitizeCodexAuthError(normalized),
  }
}

async function fallbackCodexAuthStatus(apiKeyConfigured: boolean): Promise<ProviderAuthStatus | null> {
  try {
    await execCodex(["mcp", "list", "--json"], { timeout: 10_000 })
    return {
      provider: "codex",
      state: "authenticated",
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
        state: "unauthenticated",
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
      state: status.loggedIn ? "authenticated" : "unauthenticated",
      authenticated: status.loggedIn,
      authMethod: status.authMethod,
      accountLabel: status.apiProvider,
      error: status.error,
    }
  }

  private async runLegacyClaude(options: AgentRunOptions): Promise<AgentRunResult> {
    return spawnClaude(toClaudeSpawnOptions(options))
  }

  async executeInteractive(options: AgentRunOptions): Promise<AgentExecutionHandle> {
    try {
      return await createClaudeSdkExecutionHandle(options)
    } catch {
      return createLegacyExecutionHandle(this.id, "claude_cli", options, this.runLegacyClaude.bind(this))
    }
  }

  async executeTask(options: AgentRunOptions): Promise<AgentExecutionHandle> {
    try {
      return await createClaudeSdkExecutionHandle(options)
    } catch {
      return createLegacyExecutionHandle(this.id, "claude_cli", options, this.runLegacyClaude.bind(this))
    }
  }

  cancel(_sessionId: string): boolean {
    return false
  }
}

class CodexAgentProvider implements AgentProvider {
  readonly id = "codex" as const

  private async createCodexLegacyUnavailableHandle(
    mode: "interactive" | "task",
    reason: string,
  ): Promise<AgentExecutionHandle> {
    const message = `Codex ACP could not be used (${reason}), and the installed Codex CLI does not support the legacy \`codex exec\` backend. Restart on a build with ACP working, or upgrade the Codex CLI fallback implementation.`
    logWarn("codex-provider", "legacy-exec-unavailable", { mode, reason, message })
    return createErroredExecutionHandle(this.id, "codex_exec", message)
  }

  checkAvailability(): Promise<ProviderHealth> {
    return checkCodexAvailability()
  }

  async getAuthStatus(): Promise<ProviderAuthStatus> {
    const apiKeyConfigured = Boolean(await getCodexApiKey())
    const acpProbe = await probeCodexAcpAuthStatus()
    if (acpProbe.state !== "unknown") {
      return acpProbe
    }

    try {
      const { stdout, stderr } = await execCodex(["login", "status"], { timeout: 10_000 })
      const parsed = parseCodexAuth([stdout, stderr].filter(Boolean).join("\n"), apiKeyConfigured)
      if (parsed.state === "unknown") {
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
          state: "authenticated",
          authenticated: true,
          authMethod: "api_key",
          accountLabel: "App-managed CODEX_API_KEY",
          apiKeyConfigured: true,
          error: null,
        }
      }

      const isUnauthenticated = /not authenticated|login required|unauthorized|forbidden|401/i.test(message)
      return {
        provider: "codex",
        state: isUnauthenticated ? "unauthenticated" : "unknown",
        authenticated: false,
        authMethod: null,
        accountLabel: null,
        apiKeyConfigured,
        error: isUnauthenticated ? message : (acpProbe.error || message),
      }
    }
  }

  private async createExecutionHandle(
    mode: "interactive" | "task",
    options: AgentRunOptions,
  ): Promise<AgentExecutionHandle> {
    const settings = await getProviderSettings()
    const support = canUseCodexAcpExecution(options, settings.safetyProfile)

    logInfo("codex-provider", "backend-selection", {
      mode,
      workdir: options.workdir,
      model: options.model ?? null,
      executionMode: options.executionMode ?? null,
      requestedSafetyProfile: options.safetyProfile ?? null,
      configuredSafetyProfile: settings.safetyProfile,
      addDirCount: options.addDirs?.length ?? 0,
      hasMcpConfigPath: Boolean(options.mcpConfigPath),
      acpSupported: support.supported,
      acpUnsupportedReason: support.reason ?? null,
    })

    if (!support.supported) {
      if (!(await supportsCodexExecSubcommand())) {
        return this.createCodexLegacyUnavailableHandle(mode, support.reason ?? "ACP unsupported")
      }
      logWarn("codex-provider", "legacy-fallback", {
        mode,
        reason: support.reason ?? "unknown",
        workdir: options.workdir,
        hasMcpConfigPath: Boolean(options.mcpConfigPath),
      })
      return createLegacyExecutionHandle(this.id, "codex_exec", options, this.runLegacyCodex.bind(this))
    }

    try {
      const handle = await createCodexAcpExecutionHandle(options)
      logInfo("codex-provider", "acp-selected", {
        mode,
        workdir: options.workdir,
        hasMcpConfigPath: Boolean(options.mcpConfigPath),
      })
      return handle
    } catch (error) {
      if (!(await supportsCodexExecSubcommand())) {
        return this.createCodexLegacyUnavailableHandle(mode, errorMessage(error))
      }
      logWarn("codex-provider", "acp-init-failed", {
        mode,
        workdir: options.workdir,
        hasMcpConfigPath: Boolean(options.mcpConfigPath),
        error: errorMessage(error),
      })
      return createLegacyExecutionHandle(this.id, "codex_exec", options, this.runLegacyCodex.bind(this))
    }
  }

  async executeInteractive(options: AgentRunOptions): Promise<AgentExecutionHandle> {
    return this.createExecutionHandle("interactive", options)
  }

  async executeTask(options: AgentRunOptions): Promise<AgentExecutionHandle> {
    return this.createExecutionHandle("task", options)
  }

  cancel(_sessionId: string): boolean {
    return false
  }

  private async runLegacyCodex(options: AgentRunOptions): Promise<AgentRunResult> {
    if (!(await supportsCodexExecSubcommand())) {
      throw new Error("Installed Codex CLI does not support the legacy `codex exec` backend.")
    }

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

    const mcpOverrideArgs = buildProviderExtraArgs("codex", options.mcpConfigPath)
    const legacyExtraArgs = [
      ...mcpOverrideArgs,
      ...(options.extraArgs || []),
    ]
    if (legacyExtraArgs.length > 0) {
      args.push(...legacyExtraArgs)
    }

    args.push(prompt)

    const env = await buildCodexEnv(options.extraEnv)

    logWarn("codex-provider", "legacy-exec-start", {
      workdir: options.workdir,
      model: options.model ?? null,
      resolvedSafetyProfile: safetyProfile,
      addDirCount: options.addDirs?.length ?? 0,
      hasMcpConfigPath: Boolean(options.mcpConfigPath),
      mcpOverrideArgCount: mcpOverrideArgs.length,
      hasCodexConfigOverrides: mcpOverrideArgs.length > 0,
      extraArgCount: options.extraArgs?.length ?? 0,
    })

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
      let sawInteractiveEditorNoise = false

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
        const text = data.toString("utf-8")
        if (isCodexInteractiveEditorNoise(text)) {
          const summary = summarizeCodexInteractiveEditorNoise(text)
          if (!sawInteractiveEditorNoise) {
            sawInteractiveEditorNoise = true
            logWarn("codex-provider", "legacy-exec-interactive-editor", {
              workdir: options.workdir,
              hasMcpConfigPath: Boolean(options.mcpConfigPath),
              mcpOverrideArgCount: mcpOverrideArgs.length,
              stderr: normalizeCliText(text).slice(0, 500),
            })
            options.onStderr?.(Buffer.from(`${summary}\n`))
          }
          return
        }
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

        logInfo("codex-provider", "legacy-exec-finished", {
          workdir: options.workdir,
          exitCode: code,
          signal,
          aborted,
          killed: killed || child.killed,
          sawInteractiveEditorNoise,
        })

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
