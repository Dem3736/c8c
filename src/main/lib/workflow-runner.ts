import { spawnClaude, type ClaudeSpawnOptions, type ClaudeSpawnResult } from "@claude-tools/runner"
import { execSync } from "node:child_process"
import { mkdtemp, mkdir, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, dirname, basename } from "node:path"
import { BrowserWindow } from "electron"
import { trackTelemetryEvent } from "./telemetry/service"
import { summarizeWorkflowSkillCoverage, workflowFingerprint } from "./telemetry/workflow-usage"
import { LogParser } from "./log-parser"
import { classifyError, estimateCost, collectMetrics, buildNodeMeta } from "./observability"
import {
  findReadyNodes,
  createInitialNodeStates,
  isRunComplete,
  getOutgoingEdges,
  getDownstreamNodeIds,
} from "./graph-engine"
import { parseEvaluatorOutput, buildEvaluatorPrompt } from "./evaluator"
import { expandSplitter, type RuntimeWorkflow, type Subtask } from "./runtime-graph"
import { writeFileAtomic } from "./atomic-write"
import {
  buildSplitterPrompt,
  parseSplitterOutput,
  shouldRetrySplitter,
  buildSplitterRecoveryPrompt,
  heuristicSplitInput,
  tryStructuredSplit,
} from "./node-executors/splitter"
import { mergeResults, buildMergerPrompt } from "./node-executors/merger"
import { buildClaudeExtraArgs, prepareWorkspaceMcpConfig, type WebSearchBackend } from "./mcp-config"
import { scanAllSkills } from "./skill-scanner"
import {
  finalizeRunPidManifest,
  initRunPidManifest,
  recordRunPidExit,
  recordRunPidStart,
  type RunPidManifestMode,
} from "./run-pid-manifest"
import { logWarn } from "./structured-log"
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  WorkflowInput,
  WorkflowEvent,
  NodeInput,
  NodeState,
  RuntimeMetaEntry,
  SkillNodeConfig,
  EvaluatorNodeConfig,
  SplitterNodeConfig,
  MergerNodeConfig,
  ApprovalNodeConfig,
  RunStatus,
  ErrorKind,
  NodeOnErrorPolicy,
  NodeRuntimeConfig,
  NodeRetryBackoff,
  PermissionMode,
} from "@shared/types"

const activeRuns = new Map<string, AbortController>()

// Pause/resume support — stores a resolver that the dispatch loop awaits when paused
const pausedRuns = new Map<string, { paused: boolean; resume: (() => void) | null }>()

export function pauseWorkflowRun(runId: string): boolean {
  const state = pausedRuns.get(runId)
  if (!state) return false
  if (state.paused) return true // already paused
  state.paused = true
  return true
}

export function resumeWorkflowRun(runId: string): boolean {
  const state = pausedRuns.get(runId)
  if (!state) return false
  if (!state.paused) return true // already running
  state.paused = false
  if (state.resume) {
    state.resume()
    state.resume = null
  }
  return true
}

