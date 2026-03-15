import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, sep } from "node:path"
import { createACPProvider, ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME } from "@mcpc-tech/acp-ai-provider"
import type { EnvVariable, HttpHeader, McpServer } from "@agentclientprotocol/sdk"
import { streamText } from "ai"
import {
  resolveSafetyProfile,
} from "@shared/provider-metadata"
import type {
  AgentExecutionEvent,
  AgentExecutionHandle,
  AgentExecutionSummary,
  AgentRunOptions,
  LogEntry,
} from "@shared/types"
import { buildCodexEnv } from "./codex-cli"
import { buildClaudeSdkMcpServers } from "./mcp-config"
import { getCodexApiKey, getProviderSettings } from "./provider-settings"

const require = createRequire(import.meta.url)

const CODEX_VERB_TO_TOOL_TYPE: Record<string, string> = {
  Read: "Read",
  Run: "Bash",
  List: "Glob",
  Search: "Grep",
  Grep: "Grep",
  Glob: "Glob",
  Edit: "Edit",
  Write: "Write",
  Thought: "Thinking",
  Fetch: "WebFetch",
}

interface CodexToolDescriptor {
  canonicalToolName: string
  detail: string
  isMcp: boolean
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private items: T[] = []
  private resolvers: Array<(result: IteratorResult<T>) => void> = []
  private closed = false

  push(item: T): void {
    if (this.closed) return
    const resolver = this.resolvers.shift()
    if (resolver) {
      resolver({ value: item, done: false })
      return
    }
    this.items.push(item)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    while (this.resolvers.length > 0) {
      this.resolvers.shift()?.({ value: undefined as T, done: true })
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.items.length > 0) {
          return Promise.resolve({ value: this.items.shift() as T, done: false })
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as T, done: true })
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolvers.push(resolve)
        })
      },
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function toUnpackedAsarPath(filePath: string): string {
  const unpackedPath = filePath.replace(
    `${sep}app.asar${sep}`,
    `${sep}app.asar.unpacked${sep}`,
  )

  if (unpackedPath !== filePath && existsSync(unpackedPath)) {
    return unpackedPath
  }

  return filePath
}

function getCodexAcpPackageName(): string {
  const platform = process.platform
  const arch = process.arch

  if (platform === "darwin") {
    if (arch === "arm64") return "@zed-industries/codex-acp-darwin-arm64"
    if (arch === "x64") return "@zed-industries/codex-acp-darwin-x64"
  }

  if (platform === "linux") {
    if (arch === "arm64") return "@zed-industries/codex-acp-linux-arm64"
    if (arch === "x64") return "@zed-industries/codex-acp-linux-x64"
  }

  if (platform === "win32") {
    if (arch === "arm64") return "@zed-industries/codex-acp-win32-arm64"
    if (arch === "x64") return "@zed-industries/codex-acp-win32-x64"
  }

  throw new Error(`Unsupported platform/arch for codex-acp: ${platform}/${arch}`)
}

function resolveCodexAcpBinaryPath(): string {
  const packageName = getCodexAcpPackageName()
  const binaryName = process.platform === "win32" ? "codex-acp.exe" : "codex-acp"
  const packageRoot = dirname(require.resolve("@zed-industries/codex-acp/package.json"))
  const resolvedPath = require.resolve(`${packageName}/bin/${binaryName}`, {
    paths: [packageRoot],
  })
  return toUnpackedAsarPath(resolvedPath)
}

function recordToHeaders(record?: Record<string, string>): HttpHeader[] {
  if (!record) return []
  return Object.entries(record).map(([name, value]) => ({ name, value }))
}

function recordToEnv(record?: Record<string, string>): EnvVariable[] {
  if (!record) return []
  return Object.entries(record).map(([name, value]) => ({ name, value }))
}

function buildCodexAcpMcpServers(mcpConfigPath?: string): McpServer[] {
  const servers = buildClaudeSdkMcpServers(mcpConfigPath)

  return Object.entries(servers).map(([name, server]) => {
    if (server.type === "http" || server.type === "sse") {
      return {
        name,
        type: server.type,
        url: server.url,
        headers: recordToHeaders(server.headers),
      }
    }

    return {
      name,
      command: server.command,
      args: server.args || [],
      env: recordToEnv(server.env),
    }
  })
}

