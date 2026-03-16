#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import YAML from "yaml"
import {
  createWorkflowRunner,
  writeWorkflowApprovalDecision,
  type ProviderId,
  type Workflow,
  type WorkflowEvent,
  type WorkflowInput,
  type WorkflowRunHandle,
  type WorkflowRunSummary,
} from "@c8c/workflow-runner"
import { prepareWorkspaceMcpConfig } from "../../../src/main/lib/mcp-config.js"
import { ClaudeAgentProvider } from "../../../src/main/lib/providers/claude-agent-provider.js"
import { CodexAgentProvider } from "../../../src/main/lib/providers/codex-agent-provider.js"
import { scanAllSkills } from "../../../src/main/lib/skill-scanner.js"

type Command = "run" | "resume" | "rerun-from" | "inspect" | "events" | "help"
type ApprovalRequestedEvent = Extract<WorkflowEvent, { type: "approval-requested" }>

interface CliFlags {
  provider?: ProviderId
  input?: string
  inputFile?: string
  inputType?: WorkflowInput["type"]
  project?: string
  json?: boolean
  jsonl?: boolean
  autoApprove?: boolean
  mode?: "tool"
  argsJson?: string
  token?: string
  approve?: boolean
}

interface OpenClawRunArgsJson {
  input?: string
  inputType?: WorkflowInput["type"]
  projectPath?: string
  provider?: ProviderId
}

interface OpenClawCompatibilityContext {
  version: 1
  workflowPath: string
  workflow: Workflow
  projectPath?: string
  provider?: ProviderId
}

interface OpenClawResumeTokenPayload {
  version: 1
  workspace: string
  nodeId: string
}

type OpenClawEnvelope =
  | {
      ok: true
      status: "ok" | "needs_approval" | "cancelled"
      output: Array<Record<string, unknown>>
      requiresApproval: null | {
        type: "approval_request"
        prompt: string
        items: Array<Record<string, unknown>>
        resumeToken: string
      }
    }
  | {
      ok: false
      error: {
        type: string
        message: string
      }
    }

const OPENCLAW_CONTEXT_FILE = "openclaw-compat.json"

let claudeAgentProvider: ClaudeAgentProvider | null = null
let codexAgentProvider: CodexAgentProvider | null = null

function resolveAgentProvider(providerId: ProviderId) {
  if (providerId === "claude") {
    claudeAgentProvider ||= new ClaudeAgentProvider()
    return claudeAgentProvider
  }
  if (providerId === "codex") {
    codexAgentProvider ||= new CodexAgentProvider()
    return codexAgentProvider
  }
  throw new Error(`Unsupported provider: ${providerId}`)
}

function createRunner(providerOverride?: ProviderId) {
  return createWorkflowRunner({
    startProviderTask(providerId, options) {
      return resolveAgentProvider(providerId).executeTask(options)
    },
    resolveWorkflowProviderId(workflow) {
      return Promise.resolve(providerOverride || workflow.defaults?.provider || "claude")
    },
    resolveNodeProviderId(_node, workflow) {
      return Promise.resolve(providerOverride || workflow.defaults?.provider || "claude")
    },
    prepareWorkspaceMcpConfig,
    scanSkills: scanAllSkills,
  })
}

function printUsage(): void {
  console.log(`Usage:
  c8c-workflow run <workflow.chain> [--input TEXT | --input-file PATH] [--input-type text|url|directory] [--project PATH] [--provider claude|codex] [--json] [--jsonl] [--auto-approve]
  c8c-workflow run --mode tool <workflow.(json|yaml|yml)> [--args-json '{"input":"...","inputType":"text","projectPath":"/abs/path","provider":"claude"}']
  c8c-workflow resume <workflow.chain> <workspace> [--project PATH] [--provider claude|codex] [--json] [--jsonl] [--auto-approve]
  c8c-workflow resume --token <resumeToken> --approve yes|no
  c8c-workflow rerun-from <workflow.chain> <workspace> <nodeId> [--project PATH] [--provider claude|codex] [--json] [--jsonl] [--auto-approve]
  c8c-workflow inspect <workspace>
  c8c-workflow events <workspace>`)
}