function waitIfPaused(runId: string, signal: AbortSignal): Promise<void> {
  const state = pausedRuns.get(runId)
  if (!state || !state.paused) return Promise.resolve()
  if (signal.aborted) return Promise.resolve()
  return new Promise<void>((resolve) => {
    state.resume = resolve
    // If the run is cancelled while paused, unblock
    const onAbort = () => {
      state.resume = null
      resolve()
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

const RETRYABLE_ERROR_KINDS: ErrorKind[] = ["tool", "model", "timeout", "unknown"]

export interface WorkflowRunSummary {
  runId: string
  status: RunStatus
  workspace: string
  reportPath?: string
  totalCost: number
  totalTokensIn: number
  totalTokensOut: number
  evalScores: Record<string, number>
  durationMs: number
}

interface ResolvedRetryPolicy {
  enabled: boolean
  maxTries: number
  waitMs: number
  backoff: NodeRetryBackoff
  retryOn: Set<ErrorKind>
}

interface ResolvedRuntimePolicy {
  onError: NodeOnErrorPolicy
  retry: ResolvedRetryPolicy
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === "string") return code
  }
  return undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getNodeRuntimeConfig(node: WorkflowNode): NodeRuntimeConfig | undefined {
  const config = node.config as { runtime?: NodeRuntimeConfig }
  return config.runtime
}

function resolveRuntimePolicy(node: WorkflowNode): ResolvedRuntimePolicy {
  const runtime = getNodeRuntimeConfig(node)
  const retry = runtime?.retry
  const configuredRetryOn = retry?.retryOn?.filter(Boolean)
  return {
    onError: runtime?.execution?.onError || "stop",
    retry: {
      enabled: Boolean(retry?.enabled),
      maxTries: Math.max(1, Math.floor(retry?.maxTries ?? 1)),
      waitMs: Math.max(0, Math.floor(retry?.waitMs ?? 0)),
      backoff: retry?.backoff || "none",
      retryOn: new Set(configuredRetryOn && configuredRetryOn.length > 0 ? configuredRetryOn : RETRYABLE_ERROR_KINDS),
    },
  }
}

function computeRetryDelayMs(policy: ResolvedRetryPolicy, retriesUsed: number): number {
  const base = Math.max(0, policy.waitMs)
  if (base === 0) return 0
  if (policy.backoff === "linear") return base * Math.max(1, retriesUsed)
  if (policy.backoff === "exponential") return base * (2 ** Math.max(0, retriesUsed - 1))
  return base
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface SpawnTrackingContext {
  workspace: string
  runId: string
  mode: RunPidManifestMode
  role: string
  nodeId?: string
}

async function spawnClaudeTracked(
  options: ClaudeSpawnOptions,
  tracking: SpawnTrackingContext,
): Promise<ClaudeSpawnResult> {
  const outerOnSpawn = options.onSpawn
  let trackedPid: number | undefined
  const result = await spawnClaude({
    ...options,
    onSpawn: (pid: number) => {
      trackedPid = pid
      outerOnSpawn?.(pid)
      void recordRunPidStart(
        tracking.workspace,
        tracking.runId,
        tracking.mode,
        pid,
        tracking.role,
        tracking.nodeId,
      )
    },
  })

  const pid = typeof trackedPid === "number" ? trackedPid : result.pid
  if (typeof pid === "number") {
    void recordRunPidExit(
      tracking.workspace,
      tracking.runId,
      tracking.mode,
      pid,
      { exitCode: result.exitCode, signal: result.signal },
    )
  }

  return result
}

function workflowNodeTypeCounts(workflow: Workflow): Record<string, number> {
  let skillNodes = 0
  let evaluatorNodes = 0
  let splitterNodes = 0
  let mergerNodes = 0
  let approvalNodes = 0

  for (const node of workflow.nodes) {
    if (node.type === "skill") skillNodes += 1
    if (node.type === "evaluator") evaluatorNodes += 1
    if (node.type === "splitter") splitterNodes += 1
    if (node.type === "merger") mergerNodes += 1
    if (node.type === "approval") approvalNodes += 1
  }

  return {
    nodes_skill: skillNodes,
    nodes_evaluator: evaluatorNodes,
    nodes_splitter: splitterNodes,
    nodes_merger: mergerNodes,
    nodes_approval: approvalNodes,
  }
}

function workflowRunStartTelemetry(
  workflow: Workflow,
  runId: string,
  mode: "run" | "rerun",
): Record<string, string | number | boolean | null> {
  const skillCoverage = summarizeWorkflowSkillCoverage(workflow)
  return {
    workflow_id: workflow.id ?? runId,
    workflow_fingerprint: workflowFingerprint(workflow),
    workflow_version: workflow.version,
    run_mode: mode,
    nodes_total: workflow.nodes.length,
    ...workflowNodeTypeCounts(workflow),
    skill_refs_total: skillCoverage.skillRefsTotal,
    skill_refs_unique: skillCoverage.skillRefsUnique,
    skill_refs: skillCoverage.skillRefsList,
    evaluator_skill_refs_total: skillCoverage.evaluatorSkillRefsTotal,
    evaluator_skill_refs_unique: skillCoverage.evaluatorSkillRefsUnique,
    evaluator_skill_refs: skillCoverage.evaluatorSkillRefsList,
  }
}

function incomingEdgePriority(type: WorkflowEdge["type"]): number {
  if (type === "fail") return 0
  if (type === "pass") return 1
  return 2
}

function selectIncomingContent(
  incomingEdges: WorkflowEdge[],
  nodeStates: Record<string, NodeState>,
  fallback: string,
): string {
  const candidates = incomingEdges.flatMap((edge) => {
    const sourceState = nodeStates[edge.source]
    const content = sourceState?.output?.content
    if (typeof content !== "string" || content.length === 0) return []
    return [{
      edge,
      content,
      completedAt: sourceState.completedAt ?? 0,
    }]
  })

  if (candidates.length === 0) return fallback

  candidates.sort((a, b) => {
    if (a.completedAt !== b.completedAt) {
      return b.completedAt - a.completedAt
    }
    const typeDiff = incomingEdgePriority(a.edge.type) - incomingEdgePriority(b.edge.type)
    if (typeDiff !== 0) return typeDiff
    const sourceDiff = a.edge.source.localeCompare(b.edge.source)
    if (sourceDiff !== 0) return sourceDiff
    return a.edge.id.localeCompare(b.edge.id)
  })

  return candidates[0].content
}

function buildContinueOutput(
  nodeId: string,
  incomingContent: string,
  partialOutput: NodeInput | undefined,
): NodeInput {
  if (partialOutput) {
    return {
      ...partialOutput,
      metadata: {
        ...partialOutput.metadata,
        partial_on_error: true,
        error_policy_applied: "continue",
      },
    }
  }
  return {
    content: incomingContent,
    metadata: {
      source: nodeId,
      output_source: "input_fallback",
      partial_on_error: true,
      error_policy_applied: "continue",
    },
  }
}

function buildErrorEnvelopeOutput(
  nodeId: string,
  incomingContent: string,
  partialOutput: NodeInput | undefined,
  errorKind: ErrorKind,
  message: string,
  attempt: number,
): NodeInput {
  const fallback = partialOutput?.content || incomingContent
  const envelope = {
    ok: false,
    error: {
      kind: errorKind,
      message,
      nodeId,
      attempt,
    },
    fallback: {
      content: fallback,
    },
  }
  return {
    content: JSON.stringify(envelope, null, 2),
    metadata: {
      source: nodeId,
      partial_on_error: true,
      error_policy_applied: "continue_error_output",
      error_envelope: true,
    },
  }
}

function collectUpstreamIds(
  nodeId: string,
  edges: { source: string; target: string }[],
  nodeStates: Record<string, { status: string }>,
): string[] {
  const visited = new Set<string>()
  const queue = edges.filter((e) => e.target === nodeId).map((e) => e.source)
  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    if (nodeStates[id]?.status !== "completed") continue
    visited.add(id)
    for (const edge of edges) {
      if (edge.target === id) queue.push(edge.source)
    }
  }
  return [...visited]
}

function looksLikeJsonDocument(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  const candidate = codeBlockMatch ? codeBlockMatch[1].trim() : trimmed
  if (!candidate.startsWith("{") && !candidate.startsWith("[")) return false

  try {
    JSON.parse(candidate)
    return true
  } catch {
    return false
  }
}

function looksLikeProgressNarration(value: string): boolean {
  const text = value.toLowerCase()
  const markers = [
    "writing the output to the content file",
    "now i have a complete picture",
    "write failed",
    "write result",
    "read result",
    "thinking...",
    "готово.",
    "извлечено",
  ]
  return markers.some((marker) => text.includes(marker))
}

function pickSkillOutput(
  mode: SkillNodeConfig["outputMode"] | undefined,
  stdoutText: string,
  fileContent: string | null,
  effectiveInput: string,
): { content: string; source: "stdout" | "content_file" | "input_fallback" } {
  const effectiveMode = mode || "auto"
  const stdout = stdoutText.trim()
  const fileRaw = fileContent ?? ""
  const file = fileRaw.trim()
  const input = effectiveInput.trim()
  const fileChanged = file.length > 0 && file !== input

  if (effectiveMode === "stdout") {
    if (stdout) return { content: stdout, source: "stdout" }
    if (fileChanged) return { content: fileRaw, source: "content_file" }
    return { content: effectiveInput, source: "input_fallback" }
  }

  if (effectiveMode === "content_file") {
    if (fileChanged) return { content: fileRaw, source: "content_file" }
    if (stdout) return { content: stdout, source: "stdout" }
    return { content: effectiveInput, source: "input_fallback" }
  }

  // Auto mode
  if (!stdout && fileChanged) return { content: fileRaw, source: "content_file" }
  if (stdout && !fileChanged) return { content: stdout, source: "stdout" }
  if (!stdout && !fileChanged) return { content: effectiveInput, source: "input_fallback" }

  const stdoutJson = looksLikeJsonDocument(stdout)
  const fileJson = looksLikeJsonDocument(fileRaw)
  const stdoutLooksNarrative = looksLikeProgressNarration(stdout)
  const fileSubstantiallyLarger = fileRaw.length > Math.max(stdout.length * 1.25, stdout.length + 200)

  if (
    stdoutLooksNarrative ||
    (fileJson && !stdoutJson) ||
    (stdout.length < 120 && fileRaw.length > 220) ||
    fileSubstantiallyLarger
  ) {
    return { content: fileRaw, source: "content_file" }
  }

  return { content: stdout, source: "stdout" }
}

function hasChangedContent(content: string | null, effectiveInput: string): boolean {
  if (!content) return false
  const trimmed = content.trim()
  if (!trimmed) return false
  return trimmed !== effectiveInput.trim()
}

function pickPreferredContentFile(
  primaryFileContent: string | null,
  mirroredFileContent: string | null,
  effectiveInput: string,
): string | null {
  if (!primaryFileContent && !mirroredFileContent) return null

  const primaryChanged = hasChangedContent(primaryFileContent, effectiveInput)
  const mirroredChanged = hasChangedContent(mirroredFileContent, effectiveInput)

  if (primaryChanged && mirroredChanged) {
    const primaryJson = looksLikeJsonDocument(primaryFileContent || "")
    const mirroredJson = looksLikeJsonDocument(mirroredFileContent || "")
    if (primaryJson !== mirroredJson) {
      return mirroredJson ? mirroredFileContent : primaryFileContent
    }
    return (mirroredFileContent || "").length > (primaryFileContent || "").length
      ? mirroredFileContent
      : primaryFileContent
  }

  if (mirroredChanged) return mirroredFileContent
  if (primaryChanged) return primaryFileContent
  return primaryFileContent || mirroredFileContent
}

function sanitizeInvalidUnicode(value: string): string {
  let out = ""
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    const isHigh = code >= 0xD800 && code <= 0xDBFF
    const isLow = code >= 0xDC00 && code <= 0xDFFF

    if (isHigh) {
      const next = value.charCodeAt(i + 1)
      const nextIsLow = next >= 0xDC00 && next <= 0xDFFF
      if (nextIsLow) {
        out += value[i] + value[i + 1]
        i++
      } else {
        out += "\uFFFD"
      }
      continue
    }

    if (isLow) {
      out += "\uFFFD"
      continue
    }

    out += value[i]
  }
  return out
}

async function buildSkillNodeOutput(
  config: SkillNodeConfig,
  stdoutText: string,
  contentFile: string,
  effectiveInput: string,
  nodeId: string,
  partialOnError = false,
): Promise<NodeInput> {
  let primaryFileContent: string | null = null
  try {
    primaryFileContent = await readFile(contentFile, "utf-8")
  } catch (error) {
    // Best effort only: some skills may intentionally avoid writing the content file.
    if (errorCode(error) !== "ENOENT") {
      logWarn("workflow-runner", "skill_content_file_read_failed", {
        contentFile,
        error: errorMessage(error),
      })
    }
  }

  const mirroredContentFile = join(dirname(contentFile), "outputs", basename(contentFile))
  let mirroredFileContent: string | null = null
  if (mirroredContentFile !== contentFile) {
    try {
      mirroredFileContent = await readFile(mirroredContentFile, "utf-8")
    } catch (error) {
      // Best effort only: not all skills write mirrored output files.
      if (errorCode(error) !== "ENOENT") {
        logWarn("workflow-runner", "skill_mirrored_content_file_read_failed", {
          contentFile: mirroredContentFile,
          error: errorMessage(error),
        })
      }
    }
  }

  const fileContent = pickPreferredContentFile(
    primaryFileContent,
    mirroredFileContent,
    effectiveInput,
  )

  const selectedOutput = pickSkillOutput(
    config.outputMode,
    stdoutText,
    fileContent,
    effectiveInput,
  )
  return {
    content: selectedOutput.content || effectiveInput,
    metadata: {
      source: nodeId,
      output_source: selectedOutput.source,
      ...(partialOnError ? { partial_on_error: true } : {}),
    },
  }
}

async function writeNodeOutputFile(workspace: string, nodeId: string, content: string): Promise<void> {
  const sanitizedId = nodeId.replace(/[^a-zA-Z0-9-]/g, "_")
  await writeFileAtomic(join(workspace, "outputs", `${sanitizedId}.md`), content)
}

function serializeNodeStates(
  nodeStates: Record<string, NodeState>,
): Record<string, {
    status: string
    attempts: number
    retriesUsed?: number
    policyApplied?: NodeOnErrorPolicy
    output?: NodeInput
    error?: string
    metrics?: unknown
    errorKind?: string
    meta?: unknown
  }> {
  const serializableStates: Record<string, {
    status: string
    attempts: number
    retriesUsed?: number
    policyApplied?: NodeOnErrorPolicy
    output?: NodeInput
    error?: string
    metrics?: unknown
    errorKind?: string
    meta?: unknown
  }> = {}
  for (const [id, s] of Object.entries(nodeStates)) {
    serializableStates[id] = {
      status: s.status,
      attempts: s.attempts,
      retriesUsed: s.retriesUsed,
      policyApplied: s.policyApplied,
      output: s.output,
      error: s.error,
      metrics: s.metrics,
      errorKind: s.errorKind,
      meta: s.meta,
    }
  }
  return serializableStates
}

async function persistRunState(
  workspace: string,
  nodeStates: Record<string, NodeState>,
  runtimeWorkflow: RuntimeWorkflow,
  input: WorkflowInput,
): Promise<void> {
  await writeFileAtomic(
    join(workspace, "run-state.json"),
    JSON.stringify({
      nodeStates: serializeNodeStates(nodeStates),
      runtimeNodes: runtimeWorkflow.nodes,
      runtimeEdges: runtimeWorkflow.edges,
      runtimeMeta: runtimeWorkflow.runtimeMeta,
      input,
    }, null, 2),
  )
}

function normalizeSkillRef(ref: string): string {
  return ref.trim().toLowerCase()
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content
  const end = content.indexOf("\n---", 3)
  if (end === -1) return content
  return content.slice(end + 4).trim()
}

function createEvaluatorSkillContextResolver(projectPath: string | undefined, workspace: string) {
  const contextCache = new Map<string, string>()
  const skillBodyCache = new Map<string, string>()
  let scannedSkills: Awaited<ReturnType<typeof scanAllSkills>> | null = null

  const ensureScannedSkills = async () => {
    if (scannedSkills) return scannedSkills
    const scanRoot = projectPath || workspace
    try {
      scannedSkills = await scanAllSkills(scanRoot)
    } catch (error) {
      logWarn("workflow-runner", "evaluator_context_scan_skills_failed", {
        scanRoot,
        error: errorMessage(error),
      })
      scannedSkills = []
    }
    return scannedSkills
  }

  const readSkillBody = async (path: string): Promise<string> => {
    const cached = skillBodyCache.get(path)
    if (cached !== undefined) return cached
    try {
      const content = await readFile(path, "utf-8")
      const body = stripFrontmatter(content).trim()
      skillBodyCache.set(path, body)
      return body
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        logWarn("workflow-runner", "evaluator_context_skill_read_failed", {
          path,
          error: errorMessage(error),
        })
      }
      skillBodyCache.set(path, "")
      return ""
    }
  }

  return async (skillRefs?: string[]): Promise<string> => {
    if (!skillRefs || skillRefs.length === 0) return ""
    const refs = skillRefs.map((ref) => ref.trim()).filter(Boolean)
    if (refs.length === 0) return ""

    const cacheKey = refs.map(normalizeSkillRef).join("|")
    const cached = contextCache.get(cacheKey)
    if (cached !== undefined) return cached

    const discovered = await ensureScannedSkills()
    const sections: string[] = []

    for (const ref of refs) {
      const normalizedRef = normalizeSkillRef(ref)
      const found = discovered.find((skill) => (
        normalizeSkillRef(`${skill.category}/${skill.name}`) === normalizedRef
          || normalizeSkillRef(skill.name) === normalizedRef
      ))

      if (!found) {
        sections.push(`### Skill: ${ref}\nSkill not found in scanned project/user skills.`)
        continue
      }

      const fullRef = `${found.category}/${found.name}`
      const body = await readSkillBody(found.path)
      if (!body) {
        sections.push(`### Skill: ${fullRef}\nSkill file was found but could not be read.`)
        continue
      }

      sections.push(`### Skill: ${fullRef}\n${body}`)
    }

    const context = sections.length > 0
      ? sections.join("\n\n")
      : ""
    contextCache.set(cacheKey, context)
    return context
  }
}

// Approval gate: pending approvals keyed by "runId:nodeId"
interface ApprovalResolve {
  resolve: (result: { approved: boolean; editedContent?: string }) => void
}
const pendingApprovals = new Map<string, ApprovalResolve>()

function resolvePendingApprovalsForRun(runId: string, approved = false): void {
  const prefix = `${runId}:`
  for (const [key, pending] of pendingApprovals.entries()) {
    if (!key.startsWith(prefix)) continue
    pending.resolve({ approved })
    pendingApprovals.delete(key)
  }
}

export function resolveApproval(runId: string, nodeId: string, approved: boolean, editedContent?: string): boolean {
  const key = `${runId}:${nodeId}`
  const pending = pendingApprovals.get(key)
  if (pending) {
    pending.resolve({ approved, editedContent })
    pendingApprovals.delete(key)
    return true
  }
  return false
}

function waitForApproval(
  runId: string,
  nodeId: string,
  timeoutMinutes?: number,
  timeoutAction: "auto_approve" | "auto_reject" | "skip" = "auto_reject",
): Promise<{ approved: boolean; editedContent?: string; timedOut?: boolean }> {
  const approvalPromise = new Promise<{ approved: boolean; editedContent?: string; timedOut?: boolean }>((resolve) => {
    pendingApprovals.set(`${runId}:${nodeId}`, { resolve })
  })

  const minutes = timeoutMinutes ?? 60
  if (minutes <= 0) return approvalPromise

  const timeoutPromise = new Promise<{ approved: boolean; editedContent?: string; timedOut?: boolean }>((resolve) => {
    setTimeout(() => {
      // Clean up the pending approval so resolveApproval won't fire after timeout
      pendingApprovals.delete(`${runId}:${nodeId}`)
      const approved = timeoutAction === "auto_approve"
      resolve({ approved, timedOut: true })
    }, minutes * 60_000)
  })

  return Promise.race([approvalPromise, timeoutPromise])
}

export function cancelWorkflowRun(runId: string): boolean {
  const controller = activeRuns.get(runId)
  if (controller) {
    resolvePendingApprovalsForRun(runId, false)
    controller.abort()
    // Don't delete here — finally block in runWorkflow will clean up
    return true
  }
  return false
}

export async function runWorkflow(
  runId: string,
  workflow: Workflow,
  input: WorkflowInput,
  window: BrowserWindow,
  projectPath?: string,
  workflowPath?: string,
  webSearchBackend?: WebSearchBackend,
): Promise<WorkflowRunSummary> {
  const controller = new AbortController()
  activeRuns.set(runId, controller)
  pausedRuns.set(runId, { paused: false, resume: null })

  const onWindowClosed = () => controller.abort()
  window.on("closed", onWindowClosed)

  const nodeStates = createInitialNodeStates(workflow)
  const activatedEdges = new Set<string>()

  // Runtime workflow — may be expanded when splitters are processed
  let runtimeWorkflow: RuntimeWorkflow = {
    ...workflow,
    nodes: [...workflow.nodes],
    edges: [...workflow.edges],
    runtimeMeta: {},
  }

  const send = (event: WorkflowEvent) => {
    try {
      if (!window.isDestroyed()) {
        window.webContents.send("workflow:event", event)
      }
    } catch (error) {
      logWarn("workflow-runner", "send_workflow_event_failed", {
        runId,
        workspace,
        eventType: event.type,
        error: errorMessage(error),
      })
    }

    // Track node completion telemetry
    if (event.type === "node-done" || event.type === "node-error") {
      const state = nodeStates[event.nodeId]
      const node = runtimeWorkflow.nodes.find((n) => n.id === event.nodeId)
      if (state && node) {
        void trackTelemetryEvent("workflow_node_finished", {
          node_type: node.type,
          status: state.status,
          duration_ms: state.completedAt && state.startedAt ? state.completedAt - state.startedAt : 0,
          error_kind: state.errorKind ?? null,
        })
      }
    }
  }

  // Create workspace inside project dir when possible (so Claude has file access)
  const workspaceBase = projectPath
    ? join(projectPath, ".c8c", "runs")
    : join(tmpdir(), "c8c-ws")
  await mkdir(workspaceBase, { recursive: true })
  const workspace = await mkdtemp(join(workspaceBase, `${runId}-`))
  await mkdir(join(workspace, "reports"), { recursive: true })
  await mkdir(join(workspace, "outputs"), { recursive: true })

  const mcpConfigPath = await prepareWorkspaceMcpConfig(workspace, projectPath, webSearchBackend)
  const claudeExtraArgs = buildClaudeExtraArgs(mcpConfigPath)
  const resolveEvaluatorSkillContext = createEvaluatorSkillContextResolver(projectPath, workspace)

  const sanitizedInputValue = sanitizeInvalidUnicode(input.value)

  // Write initial input to workspace/content.md
  await writeFileAtomic(join(workspace, "content.md"), sanitizedInputValue)

  // Write initial run-result.json so interrupted runs are detectable
  const startedAt = Date.now()
  await writeFileAtomic(
    join(workspace, "run-result.json"),
    JSON.stringify({
      runId,
      status: "running",
      workflowName: workflow.name,
      workflowPath: workflowPath || "",
      startedAt,
      completedAt: 0,
      reportPath: "",
      workspace,
    }, null, 2),
  )

  await persistRunState(
    workspace,
    nodeStates,
    runtimeWorkflow,
    { type: "text", value: sanitizedInputValue },
  )
  await initRunPidManifest(workspace, runId, "run")

  void trackTelemetryEvent("workflow_run_started", workflowRunStartTelemetry(workflow, runId, "run"))

  const inputContent = sanitizedInputValue
  let manifestStatus: RunStatus = "interrupted"

  try {
    const maxParallel = workflow.defaults?.maxParallel || 8

    // Process a single node — extracted as a helper
    // Returns true if an evaluator retry was triggered (need to re-check ready nodes)
    // Accumulated cost tracker for budget enforcement
    const getAccumulatedCost = (): number => {
      let total = 0
      for (const s of Object.values(nodeStates)) {
        if (s.metrics?.cost_usd) total += s.metrics.cost_usd
      }
      return total
    }

    const getAccumulatedTokens = (): number => {
      let total = 0
      for (const s of Object.values(nodeStates)) {
        if (s.metrics) total += s.metrics.tokens_in + s.metrics.tokens_out
      }
      return total
    }

    const processNode = async (nodeId: string): Promise<void> => {
      if (controller.signal.aborted) return
      const node = runtimeWorkflow.nodes.find((n) => n.id === nodeId)!
      const runtimePolicy = resolveRuntimePolicy(node)
      const state = nodeStates[node.id]
      state.status = "running"
      state.startedAt = Date.now()
      state.attempts++
      state.policyApplied = undefined
      state.retriesUsed = state.retriesUsed || 0

      send({ type: "node-start", runId, nodeId: node.id })

      // Budget check — skip node if budget exceeded
      if (node.type !== "input" && node.type !== "output") {
        const budgetCost = workflow.defaults?.budget_cost_usd
        const budgetTokens = workflow.defaults?.budget_tokens
        if (budgetCost != null && getAccumulatedCost() >= budgetCost) {
          state.status = "skipped"
          state.completedAt = Date.now()
          state.errorKind = "policy"
          state.error = `Budget exceeded: $${getAccumulatedCost().toFixed(4)} >= $${budgetCost}`
          send({ type: "node-error", runId, nodeId: node.id, error: state.error })
          return
        }
        if (budgetTokens != null && getAccumulatedTokens() >= budgetTokens) {
          state.status = "skipped"
          state.completedAt = Date.now()
          state.errorKind = "policy"
          state.error = `Token budget exceeded: ${getAccumulatedTokens()} >= ${budgetTokens}`
          send({ type: "node-error", runId, nodeId: node.id, error: state.error })
          return
        }
      }

      let recoverOutputOnError: (() => Promise<NodeInput | undefined>) | undefined
      let incomingContent = inputContent

      try {
        // Gather input from completed upstream nodes
        const incoming = runtimeWorkflow.edges.filter((e) => e.target === node.id)
        incomingContent = selectIncomingContent(incoming, nodeStates, inputContent)

        let output: NodeInput

        switch (node.type) {
          case "input":
            output = { content: inputContent, metadata: { source: node.id } }
            break

          case "skill": {
            const config = node.config as SkillNodeConfig

            // Check if this is a runtime fan-out copy
            const meta = runtimeWorkflow.runtimeMeta?.[node.id]

            // If runtime copy, inject subtask content into the incoming content
            const effectiveInputRaw = meta
              ? `Subtask: ${meta.subtaskKey}\n\n${meta.subtaskContent}\n\n--- Original Content ---\n${incomingContent}`
              : incomingContent
            const effectiveInput = sanitizeInvalidUnicode(effectiveInputRaw)

            // Use per-node content file to avoid races in parallel execution
            const contentFile = join(workspace, `content-${node.id.replace(/[^a-zA-Z0-9-]/g, "_")}.md`)
            await writeFileAtomic(contentFile, effectiveInput)

            const workdir = projectPath || workspace
            const logParser = new LogParser()

            // Check for retry feedback from evaluator fail edges
            let retryFeedback = ""
            for (const edge of incoming) {
              if (edge.type === "fail") {
                const evalOutput = nodeStates[edge.source]?.output
                if (evalOutput?.metadata?.score != null) {
                  const lines = [
                    "## Retry Instructions",
                    `Your previous output scored ${evalOutput.metadata.score}/10.`,
                    `Feedback: ${evalOutput.metadata.reason}`,
                  ]
                  if (evalOutput.metadata.fix_instructions) {
                    lines.push("", "**What to fix:**", evalOutput.metadata.fix_instructions)
                  }
                  lines.push(
                    "",
                    `Attempt ${(evalOutput.metadata.iteration || 0) + 1}. Please improve based on this feedback.`,
                    "",
                  )
                  retryFeedback = lines.join("\n")
                }
              }
            }

            const upstreamIds = collectUpstreamIds(node.id, runtimeWorkflow.edges, nodeStates)
            const manifestLines: string[] = []
            for (const uid of upstreamIds) {
              const upNode = runtimeWorkflow.nodes.find((n) => n.id === uid)
              const sanitized = uid.replace(/[^a-zA-Z0-9-]/g, "_")
              const label = (upNode?.config as Record<string, unknown>)?.label || upNode?.type || uid
              manifestLines.push(`- outputs/${sanitized}.md  (${label})`)
            }

            const prompt = sanitizeInvalidUnicode([
              `Workspace: ${workspace}`,
              `Content file: ${contentFile}`,
              "",
              ...(manifestLines.length > 0
                ? ["Available upstream outputs:", ...manifestLines, ""]
                : []),
              ...(retryFeedback ? [retryFeedback] : []),
              config.prompt,
            ].join("\n"))
            const skillModel = config.model || workflow.defaults?.model || "sonnet"

            const updateSkillMetricsAndMeta = () => {
              const metrics = collectMetrics(logParser, state.startedAt!)
              metrics.cost_usd = estimateCost(skillModel, metrics.tokens_in, metrics.tokens_out)
              state.metrics = metrics
              state.meta = buildNodeMeta(prompt, skillModel, config.skillRef)
            }

            recoverOutputOnError = async () => {
              // On transport/model failures we still persist best-effort output for downstream nodes.
              const remaining = logParser.flush()
              for (const entry of remaining) {
                state.log.push(entry)
                send({ type: "node-log", runId, nodeId: node.id, entry })
              }
              updateSkillMetricsAndMeta()
              return buildSkillNodeOutput(
                config,
                logParser.textContent,
                contentFile,
                effectiveInput,
                node.id,
                true,
              )
            }

            // Resolve effective permission mode: node override → workflow default → "edit"
            const effectivePermissionMode: PermissionMode =
              config.permissionMode ?? workflow.defaults?.permissionMode ?? "edit"

            // Merge allowed/disallowed tools from node config and workflow defaults
            const mergedAllowed = [...new Set([
              ...(workflow.defaults?.allowedTools || []),
              ...(config.allowedTools || []),
            ])]
            const planDisallowed = effectivePermissionMode === "plan"
              ? ["Edit", "Write", "NotebookEdit"]
              : []
            const mergedDisallowed = [...new Set([
              ...(workflow.defaults?.disallowedTools || []),
              ...(config.disallowedTools || []),
              ...planDisallowed,
            ])]

            // Snapshot git state before running (edit mode only)
            let preRunDiffStat = ""
            const isGitRepo = effectivePermissionMode === "edit" && (() => {
              try {
                execSync("git rev-parse --is-inside-work-tree", { cwd: workdir, stdio: "pipe" })
                return true
              } catch { return false }
            })()
            if (isGitRepo) {
              try {
                preRunDiffStat = execSync("git diff --stat", { cwd: workdir, encoding: "utf-8" })
              } catch { /* non-critical */ }
            }

            const result = await spawnClaudeTracked({
              workdir,
              prompt,
              model: config.model || workflow.defaults?.model || "sonnet",
              maxTurns: config.maxTurns || workflow.defaults?.maxTurns || 60,
              permissionMode: "acceptEdits",
              extraArgs: claudeExtraArgs,
              addDirs: config.skillPaths?.map((p) => (p.endsWith(".md") ? dirname(p) : p)),
              allowedTools: mergedAllowed.length > 0 ? mergedAllowed : undefined,
              disallowedTools: mergedDisallowed.length > 0 ? mergedDisallowed : undefined,
              abortSignal: controller.signal,
              timeout: (workflow.defaults?.timeout_minutes || 30) * 60 * 1000,
              onStdout: (data: Buffer) => {
                const text = data.toString()
                const entries = logParser.feedChunk(text)
                for (const entry of entries) {
                  state.log.push(entry)
                  send({ type: "node-log", runId, nodeId: node.id, entry })
                }
              },
              onStderr: (data: Buffer) => {
                const entry = {
                  type: "error" as const,
                  content: data.toString(),
                  timestamp: Date.now(),
                }
                state.log.push(entry)
                send({ type: "node-log", runId, nodeId: node.id, entry })
              },
            }, {
              workspace,
              runId,
              mode: "run",
              role: "skill",
              nodeId: node.id,
            })

            // Flush remaining buffer
            const remaining = logParser.flush()
            for (const entry of remaining) {
              state.log.push(entry)
              send({ type: "node-log", runId, nodeId: node.id, entry })
            }

            updateSkillMetricsAndMeta()

            // Capture git diff after node execution (edit mode only)
            if (isGitRepo) {
              try {
                const postRunDiff = execSync("git diff", { cwd: workdir, encoding: "utf-8" })
                if (postRunDiff.trim()) {
                  const fileLines = execSync("git diff --name-only", { cwd: workdir, encoding: "utf-8" })
                  const files = fileLines.trim().split("\n").filter(Boolean)
                  const diffEntry = {
                    type: "diff" as const,
                    content: postRunDiff,
                    files,
                    timestamp: Date.now(),
                  }
                  state.log.push(diffEntry)
                  send({ type: "node-log", runId, nodeId: node.id, entry: diffEntry })
                }
              } catch { /* non-critical */ }
            }

            if (!result.success && !controller.signal.aborted) {
              const detail = result.exitCode === null
                ? "Could not start Claude CLI — check that 'claude' is in your PATH and accessible"
                : `exit code ${result.exitCode}`
              throw new Error(`Skill node failed: ${detail}`)
            }

            output = await buildSkillNodeOutput(
              config,
              logParser.textContent,
              contentFile,
              effectiveInput,
              node.id,
            )
            console.log(`[skill] ${node.id} output: ${output.content.length} chars (source: ${output.metadata.output_source || "input_fallback"})`)
            recoverOutputOnError = undefined
            break
          }

          case "evaluator": {
            const evalConfig = node.config as EvaluatorNodeConfig
            const logParser = new LogParser()
            const evalSkillContext = await resolveEvaluatorSkillContext(evalConfig.skillRefs)
            const evalPrompt = sanitizeInvalidUnicode(
              buildEvaluatorPrompt(evalConfig.criteria, incomingContent, evalSkillContext),
            )

            const evalSpawnResult = await spawnClaudeTracked({
              workdir: projectPath || workspace,
              prompt: evalPrompt,
              model: workflow.defaults?.model || "sonnet",
              maxTurns: 1,
              extraArgs: [...claudeExtraArgs, "--tools", ""],
              addDirs: [],
              abortSignal: controller.signal,
              timeout: 120_000,
              onStdout: (data: Buffer) => {
                const entries = logParser.feedChunk(data.toString())
                for (const entry of entries) {
                  state.log.push(entry)
                  send({ type: "node-log", runId, nodeId: node.id, entry })
                }
              },
              onStderr: (data: Buffer) => {
                const entry = { type: "error" as const, content: data.toString(), timestamp: Date.now() }
                state.log.push(entry)
                send({ type: "node-log", runId, nodeId: node.id, entry })
              },
            }, {
              workspace,
              runId,
              mode: "run",
              role: "evaluator",
              nodeId: node.id,
            })

            if (!evalSpawnResult.success && !controller.signal.aborted) {
              throw new Error(`Evaluator node failed with exit code ${evalSpawnResult.exitCode}`)
            }

            const remaining = logParser.flush()
            for (const entry of remaining) {
              state.log.push(entry)
              send({ type: "node-log", runId, nodeId: node.id, entry })
            }

            // Collect evaluator metrics
            const evalModel = workflow.defaults?.model || "sonnet"
            const evalMetrics = collectMetrics(logParser, state.startedAt!)
            evalMetrics.cost_usd = estimateCost(evalModel, evalMetrics.tokens_in, evalMetrics.tokens_out)
            state.metrics = evalMetrics
            state.meta = buildNodeMeta(evalPrompt, evalModel)

            const evalResult = parseEvaluatorOutput(state.log)
            if (!evalResult) {
              const rawExcerpt = (state.log ?? "").slice(0, 500)
              throw new Error(`Evaluator output parse failed. Expected JSON with numeric 'score' field. Actual output: ${rawExcerpt}`)
            }
            const score = evalResult.score
            const reason = evalResult.reason
            const fixInstructions = evalResult.fix_instructions
            const evalCriteria = evalResult.criteria
            const passed = score >= evalConfig.threshold

            send({
              type: "eval-result",
              runId,
              nodeId: node.id,
              score,
              reason,
              passed,
              attempt: state.attempts,
              fix_instructions: fixInstructions,
              criteria: evalCriteria,
            })

            const evalMetadata = {
              source: node.id,
              score,
              reason,
              iteration: state.attempts,
              fix_instructions: fixInstructions,
            }

            if (passed) {
              // PASS — activate pass edges, complete normally
              output = { content: incomingContent, metadata: evalMetadata }
              for (const e of getOutgoingEdges(runtimeWorkflow, node.id)) {
                if (e.type === "pass" || e.type === "default") activatedEdges.add(e.id)
              }
            } else if (state.attempts < evalConfig.maxRetries && evalConfig.retryFrom) {
              // FAIL with retries left — reset and retry
              const retryTargetId = evalConfig.retryFrom
              const retryTargetState = nodeStates[retryTargetId]

              if (!retryTargetState || retryTargetState.status === "running") {
                // Can't retry — node missing or still running. Treat as exhausted.
                output = { content: incomingContent, metadata: evalMetadata }
                for (const e of getOutgoingEdges(runtimeWorkflow, node.id)) {
                  if (e.type === "pass" || e.type === "default") activatedEdges.add(e.id)
                }
                break
              }

              state.output = { content: incomingContent, metadata: evalMetadata }

              // Deactivate edges from retry target
              for (const e of getOutgoingEdges(runtimeWorkflow, retryTargetId)) {
                activatedEdges.delete(e.id)
              }
              // Deactivate evaluator's outgoing edges
              for (const e of getOutgoingEdges(runtimeWorkflow, node.id)) {
                activatedEdges.delete(e.id)
              }
              // Activate fail edges
              for (const e of getOutgoingEdges(runtimeWorkflow, node.id)) {
                if (e.type === "fail") activatedEdges.add(e.id)
              }

              // Reset retry target
              nodeStates[retryTargetId] = {
                status: "pending",
                attempts: nodeStates[retryTargetId].attempts,
                log: [],
                output: undefined,
              }
              // Reset evaluator (keep attempts)
              state.status = "pending"
              state.log = []

              return // Skip normal completion, main loop will re-check ready nodes
            } else {
              // Max retries exhausted — pass through as-is
              output = { content: incomingContent, metadata: evalMetadata }
              for (const e of getOutgoingEdges(runtimeWorkflow, node.id)) {
                if (e.type === "pass" || e.type === "default") activatedEdges.add(e.id)
              }
            }
            break
          }

          case "splitter": {
            const splitterConfig = node.config as SplitterNodeConfig
            const splitterModel = splitterConfig.model || workflow.defaults?.model || "sonnet"
            const maxBranches = splitterConfig.maxBranches || 8
            const splitterPrompts: string[] = []
            let totalTokensIn = 0
            let totalTokensOut = 0
            let totalCostUsd = 0

            const runSplitterAttempt = async (prompt: string): Promise<string> => {
              const logParser = new LogParser()
              const sanitizedPrompt = sanitizeInvalidUnicode(prompt)
              splitterPrompts.push(sanitizedPrompt)

              const result = await spawnClaudeTracked({
                workdir: projectPath || workspace,
                prompt: sanitizedPrompt,
                model: splitterModel,
                maxTurns: 1,
                extraArgs: [...claudeExtraArgs, "--tools", ""],
                addDirs: [],
                abortSignal: controller.signal,
                timeout: 2 * 60 * 1000,
                onStdout: (data: Buffer) => {
                  const entries = logParser.feedChunk(data.toString())
                  for (const entry of entries) {
                    state.log.push(entry)
                    send({ type: "node-log", runId, nodeId: node.id, entry })
                  }
                },
                onStderr: (data: Buffer) => {
                  const entry = { type: "error" as const, content: data.toString(), timestamp: Date.now() }
                  state.log.push(entry)
                  send({ type: "node-log", runId, nodeId: node.id, entry })
                },
              }, {
                workspace,
                runId,
                mode: "run",
                role: "splitter",
                nodeId: node.id,
              })

              const remaining = logParser.flush()
              for (const entry of remaining) {
                state.log.push(entry)
                send({ type: "node-log", runId, nodeId: node.id, entry })
              }

              const attemptMetrics = collectMetrics(logParser, state.startedAt!)
              totalTokensIn += attemptMetrics.tokens_in
              totalTokensOut += attemptMetrics.tokens_out
              totalCostUsd += estimateCost(splitterModel, attemptMetrics.tokens_in, attemptMetrics.tokens_out)

              if (controller.signal.aborted) {
                throw new Error("Splitter aborted")
              }

              if (!result.success) {
                const entry = {
                  type: "error" as const,
                  content: `[splitter] claude attempt failed (exitCode=${String(result.exitCode)}) - falling back\n`,
                  timestamp: Date.now(),
                }
                state.log.push(entry)
                send({ type: "node-log", runId, nodeId: node.id, entry })
              }
              return logParser.textContent
            }

            // Fast-path: if input is already structured, skip Claude entirely
            const structuredSubtasks = tryStructuredSplit(incomingContent, maxBranches)
            let subtasks: Subtask[]
            if (structuredSubtasks) {
              console.log(`[splitter] using structured input directly (${structuredSubtasks.length} subtasks)`)
              const entry = {
                type: "text" as const,
                content: `[splitter] using structured input directly (${structuredSubtasks.length} subtasks)\n`,
                timestamp: Date.now(),
              }
              state.log.push(entry)
              send({ type: "node-log", runId, nodeId: node.id, entry })
              subtasks = structuredSubtasks
            } else {
              const splitterPrompt = buildSplitterPrompt(splitterConfig.strategy, incomingContent, maxBranches)
              console.log("[splitter] spawning claude...")
              let splitterRawOutput = await runSplitterAttempt(splitterPrompt)
              subtasks = parseSplitterOutput(splitterRawOutput)

              if (maxBranches > 1 && shouldRetrySplitter(subtasks, splitterRawOutput, incomingContent, maxBranches)) {
                console.warn(`[splitter] ${node.id} returned suspicious single subtask, retrying with stricter prompt`)
                const recoveryPrompt = buildSplitterRecoveryPrompt(
                  splitterConfig.strategy,
                  incomingContent,
                  maxBranches,
                )
                splitterRawOutput = await runSplitterAttempt(recoveryPrompt)
                subtasks = parseSplitterOutput(splitterRawOutput)
              }

              const beforeFilterCount = subtasks.length
              subtasks = subtasks.filter((s) => s.content.trim().length > 0)
              if (beforeFilterCount !== subtasks.length) {
                const dropped = beforeFilterCount - subtasks.length
                const entry = {
                  type: "text" as const,
                  content: `[splitter] dropped ${dropped} empty subtasks\n`,
                  timestamp: Date.now(),
                }
                state.log.push(entry)
                send({ type: "node-log", runId, nodeId: node.id, entry })
              }

              const shouldFallbackToHeuristic = subtasks.length === 0 || (
                maxBranches > 1 &&
                shouldRetrySplitter(subtasks, splitterRawOutput, incomingContent, maxBranches)
              )

              if (shouldFallbackToHeuristic) {
                console.warn(`[splitter] ${node.id} using heuristic fallback decomposition`)
                subtasks = heuristicSplitInput(incomingContent, maxBranches)
              }
            }

            const totalSubtasks = subtasks.length
            const usedSubtasks = subtasks.slice(0, maxBranches)
            if (totalSubtasks > usedSubtasks.length) {
              const entry = {
                type: "text" as const,
                content: `[splitter] produced ${totalSubtasks} subtasks, limited to ${usedSubtasks.length} by maxBranches=${maxBranches}\n`,
                timestamp: Date.now(),
              }
              state.log.push(entry)
              send({ type: "node-log", runId, nodeId: node.id, entry })
            }

            // Collect splitter metrics (include retry attempts)
            state.metrics = {
              tokens_in: totalTokensIn,
              tokens_out: totalTokensOut,
              cost_usd: totalCostUsd,
              latency_ms: Date.now() - state.startedAt!,
            }
            state.meta = buildNodeMeta(splitterPrompts.join("\n\n--- RETRY ---\n\n"), splitterModel)

            // Expand runtime graph
            const expanded = expandSplitter(runtimeWorkflow, node.id, usedSubtasks)
            runtimeWorkflow = expanded

            // Initialize states for new runtime nodes
            const newNodeIds: string[] = []
            const runtimeMeta: Record<string, { subtaskKey: string; branchIndex: number; totalBranches: number; templateId: string }> = {}
            for (const rn of expanded.nodes) {
              if (!nodeStates[rn.id]) {
                nodeStates[rn.id] = { status: "pending", attempts: 0, log: [] }
                newNodeIds.push(rn.id)
                if (expanded.runtimeMeta[rn.id]) {
                  runtimeMeta[rn.id] = {
                    subtaskKey: expanded.runtimeMeta[rn.id].subtaskKey,
                    branchIndex: expanded.runtimeMeta[rn.id].branchIndex,
                    totalBranches: expanded.runtimeMeta[rn.id].totalBranches,
                    templateId: expanded.runtimeMeta[rn.id].templateId,
                  }
                }
              }
            }

            // Notify renderer about new runtime nodes + full expanded graph
            send({
              type: "nodes-expanded",
              runId,
              newNodeIds,
              runtimeMeta,
              nodes: expanded.nodes.map(n => ({ id: n.id, type: n.type, position: n.position, config: n.config }) as WorkflowNode),
              edges: expanded.edges.map(e => ({ id: e.id, source: e.source, target: e.target, type: e.type })),
            })

            output = {
              content: JSON.stringify(usedSubtasks),
              metadata: {
                source: node.id,
                splitter_total_subtasks: totalSubtasks,
                splitter_used_subtasks: usedSubtasks.length,
                splitter_truncated: totalSubtasks > usedSubtasks.length,
              },
            }
            break
          }

          case "merger": {
            const mergerConfig = node.config as MergerNodeConfig

            // Gather ALL incoming branch outputs
            const incomingEdges = runtimeWorkflow.edges.filter((e) => e.target === node.id)
            const branchOutputs: NodeInput[] = []
            for (const edge of incomingEdges) {
              const sourceState = nodeStates[edge.source]
              if (sourceState?.output) {
                branchOutputs.push(sourceState.output)
              }
            }
            if (incomingEdges.length > 0 && branchOutputs.length === 0) {
              throw new Error("Merger has no branch outputs to combine")
            }

            if (mergerConfig.strategy === "concatenate") {
              state.metrics = {
                tokens_in: 0,
                tokens_out: 0,
                cost_usd: 0,
                latency_ms: Date.now() - state.startedAt!,
              }
              state.meta = buildNodeMeta("[merger concatenate]", workflow.defaults?.model || "sonnet")
              const merged = mergeResults(branchOutputs, "concatenate")
              output = { content: merged, metadata: { source: node.id } }
            } else {
              // AI-based merge (summarize or select_best)
              const mergePrompt = sanitizeInvalidUnicode(
                buildMergerPrompt(branchOutputs, mergerConfig.strategy, mergerConfig.prompt),
              )
              const logParser = new LogParser()

              const result = await spawnClaudeTracked({
                workdir: projectPath || workspace,
                prompt: mergePrompt,
                model: workflow.defaults?.model || "sonnet",
                maxTurns: 20,
                extraArgs: [...claudeExtraArgs, "--tools", ""],
                addDirs: [],
                abortSignal: controller.signal,
                timeout: 10 * 60 * 1000,
                onStdout: (data: Buffer) => {
                  const entries = logParser.feedChunk(data.toString())
                  for (const entry of entries) {
                    state.log.push(entry)
                    send({ type: "node-log", runId, nodeId: node.id, entry })
                  }
                },
                onStderr: (data: Buffer) => {
                  const entry = { type: "error" as const, content: data.toString(), timestamp: Date.now() }
                  state.log.push(entry)
                  send({ type: "node-log", runId, nodeId: node.id, entry })
                },
              }, {
                workspace,
                runId,
                mode: "run",
                role: "merger",
                nodeId: node.id,
              })

              const remaining = logParser.flush()
              for (const entry of remaining) {
                state.log.push(entry)
                send({ type: "node-log", runId, nodeId: node.id, entry })
              }

              if (!result.success && !controller.signal.aborted) {
                throw new Error(`Merger failed with exit code ${result.exitCode}`)
              }

              // Collect merger metrics
              const mergerModel = workflow.defaults?.model || "sonnet"
              const mergerMetrics = collectMetrics(logParser, state.startedAt!)
              mergerMetrics.cost_usd = estimateCost(mergerModel, mergerMetrics.tokens_in, mergerMetrics.tokens_out)
              state.metrics = mergerMetrics
              state.meta = buildNodeMeta(mergePrompt, mergerModel)

              output = { content: logParser.textContent, metadata: { source: node.id } }
            }
            break
          }

          case "approval": {
            const approvalConfig = node.config as ApprovalNodeConfig
            state.status = "waiting_approval"

            send({
              type: "approval-requested",
              runId,
              nodeId: node.id,
              content: approvalConfig.show_content ? incomingContent : "",
              message: approvalConfig.message,
              allowEdit: approvalConfig.allow_edit,
            })

            // Wait for user decision (with optional timeout)
            const decision = await waitForApproval(
              runId,
              node.id,
              approvalConfig.timeout_minutes,
              approvalConfig.timeout_action ?? "auto_reject",
            )

            if (decision.timedOut) {
              const action = approvalConfig.timeout_action ?? "auto_reject"
              const minutes = approvalConfig.timeout_minutes ?? 60
              send({
                type: "node-log",
                runId,
                nodeId: node.id,
                entry: {
                  type: "text",
                  content: `Approval timed out after ${minutes} minutes. Auto-${action.replace("auto_", "")} applied.\n`,
                  timestamp: Date.now(),
                },
              })
            }

            if (decision.approved) {
              const finalContent = decision.editedContent ?? incomingContent
              output = { content: finalContent, metadata: { source: node.id } }
            } else {
              // Rejected — fail the node
              state.status = "failed"
              state.completedAt = Date.now()
              state.error = decision.timedOut
                ? `Approval timed out (${approvalConfig.timeout_action ?? "auto_reject"})`
                : "Rejected by user"
              send({ type: "node-error", runId, nodeId: node.id, error: state.error })
              return
            }
            break
          }

          case "output":
            output = { content: incomingContent, metadata: { source: node.id } }
            break

          default: {
            const _exhaustive: never = node
            output = { content: incomingContent, metadata: { source: (_exhaustive as WorkflowNode).id } }
            break
          }
        }

        state.status = "completed"
        state.completedAt = Date.now()
        state.output = output

        // Write output file for upstream context passing
        await writeNodeOutputFile(workspace, node.id, output.content)

        // Activate outgoing edges for non-evaluator nodes
        // (evaluator handles its own edge activation inside the switch case)
        if (node.type !== "evaluator") {
          for (const e of getOutgoingEdges(runtimeWorkflow, node.id)) {
            activatedEdges.add(e.id)
          }
        }

        send({ type: "node-done", runId, nodeId: node.id, output })
      } catch (err) {
        if (controller.signal.aborted) {
          state.status = "failed"
          return
        }
        let partialOutput: NodeInput | undefined
        if (recoverOutputOnError) {
          try {
            partialOutput = await recoverOutputOnError()
          } catch (recoveryErr) {
            console.error(`[workflow-runner] failed to recover partial output for ${node.id}:`, recoveryErr)
          }
        }
        const errMsg = String(err)
        const timedOut = errMsg.includes("timed out") || errMsg.includes("ETIMEDOUT") || errMsg.includes("timeout")
        state.completedAt = Date.now()
        state.error = errMsg
        state.errorKind = classifyError(err, timedOut)

        const canRetry = runtimePolicy.retry.enabled
          && state.retriesUsed! < runtimePolicy.retry.maxTries - 1
          && runtimePolicy.retry.retryOn.has(state.errorKind)
        if (canRetry) {
          state.retriesUsed = (state.retriesUsed || 0) + 1
          const retryDelayMs = computeRetryDelayMs(runtimePolicy.retry, state.retriesUsed)
          const retryErrorKind = state.errorKind
          state.status = "pending"
          state.error = undefined
          state.errorKind = undefined
          state.completedAt = undefined
          const retryLog = {
            type: "text" as const,
            content: `[runtime-retry] attempt ${state.retriesUsed + 1}/${runtimePolicy.retry.maxTries} in ${retryDelayMs}ms after ${retryErrorKind} error\n`,
            timestamp: Date.now(),
          }
          state.log.push(retryLog)
          send({ type: "node-log", runId, nodeId: node.id, entry: retryLog })
          state.attempts = Math.max(0, state.attempts - 1)
          await sleep(retryDelayMs)
          return processNode(node.id)
        }

        const onError = runtimePolicy.onError
        state.policyApplied = onError

        if (onError === "stop") {
          state.status = "failed"
          state.output = partialOutput
          if (partialOutput) {
            try {
              await writeNodeOutputFile(workspace, node.id, partialOutput.content)
            } catch (writeErr) {
              console.error(`[workflow-runner] failed to persist partial output for ${node.id}:`, writeErr)
            }
            send({ type: "node-done", runId, nodeId: node.id, output: partialOutput })
          }
          send({ type: "node-error", runId, nodeId: node.id, error: errMsg })
          return
        }

        const output = onError === "continue_error_output"
          ? buildErrorEnvelopeOutput(
            node.id,
            incomingContent,
            partialOutput,
            state.errorKind,
            errMsg,
            state.attempts,
          )
          : buildContinueOutput(node.id, incomingContent, partialOutput)

        state.status = "completed"
        state.output = output

        try {
          await writeNodeOutputFile(workspace, node.id, output.content)
        } catch (writeErr) {
          console.error(`[workflow-runner] failed to persist policy output for ${node.id}:`, writeErr)
        }

        for (const e of getOutgoingEdges(runtimeWorkflow, node.id)) {
          activatedEdges.add(e.id)
        }

        send({ type: "node-done", runId, nodeId: node.id, output })
        send({ type: "node-error", runId, nodeId: node.id, error: errMsg })
        return
      } finally {
        try {
          await persistRunState(
            workspace,
            nodeStates,
            runtimeWorkflow,
            { type: "text", value: inputContent },
          )
        } catch (error) {
          logWarn("workflow-runner", "persist_run_state_checkpoint_failed", {
            runId,
            workspace,
            nodeId: node.id,
            error: errorMessage(error),
          })
        }
      }
    }

    // Main execution loop — parallel with maxParallel limit
    const runningPromises = new Map<string, Promise<void>>()
    let activeSplitterNodeId: string | null = null
    const STALL_TIMEOUT_MS = (workflow.defaults?.timeout_minutes || 30) * 60 * 1000 + 60_000 // node timeout + 1 min buffer
    let lastProgressAt = Date.now()

    while (!controller.signal.aborted) {
      // If paused, wait until resumed (or cancelled)
      await waitIfPaused(runId, controller.signal)
      if (controller.signal.aborted) break

      const readyNodes = findReadyNodes(runtimeWorkflow, nodeStates, activatedEdges)
      const newReady = readyNodes.filter((n) => !runningPromises.has(n.id))

      if (newReady.length === 0 && runningPromises.size === 0) break

      // Launch new nodes up to maxParallel
      for (const node of newReady) {
        if (controller.signal.aborted) break
        if (runningPromises.size >= maxParallel) break

        // Splitter expansion mutates runtimeWorkflow. Run splitters exclusively to avoid
        // concurrent graph mutations from parallel splitter nodes.
        if (node.type === "splitter") {
          if (activeSplitterNodeId && activeSplitterNodeId !== node.id) continue
          if (runningPromises.size > 0) continue
        } else if (activeSplitterNodeId) {
          continue
        }

        if (nodeStates[node.id]?.status === "pending") {
          nodeStates[node.id].status = "queued"
        }

        if (node.type === "splitter") {
          activeSplitterNodeId = node.id
        }

        const promise = processNode(node.id).finally(() => {
          runningPromises.delete(node.id)
          if (activeSplitterNodeId === node.id) {
            activeSplitterNodeId = null
          }
        })
        runningPromises.set(node.id, promise)
      }

      // Wait for at least one to complete before checking again
      if (runningPromises.size > 0) {
        const sizeBefore = runningPromises.size
        await Promise.race(runningPromises.values())
        if (runningPromises.size < sizeBefore) {
          lastProgressAt = Date.now()
        }
        if (Date.now() - lastProgressAt > STALL_TIMEOUT_MS) {
          // Identify stalled nodes and emit descriptive errors before aborting
          for (const stalledNodeId of runningPromises.keys()) {
            const stalledNode = runtimeWorkflow.nodes.find((n) => n.id === stalledNodeId)
            const stalledState = nodeStates[stalledNodeId]
            if (stalledNode && stalledState) {
              const nodeLabel = stalledNode.type === "skill"
                ? (stalledNode.config as SkillNodeConfig).skillRef || "skill"
                : stalledNode.type
              const elapsedMs = stalledState.startedAt ? Date.now() - stalledState.startedAt : Date.now() - lastProgressAt
              const elapsedMinutes = Math.round(elapsedMs / 60_000)
              const stallError = `Node '${nodeLabel}' (${stalledNode.type}) stopped responding after ${elapsedMinutes} minutes. Run was stopped.`
              console.error(`[workflow-runner] stall detected: ${stallError}`)
              stalledState.status = "failed"
              stalledState.completedAt = Date.now()
              stalledState.error = stallError
              send({ type: "node-error", runId, nodeId: stalledNodeId, error: stallError })
            }
          }
          controller.abort()
        }
      }
    }

    // Mark unresolved nodes as skipped so isRunComplete returns true
    for (const [nodeId, state] of Object.entries(nodeStates)) {
      if (
        state.status === "pending"
        || state.status === "queued"
        || state.status === "running"
        || state.status === "waiting_approval"
      ) {
        state.status = "skipped"
        send({ type: "node-done", runId, nodeId, output: { content: "", metadata: { source: nodeId, skipped: true } } })
      }
    }

    const finalStatus: RunStatus = controller.signal.aborted
      ? "cancelled"
      : isRunComplete(nodeStates) && Object.values(nodeStates).every((s) => s.status !== "failed")
        ? "completed"
        : "failed"
    manifestStatus = finalStatus

    let reportPath: string | undefined
    let totalCost = 0
    let totalTokensIn = 0
    let totalTokensOut = 0
    const evalScores: Record<string, number> = {}
    let completedAt = Date.now()
    let durationMs = completedAt - startedAt
    try {
      // Save report.md from output node
      const outputNode = runtimeWorkflow.nodes.find((n) => n.type === "output")
      if (outputNode && nodeStates[outputNode.id]?.output?.content) {
        const reportFile = join(workspace, "report.md")
        await writeFileAtomic(reportFile, nodeStates[outputNode.id].output!.content)
        reportPath = reportFile
      }

      // Collect aggregate metrics for run comparison
      for (const [id, s] of Object.entries(nodeStates)) {
        if (s.metrics) {
          totalCost += s.metrics.cost_usd
          totalTokensIn += s.metrics.tokens_in
          totalTokensOut += s.metrics.tokens_out
        }
        if (s.output?.metadata?.score != null) {
          evalScores[id] = s.output.metadata.score
        }
      }

      completedAt = Date.now()
      durationMs = completedAt - startedAt

      // Update run-result.json with final status and metrics
      await writeFileAtomic(
        join(workspace, "run-result.json"),
        JSON.stringify({
          runId,
          status: finalStatus,
          workflowName: workflow.name,
          workflowPath: workflowPath || "",
          startedAt,
          completedAt,
          reportPath: reportPath || "",
          workspace,
          totalCost,
          totalTokensIn,
          totalTokensOut,
          evalScores,
          durationMs,
        }, null, 2),
      )
    } catch (err) {
      console.error("[workflow-runner] failed to save report/result:", err)
    }

    // Save run state for selective rerun
    try {
      await persistRunState(
        workspace,
        nodeStates,
        runtimeWorkflow,
        { type: "text", value: inputContent },
      )
    } catch (err) {
      console.error("[workflow-runner] failed to save run state:", err)
    }

    send({ type: "run-done", runId, status: finalStatus, reportPath, workspace })

    const nodesFailed = Object.values(nodeStates).filter((s) => s.status === "failed").length
    void trackTelemetryEvent("workflow_run_finished", {
      run_mode: "run",
      status: finalStatus,
      duration_ms: durationMs,
      nodes_total: runtimeWorkflow.nodes.length,
      nodes_failed: nodesFailed,
      total_cost_usd: totalCost,
    })

    return {
      runId,
      status: finalStatus,
      workspace,
      reportPath,
      totalCost,
      totalTokensIn,
      totalTokensOut,
      evalScores,
      durationMs,
    }
  } finally {
    const fallbackStatus: RunStatus = controller.signal.aborted ? "cancelled" : "failed"
    await finalizeRunPidManifest(workspace, runId, "run", manifestStatus === "interrupted" ? fallbackStatus : manifestStatus)
    resolvePendingApprovalsForRun(runId, false)
    activeRuns.delete(runId)
    pausedRuns.delete(runId)
    try {
      window.removeListener("closed", onWindowClosed)
    } catch (error) {
      logWarn("workflow-runner", "remove_window_listener_failed", {
        runId,
        workspace,
        error: errorMessage(error),
      })
    }
  }
}

/**
 * Rerun a workflow from a specific node, reusing upstream outputs.
 * Resets the target node and all downstream nodes to "pending", then re-enters the execution loop.
 */
export async function rerunFromNode(
  runId: string,
  fromNodeId: string,
  workflow: Workflow,
  workspace: string,
  window: BrowserWindow,
  projectPath?: string,
  workflowPath?: string,
  webSearchBackend?: WebSearchBackend,
): Promise<void> {
  // Load saved run state
  let savedState: {
    nodeStates: Record<string, NodeState>
    runtimeNodes?: WorkflowNode[]
    runtimeEdges?: WorkflowEdge[]
    runtimeMeta?: Record<string, RuntimeMetaEntry>
    input?: WorkflowInput
  }
  try {
    const raw = await readFile(join(workspace, "run-state.json"), "utf-8")
    savedState = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Cannot rerun: run state not found in ${workspace} (${errorMessage(error)})`)
  }

  const controller = new AbortController()
  activeRuns.set(runId, controller)
  pausedRuns.set(runId, { paused: false, resume: null })

  const onWindowClosed = () => controller.abort()
  window.on("closed", onWindowClosed)

  const send = (event: WorkflowEvent) => {
    try {
      if (!window.isDestroyed()) {
        window.webContents.send("workflow:event", event)
      }
    } catch (error) {
      logWarn("workflow-runner", "send_workflow_event_failed", {
        runId,
        workspace,
        eventType: event.type,
        error: errorMessage(error),
      })
    }

    if (event.type === "node-done" || event.type === "node-error") {
      const state = nodeStates[event.nodeId]
      const node = runtimeWorkflow.nodes.find((n) => n.id === event.nodeId)
      if (state && node) {
        void trackTelemetryEvent("workflow_node_finished", {
          node_type: node.type,
          status: state.status,
          duration_ms: state.completedAt && state.startedAt ? state.completedAt - state.startedAt : 0,
          error_kind: state.errorKind ?? null,
        })
      }
    }
  }

  // Reconstruct runtime workflow
  let runtimeWorkflow: RuntimeWorkflow = {
    ...workflow,
    nodes: savedState.runtimeNodes || [...workflow.nodes],
    edges: savedState.runtimeEdges || [...workflow.edges],
    runtimeMeta: (savedState.runtimeMeta || {}) as RuntimeWorkflow["runtimeMeta"],
  }

  // Restore nodeStates, adding back log arrays (not serialized)
  const nodeStates: Record<string, NodeState> = {}
  for (const [id, s] of Object.entries(savedState.nodeStates)) {
    nodeStates[id] = { ...s, log: [] } as NodeState
  }

  // Find all downstream nodes (including fromNodeId itself) and reset them
  const downstreamIds = new Set(getDownstreamNodeIds(runtimeWorkflow, fromNodeId))
  for (const id of downstreamIds) {
    if (nodeStates[id]) {
      nodeStates[id] = { status: "pending", attempts: 0, log: [] }
    }
  }

  // Rebuild activatedEdges from completed upstream nodes
  const activatedEdges = new Set<string>()
  for (const edge of runtimeWorkflow.edges) {
    if (!downstreamIds.has(edge.source) && nodeStates[edge.source]?.status === "completed") {
      activatedEdges.add(edge.id)
    }
  }

  // Notify UI about the reset
  for (const id of downstreamIds) {
    send({ type: "node-start", runId, nodeId: id })
    // Immediately mark as pending (the node-start was to signal reset)
    send({ type: "node-log", runId, nodeId: id, entry: { type: "text", content: "[rerun] resetting node\n", timestamp: Date.now() } })
  }

  const inputContent = sanitizeInvalidUnicode(savedState.input?.value || "")
  await mkdir(join(workspace, "outputs"), { recursive: true })
  const mcpConfigPath = await prepareWorkspaceMcpConfig(workspace, projectPath, webSearchBackend)
  const claudeExtraArgs = buildClaudeExtraArgs(mcpConfigPath)
  const resolveEvaluatorSkillContext = createEvaluatorSkillContextResolver(projectPath, workspace)
  const rerunStartedAt = Date.now()

  await persistRunState(
    workspace,
    nodeStates,
    runtimeWorkflow,
    savedState.input || { type: "text", value: inputContent },
  )
  await initRunPidManifest(workspace, runId, "rerun")

  void trackTelemetryEvent("workflow_run_started", workflowRunStartTelemetry(workflow, runId, "rerun"))
  let manifestStatus: RunStatus = "interrupted"

  try {
    const maxParallel = workflow.defaults?.maxParallel || 8

    const getAccumulatedCost = (): number => {
      let total = 0
      for (const s of Object.values(nodeStates)) {
        if (s.metrics?.cost_usd) total += s.metrics.cost_usd
      }
      return total
    }

    const getAccumulatedTokens = (): number => {
      let total = 0
      for (const s of Object.values(nodeStates)) {
        if (s.metrics) total += s.metrics.tokens_in + s.metrics.tokens_out
      }
      return total
    }

    // === Inline execution loop (same as runWorkflow's processNode) ===
    // This is a re-entry into the main loop with pre-existing state.

    const processNode = async (nodeId: string): Promise<void> => {
      if (controller.signal.aborted) return
      const node = runtimeWorkflow.nodes.find((n) => n.id === nodeId)!
      const runtimePolicy = resolveRuntimePolicy(node)
      const state = nodeStates[node.id]
      state.status = "running"
      state.startedAt = Date.now()
      state.attempts++
      state.policyApplied = undefined
      state.retriesUsed = state.retriesUsed || 0

      send({ type: "node-start", runId, nodeId: node.id })

      let recoverOutputOnError: (() => Promise<NodeInput | undefined>) | undefined
      let incomingContent = inputContent

      try {
        // Budget check — skip node if budget exceeded
        if (node.type !== "input" && node.type !== "output") {
          const budgetCost = workflow.defaults?.budget_cost_usd
          const budgetTokens = workflow.defaults?.budget_tokens
          if (budgetCost != null && getAccumulatedCost() >= budgetCost) {
            state.status = "skipped"
            state.completedAt = Date.now()
            state.errorKind = "policy"
            state.error = `Budget exceeded: $${getAccumulatedCost().toFixed(4)} >= $${budgetCost}`
            send({ type: "node-error", runId, nodeId: node.id, error: state.error })
            return
          }
          if (budgetTokens != null && getAccumulatedTokens() >= budgetTokens) {
            state.status = "skipped"
            state.completedAt = Date.now()
            state.errorKind = "policy"
            state.error = `Token budget exceeded: ${getAccumulatedTokens()} >= ${budgetTokens}`
            send({ type: "node-error", runId, nodeId: node.id, error: state.error })
            return
          }
        }

        const incoming = runtimeWorkflow.edges.filter((e) => e.target === node.id)
        incomingContent = selectIncomingContent(incoming, nodeStates, inputContent)

        let output: NodeInput

        switch (node.type) {
          case "input":
            output = { content: inputContent, metadata: { source: node.id } }
            break

          case "skill": {
            const config = node.config as SkillNodeConfig
            const meta = runtimeWorkflow.runtimeMeta?.[node.id]
            const effectiveInputRaw = meta
              ? `Subtask: ${meta.subtaskKey}\n\n${meta.subtaskContent}\n\n--- Original Content ---\n${incomingContent}`
              : incomingContent
            const effectiveInput = sanitizeInvalidUnicode(effectiveInputRaw)

            const contentFile = join(workspace, `content-${node.id.replace(/[^a-zA-Z0-9-]/g, "_")}.md`)
            await writeFileAtomic(contentFile, effectiveInput)

            const workdir = projectPath || workspace
            const logParser = new LogParser()

            let retryFeedback = ""
            for (const edge of incoming) {
              if (edge.type === "fail") {
                const evalOutput = nodeStates[edge.source]?.output
                if (evalOutput?.metadata?.score != null) {
                  const lines = [
                    "## Retry Instructions",
                    `Your previous output scored ${evalOutput.metadata.score}/10.`,
                    `Feedback: ${evalOutput.metadata.reason}`,
                  ]
                  if (evalOutput.metadata.fix_instructions) {
                    lines.push("", "**What to fix:**", evalOutput.metadata.fix_instructions)
                  }
                  lines.push(
                    "",
                    `Attempt ${(evalOutput.metadata.iteration || 0) + 1}. Please improve based on this feedback.`,
                    "",
                  )
                  retryFeedback = lines.join("\n")
                }
              }
            }

            const upstreamIds = collectUpstreamIds(node.id, runtimeWorkflow.edges, nodeStates)
            const manifestLines: string[] = []
            for (const uid of upstreamIds) {
              const upNode = runtimeWorkflow.nodes.find((n) => n.id === uid)
              const sanitized = uid.replace(/[^a-zA-Z0-9-]/g, "_")
              const label = (upNode?.config as Record<string, unknown>)?.label || upNode?.type || uid
              manifestLines.push(`- outputs/${sanitized}.md  (${label})`)
            }

            const prompt = sanitizeInvalidUnicode([
              `Workspace: ${workspace}`,
              `Content file: ${contentFile}`,
              "",
              ...(manifestLines.length > 0 ? ["Available upstream outputs:", ...manifestLines, ""] : []),
              ...(retryFeedback ? [retryFeedback] : []),
              config.prompt,
            ].join("\n"))
            const skillModel = config.model || workflow.defaults?.model || "sonnet"

            const updateSkillMetricsAndMeta = () => {
              const metrics = collectMetrics(logParser, state.startedAt!)
              metrics.cost_usd = estimateCost(skillModel, metrics.tokens_in, metrics.tokens_out)
              state.metrics = metrics
              state.meta = buildNodeMeta(prompt, skillModel, config.skillRef)
            }

            recoverOutputOnError = async () => {
              for (const entry of logParser.flush()) {
                state.log.push(entry)
                send({ type: "node-log", runId, nodeId: node.id, entry })
              }
              updateSkillMetricsAndMeta()
              return buildSkillNodeOutput(
                config,
                logParser.textContent,
                contentFile,
                effectiveInput,
                node.id,
                true,
              )
            }

            const retryPermissionMode: PermissionMode =
              config.permissionMode ?? workflow.defaults?.permissionMode ?? "edit"
            const mergedAllowed = [...new Set([...(workflow.defaults?.allowedTools || []), ...(config.allowedTools || [])])]
            const retryPlanDisallowed = retryPermissionMode === "plan"
              ? ["Edit", "Write", "NotebookEdit"]
              : []
            const mergedDisallowed = [...new Set([...(workflow.defaults?.disallowedTools || []), ...(config.disallowedTools || []), ...retryPlanDisallowed])]

            const result = await spawnClaudeTracked({
              workdir,
              prompt,
              model: config.model || workflow.defaults?.model || "sonnet",
              maxTurns: config.maxTurns || workflow.defaults?.maxTurns || 60,
              permissionMode: "acceptEdits",
              extraArgs: claudeExtraArgs,
              addDirs: config.skillPaths?.map((p) => (p.endsWith(".md") ? dirname(p) : p)),
              allowedTools: mergedAllowed.length > 0 ? mergedAllowed : undefined,
              disallowedTools: mergedDisallowed.length > 0 ? mergedDisallowed : undefined,
              abortSignal: controller.signal,
              timeout: (workflow.defaults?.timeout_minutes || 30) * 60 * 1000,
              onStdout: (data: Buffer) => {
                for (const entry of logParser.feedChunk(data.toString())) {
                  state.log.push(entry)
                  send({ type: "node-log", runId, nodeId: node.id, entry })
                }
              },
              onStderr: (data: Buffer) => {
                const entry = { type: "error" as const, content: data.toString(), timestamp: Date.now() }
                state.log.push(entry)
                send({ type: "node-log", runId, nodeId: node.id, entry })
              },
            }, {
              workspace,
              runId,
              mode: "rerun",
              role: "skill",
              nodeId: node.id,
            })

            for (const entry of logParser.flush()) {
              state.log.push(entry)
              send({ type: "node-log", runId, nodeId: node.id, entry })
            }

            updateSkillMetricsAndMeta()

            if (!result.success && !controller.signal.aborted) {
              const detail = result.exitCode === null
                ? "Could not start Claude CLI — check that 'claude' is in your PATH and accessible"
                : `exit code ${result.exitCode}`
              throw new Error(`Skill node failed: ${detail}`)
            }

            output = await buildSkillNodeOutput(
              config,
              logParser.textContent,
              contentFile,
              effectiveInput,
              node.id,
            )
            recoverOutputOnError = undefined
            break
          }

          case "evaluator": {
            const evalConfig = node.config as EvaluatorNodeConfig
            const logParser = new LogParser()
            const evalSkillContext = await resolveEvaluatorSkillContext(evalConfig.skillRefs)
            const evalPrompt = sanitizeInvalidUnicode(
              buildEvaluatorPrompt(evalConfig.criteria, incomingContent, evalSkillContext),
            )

            const evalSpawnResult = await spawnClaudeTracked({
              workdir: projectPath || workspace,
              prompt: evalPrompt,
              model: workflow.defaults?.model || "sonnet",
              maxTurns: 1,
              extraArgs: [...claudeExtraArgs, "--tools", ""],
              addDirs: [],
              abortSignal: controller.signal,
              timeout: 120_000,
              onStdout: (data: Buffer) => {
                for (const entry of logParser.feedChunk(data.toString())) {
                  state.log.push(entry)
                  send({ type: "node-log", runId, nodeId: node.id, entry })
                }
              },
              onStderr: (data: Buffer) => {
                const entry = { type: "error" as const, content: data.toString(), timestamp: Date.now() }
                state.log.push(entry)
                send({ type: "node-log", runId, nodeId: node.id, entry })
              },
            }, {
              workspace,
              runId,
              mode: "rerun",
              role: "evaluator",
              nodeId: node.id,
            })

            if (!evalSpawnResult.success && !controller.signal.aborted) {
              throw new Error(`Evaluator node failed with exit code ${evalSpawnResult.exitCode}`)
            }

            for (const entry of logParser.flush()) {
              state.log.push(entry)
              send({ type: "node-log", runId, nodeId: node.id, entry })
            }

            const evalModel = workflow.defaults?.model || "sonnet"
            const evalMetrics = collectMetrics(logParser, state.startedAt!)
            evalMetrics.cost_usd = estimateCost(evalModel, evalMetrics.tokens_in, evalMetrics.tokens_out)
            state.metrics = evalMetrics
            state.meta = buildNodeMeta(evalPrompt, evalModel)

            const evalResult = parseEvaluatorOutput(state.log)
            if (!evalResult) {
              const rawExcerpt = (state.log ?? "").slice(0, 500)
              throw new Error(`Evaluator output parse failed. Expected JSON with numeric 'score' field. Actual output: ${rawExcerpt}`)
            }
            const score = evalResult.score
            const reason = evalResult.reason
            const fixInstructions = evalResult.fix_instructions
            const evalCriteria = evalResult.criteria
            const passed = score >= evalConfig.threshold

            send({ type: "eval-result", runId, nodeId: node.id, score, reason, passed, attempt: state.attempts, fix_instructions: fixInstructions, criteria: evalCriteria })

            const evalMetadata = { source: node.id, score, reason, iteration: state.attempts, fix_instructions: fixInstructions }

            if (passed) {
              output = { content: incomingContent, metadata: evalMetadata }
              for (const e of getOutgoingEdges(runtimeWorkflow, node.id)) {
                if (e.type === "pass" || e.type === "default") activatedEdges.add(e.id)
              }
            } else if (state.attempts < evalConfig.maxRetries && evalConfig.retryFrom) {
              state.output = { content: incomingContent, metadata: evalMetadata }
              for (const e of getOutgoingEdges(runtimeWorkflow, evalConfig.retryFrom)) activatedEdges.delete(e.id)
              for (const e of getOutgoingEdges(runtimeWorkflow, node.id)) activatedEdges.delete(e.id)
              for (const e of getOutgoingEdges(runtimeWorkflow, node.id)) {
                if (e.type === "fail") activatedEdges.add(e.id)
              }
              const retryTargetId = evalConfig.retryFrom
              nodeStates[retryTargetId] = { status: "pending", attempts: nodeStates[retryTargetId].attempts, log: [] }
              state.status = "pending"
              state.log = []
              return
            } else {
              output = { content: incomingContent, metadata: evalMetadata }
              for (const e of getOutgoingEdges(runtimeWorkflow, node.id)) {
                if (e.type === "pass" || e.type === "default") activatedEdges.add(e.id)
              }
            }
            break
          }

          case "splitter": {
            const splitterConfig = node.config as SplitterNodeConfig
            const splitterModel = splitterConfig.model || workflow.defaults?.model || "sonnet"
            const maxBranches = splitterConfig.maxBranches || 8
            const splitterPrompts: string[] = []
            let totalTokensIn = 0
            let totalTokensOut = 0
            let totalCostUsd = 0

            const runSplitterAttempt = async (prompt: string): Promise<string> => {
              const logParser = new LogParser()
              const sanitizedPrompt = sanitizeInvalidUnicode(prompt)
              splitterPrompts.push(sanitizedPrompt)

              const result = await spawnClaudeTracked({
                workdir: projectPath || workspace,
                prompt: sanitizedPrompt,
                model: splitterModel,
                maxTurns: 1,
                extraArgs: [...claudeExtraArgs, "--tools", ""],
                addDirs: [],
                abortSignal: controller.signal,
                timeout: 2 * 60 * 1000,
                onStdout: (data: Buffer) => {
                  const entries = logParser.feedChunk(data.toString())
                  for (const entry of entries) {
                    state.log.push(entry)
                    send({ type: "node-log", runId, nodeId: node.id, entry })
                  }
                },
                onStderr: (data: Buffer) => {
                  const entry = { type: "error" as const, content: data.toString(), timestamp: Date.now() }
                  state.log.push(entry)
                  send({ type: "node-log", runId, nodeId: node.id, entry })
                },
              }, {
                workspace,
                runId,
                mode: "rerun",
                role: "splitter",
                nodeId: node.id,
              })

              const remaining = logParser.flush()
              for (const entry of remaining) {
                state.log.push(entry)
                send({ type: "node-log", runId, nodeId: node.id, entry })
              }

              const attemptMetrics = collectMetrics(logParser, state.startedAt!)
              totalTokensIn += attemptMetrics.tokens_in
              totalTokensOut += attemptMetrics.tokens_out
              totalCostUsd += estimateCost(splitterModel, attemptMetrics.tokens_in, attemptMetrics.tokens_out)

              if (controller.signal.aborted) {
                throw new Error("Splitter aborted")
              }

              if (!result.success) {
                const entry = {
                  type: "error" as const,
                  content: `[splitter] claude attempt failed (exitCode=${String(result.exitCode)}) - falling back\n`,
                  timestamp: Date.now(),
                }
                state.log.push(entry)
                send({ type: "node-log", runId, nodeId: node.id, entry })
              }
              return logParser.textContent
            }

            // Fast-path: if input is already structured, skip Claude entirely
            const structuredSubtasks = tryStructuredSplit(incomingContent, maxBranches)
            let subtasks: Subtask[]
            if (structuredSubtasks) {
              console.log(`[splitter] using structured input directly (${structuredSubtasks.length} subtasks)`)
              const entry = {
                type: "text" as const,
                content: `[splitter] using structured input directly (${structuredSubtasks.length} subtasks)\n`,
                timestamp: Date.now(),
              }
              state.log.push(entry)
              send({ type: "node-log", runId, nodeId: node.id, entry })
              subtasks = structuredSubtasks
            } else {
              const splitterPrompt = buildSplitterPrompt(splitterConfig.strategy, incomingContent, maxBranches)
              console.log("[splitter] spawning claude...")
              let splitterRawOutput = await runSplitterAttempt(splitterPrompt)
              subtasks = parseSplitterOutput(splitterRawOutput)

              if (maxBranches > 1 && shouldRetrySplitter(subtasks, splitterRawOutput, incomingContent, maxBranches)) {
                console.warn(`[splitter] ${node.id} returned suspicious single subtask, retrying with stricter prompt`)
                const recoveryPrompt = buildSplitterRecoveryPrompt(
                  splitterConfig.strategy,
                  incomingContent,
                  maxBranches,
                )
                splitterRawOutput = await runSplitterAttempt(recoveryPrompt)
                subtasks = parseSplitterOutput(splitterRawOutput)
              }

              const beforeFilterCount = subtasks.length
              subtasks = subtasks.filter((s) => s.content.trim().length > 0)
              if (beforeFilterCount !== subtasks.length) {
                const dropped = beforeFilterCount - subtasks.length
                const entry = {
                  type: "text" as const,
                  content: `[splitter] dropped ${dropped} empty subtasks\n`,
                  timestamp: Date.now(),
                }
                state.log.push(entry)
                send({ type: "node-log", runId, nodeId: node.id, entry })
              }

              const shouldFallbackToHeuristic = subtasks.length === 0 || (
                maxBranches > 1 &&
                shouldRetrySplitter(subtasks, splitterRawOutput, incomingContent, maxBranches)
              )

              if (shouldFallbackToHeuristic) {
                console.warn(`[splitter] ${node.id} using heuristic fallback decomposition`)
                subtasks = heuristicSplitInput(incomingContent, maxBranches)
              }
            }

            const totalSubtasks = subtasks.length
            const usedSubtasks = subtasks.slice(0, maxBranches)
            if (totalSubtasks > usedSubtasks.length) {
              const entry = {
                type: "text" as const,
                content: `[splitter] produced ${totalSubtasks} subtasks, limited to ${usedSubtasks.length} by maxBranches=${maxBranches}\n`,
                timestamp: Date.now(),
              }
              state.log.push(entry)
              send({ type: "node-log", runId, nodeId: node.id, entry })
            }

            // Collect splitter metrics (include retry attempts)
            state.metrics = {
              tokens_in: totalTokensIn,
              tokens_out: totalTokensOut,
              cost_usd: totalCostUsd,
              latency_ms: Date.now() - state.startedAt!,
            }
            state.meta = buildNodeMeta(splitterPrompts.join("\n\n--- RETRY ---\n\n"), splitterModel)

            // Expand runtime graph
            const expanded = expandSplitter(runtimeWorkflow, node.id, usedSubtasks)
            runtimeWorkflow = expanded

            // Initialize states for new runtime nodes
            const newNodeIds: string[] = []
            const runtimeMeta: Record<string, { subtaskKey: string; branchIndex: number; totalBranches: number; templateId: string }> = {}
            for (const rn of expanded.nodes) {
              if (!nodeStates[rn.id]) {
                nodeStates[rn.id] = { status: "pending", attempts: 0, log: [] }
                newNodeIds.push(rn.id)
                if (expanded.runtimeMeta[rn.id]) {
                  runtimeMeta[rn.id] = {
                    subtaskKey: expanded.runtimeMeta[rn.id].subtaskKey,
                    branchIndex: expanded.runtimeMeta[rn.id].branchIndex,
                    totalBranches: expanded.runtimeMeta[rn.id].totalBranches,
                    templateId: expanded.runtimeMeta[rn.id].templateId,
                  }
                }
              }
            }

            // Notify renderer about new runtime nodes + full expanded graph
            send({
              type: "nodes-expanded",
              runId,
              newNodeIds,
              runtimeMeta,
              nodes: expanded.nodes.map(n => ({ id: n.id, type: n.type, position: n.position, config: n.config }) as WorkflowNode),
              edges: expanded.edges.map(e => ({ id: e.id, source: e.source, target: e.target, type: e.type })),
            })

            output = {
              content: JSON.stringify(usedSubtasks),
              metadata: {
                source: node.id,
                splitter_total_subtasks: totalSubtasks,
                splitter_used_subtasks: usedSubtasks.length,
                splitter_truncated: totalSubtasks > usedSubtasks.length,
              },
            }
            break
          }

          case "merger": {
            const mergerConfig = node.config as MergerNodeConfig

            // Gather ALL incoming branch outputs
            const incomingEdges = runtimeWorkflow.edges.filter((e) => e.target === node.id)
            const branchOutputs: NodeInput[] = []
            for (const edge of incomingEdges) {
              const sourceState = nodeStates[edge.source]
              if (sourceState?.output) {
                branchOutputs.push(sourceState.output)
              }
            }
            if (incomingEdges.length > 0 && branchOutputs.length === 0) {
              throw new Error("Merger has no branch outputs to combine")
            }

            if (mergerConfig.strategy === "concatenate") {
              state.metrics = {
                tokens_in: 0,
                tokens_out: 0,
                cost_usd: 0,
                latency_ms: Date.now() - state.startedAt!,
              }
              state.meta = buildNodeMeta("[merger concatenate]", workflow.defaults?.model || "sonnet")
              const merged = mergeResults(branchOutputs, "concatenate")
              output = { content: merged, metadata: { source: node.id } }
            } else {
              // AI-based merge (summarize or select_best)
              const mergePrompt = sanitizeInvalidUnicode(
                buildMergerPrompt(branchOutputs, mergerConfig.strategy, mergerConfig.prompt),
              )
              const logParser = new LogParser()

              const result = await spawnClaudeTracked({
                workdir: projectPath || workspace,
                prompt: mergePrompt,
                model: workflow.defaults?.model || "sonnet",
                maxTurns: 20,
                extraArgs: [...claudeExtraArgs, "--tools", ""],
                addDirs: [],
                abortSignal: controller.signal,
                timeout: 10 * 60 * 1000,
                onStdout: (data: Buffer) => {
                  const entries = logParser.feedChunk(data.toString())
                  for (const entry of entries) {
                    state.log.push(entry)
                    send({ type: "node-log", runId, nodeId: node.id, entry })
                  }
                },
                onStderr: (data: Buffer) => {
                  const entry = { type: "error" as const, content: data.toString(), timestamp: Date.now() }
                  state.log.push(entry)
                  send({ type: "node-log", runId, nodeId: node.id, entry })
                },
              }, {
                workspace,
                runId,
                mode: "rerun",
                role: "merger",
                nodeId: node.id,
              })

              const remaining = logParser.flush()
              for (const entry of remaining) {
                state.log.push(entry)
                send({ type: "node-log", runId, nodeId: node.id, entry })
              }

              if (!result.success && !controller.signal.aborted) {
                throw new Error(`Merger failed with exit code ${result.exitCode}`)
              }

              // Collect merger metrics
              const mergerModel = workflow.defaults?.model || "sonnet"
              const mergerMetrics = collectMetrics(logParser, state.startedAt!)
              mergerMetrics.cost_usd = estimateCost(mergerModel, mergerMetrics.tokens_in, mergerMetrics.tokens_out)
              state.metrics = mergerMetrics
              state.meta = buildNodeMeta(mergePrompt, mergerModel)

              output = { content: logParser.textContent, metadata: { source: node.id } }
            }
            break
          }

          case "approval": {
            const approvalConfig = node.config as ApprovalNodeConfig
            state.status = "waiting_approval"

            send({
              type: "approval-requested",
              runId,
              nodeId: node.id,
              content: approvalConfig.show_content ? incomingContent : "",
              message: approvalConfig.message,
              allowEdit: approvalConfig.allow_edit,
            })

            // Wait for user decision (with optional timeout)
            const decision = await waitForApproval(
              runId,
              node.id,
              approvalConfig.timeout_minutes,
              approvalConfig.timeout_action ?? "auto_reject",
            )

            if (decision.timedOut) {
              const action = approvalConfig.timeout_action ?? "auto_reject"
              const minutes = approvalConfig.timeout_minutes ?? 60
              send({
                type: "node-log",
                runId,
                nodeId: node.id,
                entry: {
                  type: "text",
                  content: `Approval timed out after ${minutes} minutes. Auto-${action.replace("auto_", "")} applied.\n`,
                  timestamp: Date.now(),
                },
              })
            }

            if (decision.approved) {
              const finalContent = decision.editedContent ?? incomingContent
              output = { content: finalContent, metadata: { source: node.id } }
            } else {
              // Rejected — fail the node
              state.status = "failed"
              state.completedAt = Date.now()
              state.error = decision.timedOut
                ? `Approval timed out (${approvalConfig.timeout_action ?? "auto_reject"})`
                : "Rejected by user"
              send({ type: "node-error", runId, nodeId: node.id, error: state.error })
              return
            }
            break
          }

          case "output":
            output = { content: incomingContent, metadata: { source: node.id } }
            break
        }

        state.status = "completed"
        state.completedAt = Date.now()
        state.output = output

        await writeNodeOutputFile(workspace, node.id, output.content)

        if (node.type !== "evaluator") {
          for (const e of getOutgoingEdges(runtimeWorkflow, node.id)) {
            activatedEdges.add(e.id)
          }
        }

        send({ type: "node-done", runId, nodeId: node.id, output })
      } catch (err) {
        if (controller.signal.aborted) {
          state.status = "failed"
          return
        }
        let partialOutput: NodeInput | undefined
        if (recoverOutputOnError) {
          try {
            partialOutput = await recoverOutputOnError()
          } catch (recoveryErr) {
            console.error(`[workflow-runner] failed to recover partial output for ${node.id}:`, recoveryErr)
          }
        }
        const errMsg = String(err)
        const timedOut = errMsg.includes("timed out") || errMsg.includes("ETIMEDOUT") || errMsg.includes("timeout")
        state.completedAt = Date.now()
        state.error = errMsg
        state.errorKind = classifyError(err, timedOut)
        const canRetry = runtimePolicy.retry.enabled
          && state.retriesUsed! < runtimePolicy.retry.maxTries - 1
          && runtimePolicy.retry.retryOn.has(state.errorKind)
        if (canRetry) {
          state.retriesUsed = (state.retriesUsed || 0) + 1
          const retryDelayMs = computeRetryDelayMs(runtimePolicy.retry, state.retriesUsed)
          const retryErrorKind = state.errorKind
          state.status = "pending"
          state.error = undefined
          state.errorKind = undefined
          state.completedAt = undefined
          const retryLog = {
            type: "text" as const,
            content: `[runtime-retry] attempt ${state.retriesUsed + 1}/${runtimePolicy.retry.maxTries} in ${retryDelayMs}ms after ${retryErrorKind} error\n`,
            timestamp: Date.now(),
          }
          state.log.push(retryLog)
          send({ type: "node-log", runId, nodeId: node.id, entry: retryLog })
          state.attempts = Math.max(0, state.attempts - 1)
          await sleep(retryDelayMs)
          return processNode(node.id)
        }

        const onError = runtimePolicy.onError
        state.policyApplied = onError

        if (onError === "stop") {
          state.status = "failed"
          state.output = partialOutput
          if (partialOutput) {
            try {
              await writeNodeOutputFile(workspace, node.id, partialOutput.content)
            } catch (writeErr) {
              console.error(`[workflow-runner] failed to persist partial output for ${node.id}:`, writeErr)
            }
            send({ type: "node-done", runId, nodeId: node.id, output: partialOutput })
          }
          send({ type: "node-error", runId, nodeId: node.id, error: errMsg })
          return
        }

        const output = onError === "continue_error_output"
          ? buildErrorEnvelopeOutput(
            node.id,
            incomingContent,
            partialOutput,
            state.errorKind,
            errMsg,
            state.attempts,
          )
          : buildContinueOutput(node.id, incomingContent, partialOutput)

        state.status = "completed"
        state.output = output

        try {
          await writeNodeOutputFile(workspace, node.id, output.content)
        } catch (writeErr) {
          console.error(`[workflow-runner] failed to persist policy output for ${node.id}:`, writeErr)
        }

        for (const e of getOutgoingEdges(runtimeWorkflow, node.id)) {
          activatedEdges.add(e.id)
        }

        send({ type: "node-done", runId, nodeId: node.id, output })
        send({ type: "node-error", runId, nodeId: node.id, error: errMsg })
        return
      } finally {
        try {
          await persistRunState(
            workspace,
            nodeStates,
            runtimeWorkflow,
            savedState.input || { type: "text", value: inputContent },
          )
        } catch (error) {
          logWarn("workflow-runner", "persist_run_state_checkpoint_failed", {
            runId,
            workspace,
            nodeId: node.id,
            error: errorMessage(error),
          })
        }
      }
    }

    // Main execution loop
    const runningPromises = new Map<string, Promise<void>>()
    let activeSplitterNodeId: string | null = null

    while (!controller.signal.aborted) {
      // If paused, wait until resumed (or cancelled)
      await waitIfPaused(runId, controller.signal)
      if (controller.signal.aborted) break

      const readyNodes = findReadyNodes(runtimeWorkflow, nodeStates, activatedEdges)
      const newReady = readyNodes.filter((n) => !runningPromises.has(n.id))

      if (newReady.length === 0 && runningPromises.size === 0) break

      for (const node of newReady) {
        if (controller.signal.aborted) break
        if (runningPromises.size >= maxParallel) break

        if (node.type === "splitter") {
          if (activeSplitterNodeId && activeSplitterNodeId !== node.id) continue
          if (runningPromises.size > 0) continue
        } else if (activeSplitterNodeId) {
          continue
        }

        if (nodeStates[node.id]?.status === "pending") {
          nodeStates[node.id].status = "queued"
        }

        if (node.type === "splitter") {
          activeSplitterNodeId = node.id
        }

        const promise = processNode(node.id).finally(() => {
          runningPromises.delete(node.id)
          if (activeSplitterNodeId === node.id) {
            activeSplitterNodeId = null
          }
        })
        runningPromises.set(node.id, promise)
      }

      if (runningPromises.size > 0) {
        await Promise.race(runningPromises.values())
      }
    }

    // Mark unresolved nodes as skipped
    for (const [nodeId, state] of Object.entries(nodeStates)) {
      if (
        state.status === "pending"
        || state.status === "queued"
        || state.status === "running"
        || state.status === "waiting_approval"
      ) {
        state.status = "skipped"
        send({ type: "node-done", runId, nodeId, output: { content: "", metadata: { source: nodeId, skipped: true } } })
      }
    }

    const finalStatus: RunStatus = controller.signal.aborted
      ? "cancelled"
      : isRunComplete(nodeStates) && Object.values(nodeStates).every((s) => s.status !== "failed")
        ? "completed"
        : "failed"
    manifestStatus = finalStatus

    let reportPath: string | undefined
    const outputNode = runtimeWorkflow.nodes.find((n) => n.type === "output")
    if (outputNode && nodeStates[outputNode.id]?.output?.content) {
      const reportFile = join(workspace, "report.md")
      await writeFileAtomic(reportFile, nodeStates[outputNode.id].output!.content)
      reportPath = reportFile
    }

    await writeFileAtomic(
      join(workspace, "run-result.json"),
      JSON.stringify({
        runId,
        status: finalStatus,
        workflowName: workflow.name,
        workflowPath: workflowPath || "",
        startedAt: Date.now(),
        completedAt: Date.now(),
        reportPath: reportPath || "",
        workspace,
      }, null, 2),
    )

    // Save updated run state
    try {
      await persistRunState(
        workspace,
        nodeStates,
        runtimeWorkflow,
        savedState.input || { type: "text", value: inputContent },
      )
    } catch (error) {
      logWarn("workflow-runner", "persist_run_state_final_failed", {
        runId,
        workspace,
        error: errorMessage(error),
      })
    }

    send({ type: "run-done", runId, status: finalStatus, reportPath, workspace })

    const nodesFailed = Object.values(nodeStates).filter((s) => s.status === "failed").length
    void trackTelemetryEvent("workflow_run_finished", {
      run_mode: "rerun",
      status: finalStatus,
      duration_ms: Date.now() - rerunStartedAt,
      nodes_total: runtimeWorkflow.nodes.length,
      nodes_failed: nodesFailed,
    })
  } finally {
    const fallbackStatus: RunStatus = controller.signal.aborted ? "cancelled" : "failed"
    await finalizeRunPidManifest(workspace, runId, "rerun", manifestStatus === "interrupted" ? fallbackStatus : manifestStatus)
    resolvePendingApprovalsForRun(runId, false)
    activeRuns.delete(runId)
    pausedRuns.delete(runId)
    try {
      window.removeListener("closed", onWindowClosed)
    } catch (error) {
      logWarn("workflow-runner", "remove_window_listener_failed", {
        runId,
        workspace,
        error: errorMessage(error),
      })
    }
  }
}

interface PersistedRunState {
  nodeStates: Record<string, NodeState>
  runtimeNodes?: WorkflowNode[]
}

const RESUMABLE_NODE_STATUSES = new Set(["pending", "queued", "running", "waiting_approval"])

function findResumeNodeId(savedState: PersistedRunState): string | null {
  const runtimeOrder = (savedState.runtimeNodes || []).map((node) => node.id)
  const knownIds = new Set(runtimeOrder)
  const remainingIds = Object.keys(savedState.nodeStates).filter((id) => !knownIds.has(id))
  const orderedIds = [...runtimeOrder, ...remainingIds]

  for (const nodeId of orderedIds) {
    const status = savedState.nodeStates[nodeId]?.status
    if (status && RESUMABLE_NODE_STATUSES.has(status)) return nodeId
  }

  return null
}

export async function continueRunFromWorkspace(
  runId: string,
  workflow: Workflow,
  workspace: string,
  window: BrowserWindow,
  projectPath?: string,
  workflowPath?: string,
  webSearchBackend?: WebSearchBackend,
): Promise<void> {
  let savedState: PersistedRunState
  try {
    const raw = await readFile(join(workspace, "run-state.json"), "utf-8")
    savedState = JSON.parse(raw) as PersistedRunState
  } catch (error) {
    throw new Error(`Cannot continue: run state not found in ${workspace} (${errorMessage(error)})`)
  }

  const fromNodeId = findResumeNodeId(savedState)
  if (!fromNodeId) {
    throw new Error("Cannot continue: no unfinished nodes found in run state")
  }

  await rerunFromNode(
    runId,
    fromNodeId,
    workflow,
    workspace,
    window,
    projectPath,
    workflowPath,
    webSearchBackend,
  )
}