function getCodexAuthMethodId(apiKey?: string): "codex-api-key" | undefined {
  return apiKey?.trim() ? "codex-api-key" : undefined
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

function parseCodexToolDescriptor(rawToolName: string): CodexToolDescriptor | null {
  const normalizedName = rawToolName.trim()
  if (!normalizedName) return null

  if (normalizedName.startsWith("Tool:")) {
    const payload = normalizedName.slice("Tool:".length).trim()
    const separatorIndex = payload.indexOf("/")
    if (separatorIndex === -1) return null

    const serverName = payload.slice(0, separatorIndex).trim()
    const toolName = payload.slice(separatorIndex + 1).trim().replaceAll("/", "__")
    if (!serverName || !toolName) return null

    return {
      canonicalToolName: `mcp__${serverName}__${toolName}`,
      detail: "",
      isMcp: true,
    }
  }

  const spaceIndex = normalizedName.indexOf(" ")
  const verb = spaceIndex === -1 ? normalizedName : normalizedName.slice(0, spaceIndex)
  const detail = spaceIndex === -1 ? "" : normalizedName.slice(spaceIndex + 1).trim()
  const canonicalToolName = CODEX_VERB_TO_TOOL_TYPE[verb]
  if (!canonicalToolName) return null

  return {
    canonicalToolName,
    detail,
    isMcp: false,
  }
}

function normalizeCodexToolInput(rawInput: unknown, descriptor: CodexToolDescriptor): Record<string, unknown> {
  if (!isRecord(rawInput)) {
    if (descriptor.canonicalToolName === "Read" && descriptor.detail) {
      return { file_path: descriptor.detail }
    }
    if (descriptor.canonicalToolName === "Bash" && descriptor.detail) {
      return { command: descriptor.detail }
    }
    if (descriptor.canonicalToolName === "WebFetch" && descriptor.detail.startsWith("http")) {
      return { url: descriptor.detail }
    }
    return {}
  }

  const args = isRecord(rawInput.args)
    ? { ...rawInput.args }
    : { ...rawInput }

  if (descriptor.isMcp) {
    if (isRecord(args.arguments)) {
      return { ...args.arguments }
    }
    return args
  }

  if (descriptor.canonicalToolName === "Read" && typeof args.file_path !== "string" && descriptor.detail) {
    args.file_path = descriptor.detail
  }

  if (descriptor.canonicalToolName === "Bash" && typeof args.command !== "string" && descriptor.detail) {
    args.command = descriptor.detail
  }

  if (descriptor.canonicalToolName === "WebFetch" && typeof args.url !== "string" && descriptor.detail.startsWith("http")) {
    args.url = descriptor.detail
  }

  return args
}

function resolveCodexToolPart(
  rawToolName: string,
  rawInput: unknown,
): { toolName: string; input: Record<string, unknown> } {
  const descriptor = parseCodexToolDescriptor(rawToolName)
  if (!descriptor) {
    return {
      toolName: rawToolName,
      input: isRecord(rawInput) ? rawInput : {},
    }
  }

  return {
    toolName: descriptor.canonicalToolName,
    input: normalizeCodexToolInput(rawInput, descriptor),
  }
}

function stringifyOutput(output: unknown): string {
  if (typeof output === "string") return output
  if (output == null) return ""
  try {
    return JSON.stringify(output)
  } catch {
    return String(output)
  }
}

function mapStreamPartToLogEntry(
  part: any,
  toolNamesById: Map<string, string>,
): LogEntry | null {
  const timestamp = Date.now()

  if (part.type === "text-delta" && typeof part.text === "string") {
    return { type: "text", content: part.text, timestamp }
  }

  if (part.type === "reasoning-delta" && typeof part.text === "string") {
    return { type: "thinking", content: part.text, timestamp }
  }

  if (part.type === "tool-call") {
    const rawToolName = typeof part.toolName === "string" ? part.toolName : "unknown"
    const rawInput = rawToolName === ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME && isRecord(part.input)
      ? part.input
      : part.input
    const actualToolName = rawToolName === ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME
      && isRecord(rawInput)
      && typeof rawInput.toolName === "string"
      ? rawInput.toolName
      : rawToolName
    const actualInput = rawToolName === ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME
      && isRecord(rawInput)
      ? rawInput.args
      : rawInput
    const normalized = resolveCodexToolPart(actualToolName, actualInput)
    if (typeof part.toolCallId === "string") {
      toolNamesById.set(part.toolCallId, normalized.toolName)
    }
    return {
      type: "tool_use",
      tool: normalized.toolName,
      input: normalized.input,
      timestamp,
    }
  }

  if (part.type === "tool-result" || part.type === "tool-error") {
    const toolName = typeof part.toolName === "string"
      ? part.toolName
      : typeof part.toolCallId === "string"
        ? toolNamesById.get(part.toolCallId) || "unknown"
        : "unknown"
    return {
      type: "tool_result",
      tool: toolName,
      output: stringifyOutput(part.output ?? part.errorText ?? part.error),
      status: part.type === "tool-error" ? "error" : "success",
      timestamp,
    }
  }

  if (part.type === "raw") {
    const rawValue = typeof part.rawValue === "string"
      ? (() => {
          try {
            return JSON.parse(part.rawValue)
          } catch {
            return null
          }
        })()
      : part.rawValue

    if (isRecord(rawValue) && rawValue.type === "diff" && typeof rawValue.path === "string") {
      return {
        type: "diff",
        content: stringifyOutput(rawValue),
        files: [rawValue.path],
        timestamp,
      }
    }
  }

  if (part.type === "error") {
    return {
      type: "error",
      content: errorMessage(part.error),
      timestamp,
    }
  }

  return null
}

function usageFromPart(part: any): { inputTokens: number; outputTokens: number } | null {
  const usage = part?.usage || part?.totalUsage
  if (!usage || typeof usage !== "object") return null
  return {
    inputTokens: typeof usage.inputTokens === "number" ? usage.inputTokens : 0,
    outputTokens: typeof usage.outputTokens === "number" ? usage.outputTokens : 0,
  }
}

export async function createCodexAcpExecutionHandle(
  options: AgentRunOptions,
): Promise<AgentExecutionHandle> {
  const settings = await getProviderSettings()
  const resolvedSafetyProfile = resolveSafetyProfile(
    options.executionMode,
    options.safetyProfile || settings.safetyProfile,
  )

  if (resolvedSafetyProfile !== "workspace_auto" && resolvedSafetyProfile !== "safe_readonly") {
    throw new Error(`Codex ACP does not support safety profile ${resolvedSafetyProfile}`)
  }

  const apiKey = await getCodexApiKey()
  const env = await buildCodexEnv(options.extraEnv)
  const provider = createACPProvider({
    command: resolveCodexAcpBinaryPath(),
    env: Object.fromEntries(
      Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    ),
    authMethodId: getCodexAuthMethodId(apiKey),
    session: {
      cwd: options.workdir,
      mcpServers: buildCodexAcpMcpServers(options.mcpConfigPath),
    },
    persistSession: false,
  })

  const queue = new AsyncEventQueue<AgentExecutionEvent>()
  const abortController = new AbortController()
  const toolNamesById = new Map<string, string>()

  const onAbort = () => {
    if (!abortController.signal.aborted) {
      abortController.abort()
    }
  }

  if (options.abortSignal) {
    if (options.abortSignal.aborted) {
      onAbort()
    } else {
      options.abortSignal.addEventListener("abort", onAbort, { once: true })
    }
  }

  queue.push({ type: "start" })

  let sessionId: string | null = provider.getSessionId()

  const done = (async (): Promise<AgentExecutionSummary> => {
    const startedAt = Date.now()
    let finishReason: string | null = null
    let lastError: string | null = null

    try {
      const modeId = resolvedSafetyProfile === "safe_readonly" ? "plan" : undefined
      const result = streamText({
        model: provider.languageModel(options.model, modeId),
        prompt: buildCodexToolPolicyPrefix(options),
        tools: provider.tools,
        abortSignal: abortController.signal,
        includeRawChunks: true,
      })

      for await (const part of result.fullStream) {
        sessionId = provider.getSessionId() || sessionId

        const usage = usageFromPart(part)
        if (usage) {
          queue.push({ type: "usage", usage })
        }

        const entry = mapStreamPartToLogEntry(part, toolNamesById)
        if (entry) {
          queue.push({ type: "log-entry", entry })
          if (entry.type === "error") {
            lastError = entry.content
            queue.push({ type: "error", text: entry.content })
          }
        }

        if (part.type === "finish") {
          finishReason = part.finishReason || "stop"
        }

        if (part.type === "abort") {
          finishReason = "abort"
        }
      }

      const totalUsage = await result.totalUsage
      queue.push({
        type: "usage",
        usage: {
          inputTokens: totalUsage.inputTokens || 0,
          outputTokens: totalUsage.outputTokens || 0,
        },
      })

      const resolvedFinishReason = finishReason || await result.finishReason
      const aborted = abortController.signal.aborted || resolvedFinishReason === "abort"
      const success = !aborted && resolvedFinishReason !== "error"
      const summary: AgentExecutionSummary = {
        success,
        exitCode: success || aborted ? 0 : null,
        signal: null,
        killed: false,
        aborted,
        durationMs: Date.now() - startedAt,
        error: success ? null : lastError || `Codex ACP finished with reason: ${resolvedFinishReason}`,
        providerSessionId: sessionId,
      }
      queue.push({ type: "finish", summary })
      return summary
    } catch (error) {
      const aborted = abortController.signal.aborted
      const summary: AgentExecutionSummary = {
        success: false,
        exitCode: aborted ? 0 : null,
        signal: null,
        killed: false,
        aborted,
        durationMs: Date.now() - startedAt,
        error: aborted ? "Execution aborted." : errorMessage(error),
        providerSessionId: sessionId,
      }
      queue.push({ type: "error", text: summary.error || "Codex ACP query failed." })
      queue.push({ type: "finish", summary })
      return summary
    } finally {
      provider.cleanup()
      if (options.abortSignal) {
        options.abortSignal.removeEventListener("abort", onAbort)
      }
      queue.close()
    }
  })()

  return {
    provider: "codex",
    events: queue,
    abort: () => {
      onAbort()
      provider.cleanup()
    },
    done,
  }
}