function parseFlags(args: string[]): { positional: string[]; flags: CliFlags } {
  const positional: string[] = []
  const flags: CliFlags = {}

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (!arg.startsWith("--")) {
      positional.push(arg)
      continue
    }

    const next = args[index + 1]
    switch (arg) {
      case "--provider":
        if (next === "claude" || next === "codex") {
          flags.provider = next
          index++
        }
        break
      case "--input":
        flags.input = next || ""
        index++
        break
      case "--input-file":
        flags.inputFile = next || ""
        index++
        break
      case "--input-type":
        if (next === "text" || next === "url" || next === "directory") {
          flags.inputType = next
          index++
        }
        break
      case "--project":
        flags.project = next || ""
        index++
        break
      case "--json":
        flags.json = true
        break
      case "--jsonl":
        flags.jsonl = true
        break
      case "--auto-approve":
        flags.autoApprove = true
        break
      case "--mode":
        if (next === "tool") {
          flags.mode = "tool"
          index++
        }
        break
      case "--args-json":
        flags.argsJson = next || ""
        index++
        break
      case "--token":
        flags.token = next || ""
        index++
        break
      case "--approve":
        if (next === "yes") flags.approve = true
        if (next === "no") flags.approve = false
        index++
        break
    }
  }

  return { positional, flags }
}

function normalizeJsonError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function loadWorkflow(filePath: string): Promise<Workflow> {
  const resolvedPath = resolve(filePath)
  const raw = await readFile(resolvedPath, "utf-8")

  try {
    return JSON.parse(raw) as Workflow
  } catch {
    const parsed = YAML.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") {
      throw new Error(`Workflow file is not valid JSON or YAML: ${resolvedPath}`)
    }
    return parsed as Workflow
  }
}

async function loadInput(flags: CliFlags): Promise<WorkflowInput> {
  if (flags.inputFile) {
    const content = await readFile(resolve(flags.inputFile), "utf-8")
    return { type: flags.inputType || "text", value: content }
  }
  return {
    type: flags.inputType || "text",
    value: flags.input || "",
  }
}

export function parseOpenClawArgsJson(raw: string | undefined): OpenClawRunArgsJson {
  if (!raw?.trim()) return {}

  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--args-json must decode to a JSON object")
  }

  const candidate = parsed as Record<string, unknown>
  const result: OpenClawRunArgsJson = {}

  if (candidate.input !== undefined) {
    if (typeof candidate.input !== "string") {
      throw new Error("argsJson.input must be a string")
    }
    result.input = candidate.input
  }

  if (candidate.inputType !== undefined) {
    if (candidate.inputType !== "text" && candidate.inputType !== "url" && candidate.inputType !== "directory") {
      throw new Error("argsJson.inputType must be one of: text, url, directory")
    }
    result.inputType = candidate.inputType
  }

  if (candidate.projectPath !== undefined) {
    if (typeof candidate.projectPath !== "string") {
      throw new Error("argsJson.projectPath must be a string")
    }
    result.projectPath = candidate.projectPath
  }

  if (candidate.provider !== undefined) {
    if (candidate.provider !== "claude" && candidate.provider !== "codex") {
      throw new Error("argsJson.provider must be one of: claude, codex")
    }
    result.provider = candidate.provider
  }

  return result
}

export function encodeOpenClawResumeToken(payload: OpenClawResumeTokenPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url")
}

export function decodeOpenClawResumeToken(token: string): OpenClawResumeTokenPayload {
  const raw = Buffer.from(token, "base64url").toString("utf-8")
  const parsed = JSON.parse(raw) as Partial<OpenClawResumeTokenPayload>

  if (
    parsed.version !== 1
    || typeof parsed.workspace !== "string"
    || !parsed.workspace
    || typeof parsed.nodeId !== "string"
    || !parsed.nodeId
  ) {
    throw new Error("Invalid OpenClaw resume token")
  }

  return parsed as OpenClawResumeTokenPayload
}

function renderEventHuman(event: WorkflowEvent): string {
  switch (event.type) {
    case "node-start":
      return `start ${event.nodeId}`
    case "node-done":
      return `done ${event.nodeId}`
    case "node-error":
      return `error ${event.nodeId}: ${event.error}`
    case "node-log":
      return `log ${event.nodeId}: ${event.entry.type}`
    case "eval-result":
      return `eval ${event.nodeId}: ${event.score} (${event.passed ? "pass" : "fail"})`
    case "nodes-expanded":
      return `expanded ${event.newNodeIds.length} nodes`
    case "approval-requested":
      return `approval ${event.nodeId}`
    case "run-done":
      return `run ${event.status}`
  }
}

