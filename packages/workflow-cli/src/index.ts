#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import YAML from "yaml"
import {
  approvalTaskId,
  createWorkflowRunner,
  getWorkflowHilTask,
  getWorkflowHilTaskByRef,
  listWorkflowHilTasks,
  resolveWorkflowHilTaskByRef,
  writeWorkflowApprovalDecision,
  writeWorkflowHilTaskResponse,
  type WorkflowHilTaskRecord,
  type WorkflowHilTaskSummary,
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

type Command = "run" | "resume" | "respond" | "rerun-from" | "inspect" | "events" | "hil" | "help"
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
  task?: string
  dataJson?: string
  comment?: string
  idempotencyKey?: string
  editedContent?: string
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
  taskId?: string
  checkpointKind?: "approval" | "human_approval" | "human_form"
}

interface OpenClawResumeTokenPayload {
  version: 1
  workspace: string
  nodeId: string
}

type OpenClawEnvelope =
  | {
      ok: true
      status: "ok" | "needs_approval" | "needs_human_input" | "cancelled"
      output: Array<Record<string, unknown>>
      requiresApproval: null | {
        type: "approval_request"
        prompt: string
        items: Array<Record<string, unknown>>
        resumeToken: string
        taskId?: string
      }
      requiresHumanInput: null | {
        type: "human_task"
        prompt: string
        task: string
        taskId: string
        request: Record<string, unknown>
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
  c8c-workflow respond --task <taskToken> --data-json '{"field":"value"}' [--comment TEXT] [--idempotency-key KEY]
  c8c-workflow rerun-from <workflow.chain> <workspace> <nodeId> [--project PATH] [--provider claude|codex] [--json] [--jsonl] [--auto-approve]
  c8c-workflow inspect <workspace>
  c8c-workflow events <workspace>
  c8c-workflow hil list [--project PATH] [--json]
  c8c-workflow hil show --task <taskToken> [--json]
  c8c-workflow hil respond --task <taskToken> --data-json '{"approved":true}' [--comment TEXT] [--idempotency-key KEY] [--json]
  c8c-workflow hil approve --task <taskToken> [--comment TEXT] [--edited-content TEXT] [--idempotency-key KEY] [--json]
  c8c-workflow hil reject --task <taskToken> [--comment TEXT] [--idempotency-key KEY] [--json]`)
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
      case "--task":
        flags.task = next || ""
        index++
        break
      case "--data-json":
        flags.dataJson = next || ""
        index++
        break
      case "--comment":
        flags.comment = next || ""
        index++
        break
      case "--idempotency-key":
        flags.idempotencyKey = next || ""
        index++
        break
      case "--edited-content":
        flags.editedContent = next || ""
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

function parseHilDataJson(raw: string | undefined): Record<string, unknown> {
  if (!raw?.trim()) {
    throw new Error("hil respond requires --data-json")
  }

  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--data-json must decode to a JSON object")
  }

  return parsed as Record<string, unknown>
}

function resolveCliHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir()
}

async function loadConfiguredProjectRoots(): Promise<string[]> {
  const config = await readJsonMaybe<{ projects?: unknown }>(join(resolveCliHomeDir(), ".c8c", "config.json"))
  if (!config || !Array.isArray(config.projects)) return []
  return [...new Set(
    config.projects
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => resolve(value)),
  )]
}

async function resolveHilRoots(projectPath?: string): Promise<string[]> {
  if (projectPath) {
    return [resolve(projectPath, ".c8c", "runs")]
  }
  const configuredProjects = await loadConfiguredProjectRoots()
  return configuredProjects.map((root) => join(root, ".c8c", "runs"))
}

function printHilTaskSummary(task: WorkflowHilTaskSummary): void {
  const resolution = task.resolution ? ` (${task.resolution})` : ""
  process.stdout.write(
    `${task.status.toUpperCase()} ${task.task}\n`
    + `  ${task.title}${resolution}\n`
    + `  workflow: ${task.workflowName}\n`
    + `  node: ${task.nodeId}\n`
    + `  workspace: ${task.workspace}\n`,
  )
}

function printHilTaskDetails(task: WorkflowHilTaskRecord): void {
  process.stdout.write([
    `Task: ${task.task}`,
    `Task ID: ${task.taskId}`,
    `Status: ${task.state.status}${task.state.resolution ? ` (${task.state.resolution})` : ""}`,
    `Kind: ${task.state.kind}`,
    `Workflow: ${task.state.workflowName}`,
    `Node: ${task.state.nodeId}`,
    `Workspace: ${task.state.workspace}`,
    `Created: ${new Date(task.state.createdAt).toISOString()}`,
    `Updated: ${new Date(task.state.updatedAt).toISOString()}`,
    task.state.instructions ? `Instructions: ${task.state.instructions}` : null,
    task.state.summary ? `Summary: ${task.state.summary}` : null,
    `Request JSON:\n${JSON.stringify(task.request, null, 2)}`,
    task.latestResponse ? `Latest Response:\n${JSON.stringify(task.latestResponse, null, 2)}` : null,
    "",
  ].filter(Boolean).join("\n"))
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
  if (
    parsed.checkpointKind
    && parsed.checkpointKind !== "approval"
    && parsed.checkpointKind !== "human_approval"
    && parsed.checkpointKind !== "human_form"
  ) {
    throw new Error(`Invalid checkpoint kind in OpenClaw compatibility context: ${parsed.checkpointKind}`)
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
    chainId: summary.workspace,
    status: summary.status,
    workspace: summary.workspace,
    reportPath: summary.reportPath || null,
    durationMs: summary.durationMs,
    totalCost: summary.totalCost,
    totalTokensIn: summary.totalTokensIn,
    totalTokensOut: summary.totalTokensOut,
  }
}

export function buildOpenClawApprovalRequest(
  summary: WorkflowRunSummary,
  approvalEvent: ApprovalRequestedEvent | null = null,
  task: WorkflowHilTaskRecord | null = null,
): NonNullable<Extract<OpenClawEnvelope, { ok: true }>["requiresApproval"]> {
  if (approvalEvent) {
    return {
      type: "approval_request",
      prompt: approvalEvent.message || `Approval required for ${approvalEvent.nodeId}`,
      items: [
        {
          nodeId: approvalEvent.nodeId,
          taskId: task?.task,
          content: approvalEvent.content,
          allowEdit: approvalEvent.allowEdit,
        },
      ],
      resumeToken: encodeOpenClawResumeToken({
        version: 1,
        workspace: summary.workspace,
        nodeId: approvalEvent.nodeId,
      }),
      taskId: task?.task,
    }
  }

  if (task?.request.kind === "approval") {
    const defaultEditedContent = typeof task.request.defaults?.editedContent === "string"
      ? task.request.defaults.editedContent
      : undefined
    return {
      type: "approval_request",
      prompt: task.state.instructions || task.state.title,
      items: [
        {
          nodeId: task.state.nodeId,
          taskId: task.task,
          content: defaultEditedContent || task.state.summary || "",
          allowEdit: Boolean(task.state.allowEdit),
        },
      ],
      resumeToken: encodeOpenClawResumeToken({
        version: 1,
        workspace: summary.workspace,
        nodeId: task.state.nodeId,
      }),
      taskId: task.task,
    }
  }

  throw new Error("Approval context missing for tool-mode run")
}

export function buildOpenClawHumanInputRequest(
  task: WorkflowHilTaskRecord,
): NonNullable<Extract<OpenClawEnvelope, { ok: true }>["requiresHumanInput"]> {
  return {
    type: "human_task",
    prompt: task.state.instructions || task.state.title,
    task: task.task,
    taskId: task.taskId,
    request: task.request as Record<string, unknown>,
  }
}

function buildOpenClawSuccessEnvelope(
  status: "ok" | "needs_approval" | "needs_human_input" | "cancelled",
  summary: WorkflowRunSummary,
  approvalEvent: ApprovalRequestedEvent | null = null,
  task: WorkflowHilTaskRecord | null = null,
): OpenClawEnvelope {
  if (status === "needs_approval") {
    return {
      ok: true,
      status,
      output: [buildToolRunSummary(summary)],
      requiresApproval: buildOpenClawApprovalRequest(summary, approvalEvent, task),
      requiresHumanInput: null,
    }
  }

  if (status === "needs_human_input") {
    if (!task) {
      throw new Error("Human input context missing for tool-mode run")
    }
    return {
      ok: true,
      status,
      output: [buildToolRunSummary(summary)],
      requiresApproval: null,
      requiresHumanInput: buildOpenClawHumanInputRequest(task),
    }
  }

  return {
    ok: true,
    status,
    output: [buildToolRunSummary(summary)],
    requiresApproval: null,
    requiresHumanInput: null,
  }
}

async function findOpenClawBlockingTask(workspace: string): Promise<WorkflowHilTaskRecord | null> {
  const candidates = await listWorkflowHilTasks([dirname(workspace)], { includeResolved: true })
  const taskSummary = candidates.find((task) => task.workspace === workspace && task.status === "open")
  if (!taskSummary) return null
  return getWorkflowHilTask(workspace, taskSummary.taskId)
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
    || (command === "respond" && Boolean(flags.task))
}

function checkpointKindForTask(task: WorkflowHilTaskRecord): NonNullable<OpenClawCompatibilityContext["checkpointKind"]> {
  return task.request.kind === "approval" ? "human_approval" : "human_form"
}

async function writeToolModeContextForTask(
  workspace: string,
  context: OpenClawCompatibilityContext,
  task: WorkflowHilTaskRecord,
): Promise<void> {
  await writeOpenClawContext(workspace, {
    ...context,
    taskId: task.taskId,
    checkpointKind: checkpointKindForTask(task),
  })
}

async function continueOpenClawWorkspace(
  workspace: string,
  context: OpenClawCompatibilityContext,
  flags: CliFlags,
): Promise<{ summary: WorkflowRunSummary; approvalEvent: ApprovalRequestedEvent | null }> {
  const runner = createRunner(flags.provider || context.provider)
  const handle = await runner.resumeRun({
    workflow: context.workflow,
    workspace,
    projectPath: context.projectPath,
    workflowPath: context.workflowPath,
    approvalBehavior: "suspend",
  })
  return collectToolRunResult(handle)
}

async function handleOpenClawToolSummary(
  summary: WorkflowRunSummary,
  approvalEvent: ApprovalRequestedEvent | null,
  context: OpenClawCompatibilityContext,
): Promise<number> {
  if (summary.status === "paused") {
    const task = approvalEvent
      ? await getWorkflowHilTask(summary.workspace, approvalTaskId(approvalEvent.nodeId))
      : null
    await writeOpenClawContext(summary.workspace, {
      ...context,
      taskId: task?.taskId,
      checkpointKind: task ? "approval" : undefined,
    })
    writeOpenClawEnvelope(buildOpenClawSuccessEnvelope("needs_approval", summary, approvalEvent, task))
    return 0
  }

  if (summary.status === "blocked") {
    const task = await findOpenClawBlockingTask(summary.workspace)
    if (!task) {
      writeOpenClawEnvelope(buildOpenClawErrorEnvelope("Workflow is blocked, but no open checkpoint task was found"))
      return 1
    }
    await writeToolModeContextForTask(summary.workspace, context, task)
    if (task.request.kind === "approval") {
      writeOpenClawEnvelope(buildOpenClawSuccessEnvelope("needs_approval", summary, null, task))
      return 0
    }
    writeOpenClawEnvelope(buildOpenClawSuccessEnvelope("needs_human_input", summary, null, task))
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
  return handleOpenClawToolSummary(summary, approvalEvent, {
    version: 1,
    workflowPath,
    workflow,
    projectPath: projectPathValue,
    provider: providerOverride,
  })
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

  if (context.checkpointKind === "human_approval") {
    if (!context.taskId) {
      throw new Error("OpenClaw context missing human approval taskId")
    }
    await writeWorkflowHilTaskResponse({
      workspace: token.workspace,
      taskId: context.taskId,
      data: {
        approved: flags.approve,
      },
      source: "openclaw",
    })
  } else {
    await writeWorkflowApprovalDecision(token.workspace, token.nodeId, {
      approved: flags.approve,
    })
  }

  const { summary, approvalEvent } = await continueOpenClawWorkspace(token.workspace, context, flags)
  return handleOpenClawToolSummary(summary, approvalEvent, {
    ...context,
    provider: flags.provider || context.provider,
  })
}

async function respondOpenClawToolMode(flags: CliFlags): Promise<number> {
  if (!flags.task) {
    throw new Error("respond tool mode requires --task")
  }
  if (!flags.dataJson?.trim()) {
    throw new Error("respond tool mode requires --data-json")
  }

  const task = await getWorkflowHilTaskByRef(flags.task)
  if (!task) {
    throw new Error("HIL task not found")
  }

  const context = await readOpenClawContext(task.state.workspace)
  await resolveWorkflowHilTaskByRef(flags.task, {
    data: parseHilDataJson(flags.dataJson),
    comment: flags.comment,
    idempotencyKey: flags.idempotencyKey,
    answeredBy: process.env.USER || process.env.USERNAME || undefined,
    source: "openclaw",
  })

  const { summary, approvalEvent } = await continueOpenClawWorkspace(task.state.workspace, context, flags)
  return handleOpenClawToolSummary(summary, approvalEvent, {
    ...context,
    provider: flags.provider || context.provider,
  })
}

async function runHilCommand(args: string[], flags: CliFlags): Promise<number> {
  const [subcommand = "list"] = args

  if (subcommand === "list") {
    const tasks = await listWorkflowHilTasks(await resolveHilRoots(flags.project))
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(tasks, null, 2)}\n`)
      return 0
    }
    if (tasks.length === 0) {
      process.stdout.write("No open HIL tasks.\n")
      return 0
    }
    for (const task of tasks) {
      printHilTaskSummary(task)
    }
    return 0
  }

  if (subcommand === "show") {
    if (!flags.task) throw new Error("hil show requires --task")
    const task = await getWorkflowHilTaskByRef(flags.task)
    if (!task) throw new Error("HIL task not found")
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(task, null, 2)}\n`)
      return 0
    }
    printHilTaskDetails(task)
    return 0
  }

  if (subcommand === "respond") {
    if (!flags.task) throw new Error("hil respond requires --task")
    const task = await resolveWorkflowHilTaskByRef(flags.task, {
      data: parseHilDataJson(flags.dataJson),
      comment: flags.comment,
      idempotencyKey: flags.idempotencyKey,
      answeredBy: process.env.USER || process.env.USERNAME || undefined,
      source: "cli",
    })
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(task, null, 2)}\n`)
    } else {
      process.stdout.write(`Resolved ${task.task}\n`)
    }
    return 0
  }

  if (subcommand === "approve" || subcommand === "reject") {
    if (!flags.task) throw new Error(`hil ${subcommand} requires --task`)
    const task = await resolveWorkflowHilTaskByRef(flags.task, {
      data: {
        approved: subcommand === "approve",
        ...(flags.editedContent !== undefined ? { editedContent: flags.editedContent } : {}),
      },
      comment: flags.comment,
      idempotencyKey: flags.idempotencyKey,
      answeredBy: process.env.USER || process.env.USERNAME || undefined,
      source: "cli",
    })
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(task, null, 2)}\n`)
    } else {
      process.stdout.write(`Resolved ${task.task} as ${subcommand}\n`)
    }
    return 0
  }

  throw new Error(`Unknown hil subcommand: ${subcommand}`)
}

async function runCommand(command: Command, args: string[]): Promise<number> {
  const { positional, flags } = parseFlags(args)

  if (command === "run" && flags.mode === "tool") {
    return runOpenClawToolMode(positional, flags)
  }

  if (command === "resume" && flags.token) {
    return resumeOpenClawToolMode(flags)
  }

  if (command === "respond") {
    return respondOpenClawToolMode(flags)
  }

  if (command === "hil") {
    return runHilCommand(positional, flags)
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
    || command === "respond"
    || command === "rerun-from"
    || command === "inspect"
    || command === "events"
    || command === "hil"
    || command === "help"
  ) ? isOpenClawToolMode(command, flags) : false

  if (
    command !== "run"
    && command !== "resume"
    && command !== "respond"
    && command !== "rerun-from"
    && command !== "inspect"
    && command !== "events"
    && command !== "hil"
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