async function streamEvents(
  runner: ReturnType<typeof createRunner>,
  handle: WorkflowRunHandle,
  flags: CliFlags,
): Promise<boolean> {
  let approvalRequired = false

  for await (const event of handle.events) {
    if (flags.jsonl) {
      process.stdout.write(`${JSON.stringify(event)}\n`)
    } else if (!flags.json) {
      process.stdout.write(`${renderEventHuman(event)}\n`)
    }

    if (event.type === "approval-requested") {
      if (flags.autoApprove) {
        await runner.resolveApproval({
          runId: event.runId,
          nodeId: event.nodeId,
          approved: true,
        })
      } else {
        approvalRequired = true
        await runner.resolveApproval({
          runId: event.runId,
          nodeId: event.nodeId,
          approved: false,
        })
      }
    }
  }

  return approvalRequired
}

function summaryExitCode(summary: WorkflowRunSummary, approvalRequired: boolean): number {
  if (approvalRequired) return 4
  if (summary.status === "completed") return 0
  if (summary.status === "cancelled") return 2
  if (summary.status === "interrupted") return 3
  if (summary.status === "paused") return 4
  return 1
}

async function readJsonMaybe<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(resolve(filePath), "utf-8")) as T
  } catch {
    return null
  }
}

function openClawContextPath(workspace: string): string {
  return resolve(workspace, OPENCLAW_CONTEXT_FILE)
}

async function writeOpenClawContext(
  workspace: string,
  context: OpenClawCompatibilityContext,
): Promise<void> {
  const filePath = openClawContextPath(workspace)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(context, null, 2)}\n`, "utf-8")
}

async function readOpenClawContext(workspace: string): Promise<OpenClawCompatibilityContext> {
  const raw = await readFile(openClawContextPath(workspace), "utf-8")
  const parsed = JSON.parse(raw) as Partial<OpenClawCompatibilityContext>

  if (
    parsed.version !== 1
    || typeof parsed.workflowPath !== "string"
    || !parsed.workflowPath
    || !parsed.workflow
    || typeof parsed.workflow !== "object"
  ) {
    throw new Error(`Invalid OpenClaw compatibility context in ${workspace}`)
  }

  if (parsed.provider && parsed.provider !== "claude" && parsed.provider !== "codex") {
    throw new Error(`Invalid provider in OpenClaw compatibility context: ${parsed.provider}`)
  }

  return parsed as OpenClawCompatibilityContext
}

async function collectToolRunResult(
  handle: WorkflowRunHandle,
): Promise<{ summary: WorkflowRunSummary; approvalEvent: ApprovalRequestedEvent | null }> {
  let approvalEvent: ApprovalRequestedEvent | null = null

  const eventPromise = (async () => {
    for await (const event of handle.events) {
      if (event.type === "approval-requested" && !approvalEvent) {
        approvalEvent = event
      }
    }
  })()

  const summary = await handle.result
  await eventPromise

  return { summary, approvalEvent }
}

function buildToolRunSummary(summary: WorkflowRunSummary): Record<string, unknown> {
  return {
    type: "run_summary",
    runId: summary.runId,
    status: summary.status,
    workspace: summary.workspace,
    reportPath: summary.reportPath || null,
    durationMs: summary.durationMs,
    totalCost: summary.totalCost,
    totalTokensIn: summary.totalTokensIn,
    totalTokensOut: summary.totalTokensOut,
  }
}

function buildOpenClawSuccessEnvelope(
  status: "ok" | "needs_approval" | "cancelled",
  summary: WorkflowRunSummary,
  approvalEvent: ApprovalRequestedEvent | null = null,
): OpenClawEnvelope {
  if (status === "needs_approval") {
    if (!approvalEvent) {
      throw new Error("Approval event missing for paused tool-mode run")
    }

    return {
      ok: true,
      status,
      output: [buildToolRunSummary(summary)],
      requiresApproval: {
        type: "approval_request",
        prompt: approvalEvent.message || `Approval required for ${approvalEvent.nodeId}`,
        items: [
          {
            nodeId: approvalEvent.nodeId,
            content: approvalEvent.content,
            allowEdit: approvalEvent.allowEdit,
          },
        ],
        resumeToken: encodeOpenClawResumeToken({
          version: 1,
          workspace: summary.workspace,
          nodeId: approvalEvent.nodeId,
        }),
      },
    }
  }

  return {
    ok: true,
    status,
    output: [buildToolRunSummary(summary)],
    requiresApproval: null,
  }
}

function buildOpenClawErrorEnvelope(message: string, type = "runtime_error"): OpenClawEnvelope {
  return {
    ok: false,
    error: {
      type,
      message,
    },
  }
}

function writeOpenClawEnvelope(envelope: OpenClawEnvelope): void {
  process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`)
}

function isOpenClawToolMode(command: Command, flags: CliFlags): boolean {
  return (command === "run" && flags.mode === "tool")
    || (command === "resume" && Boolean(flags.token))
}

async function runOpenClawToolMode(args: string[], flags: CliFlags): Promise<number> {
  const workflowPathInput = args[0]
  if (!workflowPathInput) {
    throw new Error("tool mode requires <workflow.(json|yaml|yml)>")
  }

  const workflowPath = resolve(workflowPathInput)
  const workflow = await loadWorkflow(workflowPath)
  const argsJson = parseOpenClawArgsJson(flags.argsJson)
  const providerOverride = flags.provider || argsJson.provider
  const runner = createRunner(providerOverride)
  const input = flags.input || flags.inputFile
    ? await loadInput(flags)
    : {
        type: argsJson.inputType || "text",
        value: argsJson.input || "",
      }
  const projectPath = resolve(argsJson.projectPath || flags.project || ".")
  const projectPathValue = argsJson.projectPath || flags.project
    ? projectPath
    : undefined

  const handle = await runner.startRun({
    workflow,
    input,
    projectPath: projectPathValue,
    workflowPath,
    approvalBehavior: "suspend",
  })

  await writeOpenClawContext(handle.workspace, {
    version: 1,
    workflowPath,
    workflow,
    projectPath: projectPathValue,
    provider: providerOverride,
  })

  const { summary, approvalEvent } = await collectToolRunResult(handle)

  if (summary.status === "paused") {
    writeOpenClawEnvelope(buildOpenClawSuccessEnvelope("needs_approval", summary, approvalEvent))
    return 0
  }

  if (summary.status === "completed") {
    writeOpenClawEnvelope(buildOpenClawSuccessEnvelope("ok", summary))
    return 0
  }

  if (summary.status === "cancelled") {
    writeOpenClawEnvelope(buildOpenClawSuccessEnvelope("cancelled", summary))
    return 0
  }

  writeOpenClawEnvelope(buildOpenClawErrorEnvelope(`Workflow finished with status: ${summary.status}`))
  return 1
}

async function resumeOpenClawToolMode(flags: CliFlags): Promise<number> {
  if (!flags.token) {
    throw new Error("resume tool mode requires --token")
  }
  if (typeof flags.approve !== "boolean") {
    throw new Error("resume tool mode requires --approve yes|no")
  }

  const token = decodeOpenClawResumeToken(flags.token)
  const context = await readOpenClawContext(token.workspace)
  const runner = createRunner(flags.provider || context.provider)

  await writeWorkflowApprovalDecision(token.workspace, token.nodeId, {
    approved: flags.approve,
  })

  const handle = await runner.resumeRun({
    workflow: context.workflow,
    workspace: token.workspace,
    projectPath: context.projectPath,
    workflowPath: context.workflowPath,
    approvalBehavior: "suspend",
  })

  const { summary, approvalEvent } = await collectToolRunResult(handle)

  if (summary.status === "paused") {
    writeOpenClawEnvelope(buildOpenClawSuccessEnvelope("needs_approval", summary, approvalEvent))
    return 0
  }

  if (summary.status === "completed") {
    writeOpenClawEnvelope(buildOpenClawSuccessEnvelope("ok", summary))
    return 0
  }

  if (summary.status === "cancelled") {
    writeOpenClawEnvelope(buildOpenClawSuccessEnvelope("cancelled", summary))
    return 0
  }

  writeOpenClawEnvelope(buildOpenClawErrorEnvelope(`Workflow finished with status: ${summary.status}`))
  return 1
}

async function runCommand(command: Command, args: string[]): Promise<number> {
  const { positional, flags } = parseFlags(args)

  if (command === "run" && flags.mode === "tool") {
    return runOpenClawToolMode(positional, flags)
  }

  if (command === "resume" && flags.token) {
    return resumeOpenClawToolMode(flags)
  }

  const runner = createRunner(flags.provider)

  if (command === "inspect") {
    const workspace = positional[0]
    if (!workspace) throw new Error("inspect requires <workspace>")
    const payload = {
      manifest: await readJsonMaybe(resolve(workspace, "manifest.json")),
      state: await readJsonMaybe(resolve(workspace, "run-state.json")),
      result: await readJsonMaybe(resolve(workspace, "result.json")),
    }
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    return 0
  }

  if (command === "events") {
    const workspace = positional[0]
    if (!workspace) throw new Error("events requires <workspace>")
    const raw = await readFile(resolve(workspace, "events.jsonl"), "utf-8")
    process.stdout.write(raw)
    return 0
  }

  if (command === "run") {
    const workflowPath = positional[0]
    if (!workflowPath) throw new Error("run requires <workflow.chain>")
    const workflow = await loadWorkflow(workflowPath)
    const input = await loadInput(flags)
    const handle = await runner.startRun({
      workflow,
      input,
      projectPath: flags.project ? resolve(flags.project) : undefined,
      workflowPath: resolve(workflowPath),
    })
    const streamPromise = streamEvents(runner, handle, flags)
    const summary = await handle.result
    const approvalRequired = await streamPromise
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    }
    return summaryExitCode(summary, approvalRequired)
  }

  if (command === "resume") {
    const workflowPath = positional[0]
    const workspace = positional[1]
    if (!workflowPath || !workspace) throw new Error("resume requires <workflow.chain> <workspace>")
    const workflow = await loadWorkflow(workflowPath)
    const handle = await runner.resumeRun({
      workflow,
      workspace: resolve(workspace),
      projectPath: flags.project ? resolve(flags.project) : undefined,
      workflowPath: resolve(workflowPath),
    })
    const streamPromise = streamEvents(runner, handle, flags)
    const summary = await handle.result
    const approvalRequired = await streamPromise
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    }
    return summaryExitCode(summary, approvalRequired)
  }

  if (command === "rerun-from") {
    const workflowPath = positional[0]
    const workspace = positional[1]
    const nodeId = positional[2]
    if (!workflowPath || !workspace || !nodeId) {
      throw new Error("rerun-from requires <workflow.chain> <workspace> <nodeId>")
    }
    const workflow = await loadWorkflow(workflowPath)
    const handle = await runner.rerunFromNode({
      workflow,
      workspace: resolve(workspace),
      fromNodeId: nodeId,
      projectPath: flags.project ? resolve(flags.project) : undefined,
      workflowPath: resolve(workflowPath),
    })
    const streamPromise = streamEvents(runner, handle, flags)
    const summary = await handle.result
    const approvalRequired = await streamPromise
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    }
    return summaryExitCode(summary, approvalRequired)
  }

  printUsage()
  return 0
}

export async function main(): Promise<void> {
  const [command = "help", ...args] = process.argv.slice(2)
  const { flags } = parseFlags(args)
  const toolMode = (
    command === "run"
    || command === "resume"
    || command === "rerun-from"
    || command === "inspect"
    || command === "events"
    || command === "help"
  ) ? isOpenClawToolMode(command, flags) : false

  if (
    command !== "run"
    && command !== "resume"
    && command !== "rerun-from"
    && command !== "inspect"
    && command !== "events"
    && command !== "help"
  ) {
    printUsage()
    process.exitCode = 1
    return
  }

  try {
    const code = await runCommand(command, args)
    process.exitCode = code
  } catch (error) {
    if (toolMode) {
      writeOpenClawEnvelope(buildOpenClawErrorEnvelope(normalizeJsonError(error)))
    } else {
      process.stderr.write(`${normalizeJsonError(error)}\n`)
    }
    process.exitCode = 1
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null

if (entrypoint && import.meta.url === entrypoint) {
  void main()
}
