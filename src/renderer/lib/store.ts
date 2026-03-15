import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { workflowHasMeaningfulContent } from "@/lib/workflow-content"
import type {
  BatchItemResult,
  BatchSummary,
  ChatMessage,
  RunStatus,
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  NodeState,
  DiscoveredSkill,
  InputAttachment,
  McpServerInfo,
  McpToolInfo,
  SkillLibrary,
  WorkflowFile,
  WorkflowTemplate,
  WorkflowRuntimeMeta,
  RunResult,
  DesktopRuntimeInfo,
  DesktopPlatform,
  ProviderAuthStatus,
  ProviderHealth,
  ProviderId,
  ProviderSettings,
  SafetyProfile,
} from "@shared/types"
import type { ClaudeCodeSubscriptionStatus } from "@shared/types"
import type { WebSearchBackend } from "./web-search-backend"

// Re-export shared types for convenience
export type {
  ChatMessage,
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  NodeState,
  LogEntry,
  WorkflowEvent,
  NodeInput,
  InputAttachment,
  InputNodeConfig,
  OutputNodeConfig,
  SkillNodeConfig,
  EvaluatorNodeConfig,
  SplitterNodeConfig,
  MergerNodeConfig,
  WorkflowInput,
  DiscoveredSkill,
  SkillLibrary,
  BatchItemResult,
  BatchSummary,
  WorkflowFile,
  WorkflowTemplate,
  WorkflowRuntimeMeta,
  GenerationProgress,
  RunResult,
  DesktopRuntimeInfo,
  DesktopPlatform,
} from "@shared/types"

// ── Local Types ──────────────────────────────────────────

export type ExecutionRunStatus = "idle" | "starting" | "running" | "paused" | "cancelling" | "done" | "error"

export interface EvalCriterion {
  id: string
  score: number
  weight?: number
}

export interface EvaluationResult {
  attempt: number
  score: number
  reason: string
  passed: boolean
  fix_instructions?: string
  criteria?: EvalCriterion[]
}

type SetAtomValue<T> = T | ((prev: T) => T)

export interface WorkflowExecutionState {
  runStatus: ExecutionRunStatus
  runOutcome: RunStatus | null
  runStartedAt: number | null
  completedAt: number | null
  lastUpdatedAt: number | null
  runId: string | null
  runWorkflowPath: string | null
  workflowName: string
  projectPath: string | null
  lastError: string | null
  workflowSnapshot: Workflow | null
  nodeStates: Record<string, NodeState>
  activeNodeId: string | null
  evalResults: Record<string, EvaluationResult[]>
  finalContent: string
  reportPath: string | null
  workspace: string | null
  selectedPastRun: RunResult | null
  runtimeNodes: WorkflowNode[]
  runtimeEdges: WorkflowEdge[]
  runtimeMeta: WorkflowRuntimeMeta
}

export const DRAFT_WORKFLOW_EXECUTION_KEY = "__draft__"

export function createEmptyWorkflowExecutionState(): WorkflowExecutionState {
  return {
    runStatus: "idle",
    runOutcome: null,
    runStartedAt: null,
    completedAt: null,
    lastUpdatedAt: null,
    runId: null,
    runWorkflowPath: null,
    workflowName: "",
    projectPath: null,
    lastError: null,
    workflowSnapshot: null,
    nodeStates: {},
    activeNodeId: null,
    evalResults: {},
    finalContent: "",
    reportPath: null,
    workspace: null,
    selectedPastRun: null,
    runtimeNodes: [],
    runtimeEdges: [],
    runtimeMeta: {},
  }
}

export function toWorkflowExecutionKey(workflowPath: string | null): string {
  return workflowPath?.trim() || DRAFT_WORKFLOW_EXECUTION_KEY
}

function resolveSetAtomValue<T>(update: SetAtomValue<T>, previous: T): T {
  return typeof update === "function"
    ? (update as (prev: T) => T)(previous)
    : update
}

function inferDesktopPlatform(): DesktopPlatform {
  if (typeof navigator === "undefined") return "macos"
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = nav.userAgentData?.platform || navigator.platform || ""
  const normalized = platform.toLowerCase()
  if (normalized.includes("mac")) return "macos"
  if (normalized.includes("win")) return "windows"
  return "linux"
}

function defaultDesktopRuntime(): DesktopRuntimeInfo {
  const platform = inferDesktopPlatform()
  const isMac = platform === "macos"
  return {
    platform,
    titlebarHeight: isMac ? 32 : 0,
    primaryModifierKey: isMac ? "meta" : "ctrl",
    primaryModifierLabel: isMac ? "⌘" : "Ctrl",
    isFullscreen: false,
    isMaximized: false,
  }
}

// ── Atoms ────────────────────────────────────────────────

// Project management
export const projectsAtom = atom<string[]>([])
export const selectedProjectAtom = atomWithStorage<string | null>(
  "c8c:selected-project",
  null,
)
export const expandedProjectsAtom = atomWithStorage<string[]>("c8c:expanded-projects", [])
export const workflowsAtom = atom<WorkflowFile[]>([])
export const selectedWorkflowPathAtom = atomWithStorage<string | null>("c8c:selectedWorkflowPath", null)
export const projectSidebarWidthAtom = atomWithStorage<number>(
  "c8c:sidebar-width",
  286,
)

// Graph-aware workflow
export const currentWorkflowAtom = atom<Workflow>({
  version: 1,
  name: "",
  description: "",
  defaults: { model: "sonnet", maxTurns: 60, timeout_minutes: 30, maxParallel: 8 },
  nodes: [],
  edges: [],
})
export const workflowSavedSnapshotAtom = atom(workflowSnapshot({
  version: 1,
  name: "",
  description: "",
  defaults: { model: "sonnet", maxTurns: 60, timeout_minutes: 30, maxParallel: 8 },
  nodes: [],
  edges: [],
}))
export const workflowDirtyAtom = atom((get) => {
  const selectedWorkflowPath = get(selectedWorkflowPathAtom)
  const workflow = get(currentWorkflowAtom)
  const hasMeaningfulContent = workflowHasMeaningfulContent(workflow)
  if (!selectedWorkflowPath && !hasMeaningfulContent) return false
  return workflowSnapshot(workflow) !== get(workflowSavedSnapshotAtom)
})

// Skills
export const skillsAtom = atom<DiscoveredSkill[]>([])
export const skillPickerOpenAtom = atom(false)
export const librariesAtom = atom<SkillLibrary[]>([])

// Validation
export interface ValidationError {
  nodeId: string
  field: string
  message: string
  severity: "error" | "warning"
}
export const validationErrorsAtom = atom<Record<string, ValidationError[]>>({})

// Input
export const inputValueAtom = atom("")
export const inputAttachmentsAtom = atom<InputAttachment[]>([])

// Execution state
export const workflowExecutionStatesAtom = atom<Record<string, WorkflowExecutionState>>({})
export const selectedWorkflowExecutionKeyAtom = atom((get) =>
  toWorkflowExecutionKey(get(selectedWorkflowPathAtom)),
)
export const selectedWorkflowExecutionAtom = atom(
  (get) => {
    const key = get(selectedWorkflowExecutionKeyAtom)
    return get(workflowExecutionStatesAtom)[key] ?? createEmptyWorkflowExecutionState()
  },
  (get, set, update: SetAtomValue<WorkflowExecutionState>) => {
    const key = get(selectedWorkflowExecutionKeyAtom)
    const states = get(workflowExecutionStatesAtom)
    const previous = states[key] ?? createEmptyWorkflowExecutionState()
    const next = resolveSetAtomValue(update, previous)
    set(workflowExecutionStatesAtom, {
      ...states,
      [key]: {
        ...next,
        lastUpdatedAt: Date.now(),
      },
    })
  },
)
export const updateWorkflowExecutionStateAtom = atom(
  null,
  (
    get,
    set,
    { key, update }: { key: string; update: SetAtomValue<WorkflowExecutionState> },
  ) => {
    const states = get(workflowExecutionStatesAtom)
    const previous = states[key] ?? createEmptyWorkflowExecutionState()
    const next = resolveSetAtomValue(update, previous)
    set(workflowExecutionStatesAtom, {
      ...states,
      [key]: {
        ...next,
        lastUpdatedAt: Date.now(),
      },
    })
  },
)
export const resetWorkflowExecutionStateAtom = atom(
  null,
  (get, set, key: string) => {
    const states = get(workflowExecutionStatesAtom)
    set(workflowExecutionStatesAtom, {
      ...states,
      [key]: createEmptyWorkflowExecutionState(),
    })
  },
)
export const clearWorkflowExecutionStateAtom = atom(
  null,
  (get, set, key: string) => {
    const states = get(workflowExecutionStatesAtom)
    if (!(key in states)) return
    const next = { ...states }
    delete next[key]
    set(workflowExecutionStatesAtom, next)
  },
)
export const moveWorkflowExecutionStateAtom = atom(
  null,
  (get, set, { fromKey, toKey }: { fromKey: string; toKey: string }) => {
    if (fromKey === toKey) return
    const states = get(workflowExecutionStatesAtom)
    const source = states[fromKey]
    if (!source) return
    const next = { ...states, [toKey]: source }
    delete next[fromKey]
    set(workflowExecutionStatesAtom, next)
  },
)

function createSelectedWorkflowExecutionFieldAtom<K extends keyof WorkflowExecutionState>(field: K) {
  return atom(
    (get) => get(selectedWorkflowExecutionAtom)[field],
    (get, set, update: SetAtomValue<WorkflowExecutionState[K]>) => {
      set(selectedWorkflowExecutionAtom, (previous) => ({
        ...previous,
        [field]: resolveSetAtomValue(update, previous[field]),
      }))
    },
  )
}

export const runStatusAtom = createSelectedWorkflowExecutionFieldAtom("runStatus")
export const runStartedAtAtom = createSelectedWorkflowExecutionFieldAtom("runStartedAt")
export const runIdAtom = createSelectedWorkflowExecutionFieldAtom("runId")
export const runWorkflowPathAtom = createSelectedWorkflowExecutionFieldAtom("runWorkflowPath")
export const nodeStatesAtom = createSelectedWorkflowExecutionFieldAtom("nodeStates")
export const selectedNodeIdAtom = atom<string | null>(null)
export const activeNodeIdAtom = createSelectedWorkflowExecutionFieldAtom("activeNodeId")
export const evalResultsAtom = createSelectedWorkflowExecutionFieldAtom("evalResults")
export const finalContentAtom = createSelectedWorkflowExecutionFieldAtom("finalContent")
export const reportPathAtom = createSelectedWorkflowExecutionFieldAtom("reportPath")
export const workspaceAtom = createSelectedWorkflowExecutionFieldAtom("workspace")
export const pastRunsAtom = atom<RunResult[]>([])
export const selectedPastRunAtom = createSelectedWorkflowExecutionFieldAtom("selectedPastRun")

export const runsByWorkflowPathAtom = atom<Record<string, RunResult[]>>((get) => {
  const runs = get(pastRunsAtom)
  const grouped: Record<string, RunResult[]> = {}
  for (const run of runs) {
    const key = run.workflowPath || "__orphan__"
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(run)
  }
  return grouped
})

export function doesRunBelongToWorkflowHistory(
  run: Pick<RunResult, "workflowName" | "workflowPath">,
  selectedWorkflowPath: string | null,
  workflowName: string,
): boolean {
  const runPath = (run.workflowPath || "").trim()
  if (selectedWorkflowPath) {
    return runPath === selectedWorkflowPath
  }
  if (!workflowName) return false
  return !runPath && run.workflowName === workflowName
}

export const workflowHistoryRunsAtom = atom<RunResult[]>((get) => {
  const runs = get(pastRunsAtom)
  if (runs.length === 0) return []

  const selectedWorkflowPath = (get(selectedWorkflowPathAtom) || "").trim()
  const workflowName = (get(currentWorkflowAtom).name || "").trim()

  return runs.filter((run) => doesRunBelongToWorkflowHistory(run, selectedWorkflowPath, workflowName))
})

// Desktop runtime
export const desktopRuntimeAtom = atom<DesktopRuntimeInfo>(defaultDesktopRuntime())

// Canvas manual positions (overrides Dagre layout)
export const canvasManualPositionsAtom = atom<Record<string, { x: number; y: number }>>({})

// Runtime graph (expanded by splitter fan-out)
export const runtimeNodesAtom = createSelectedWorkflowExecutionFieldAtom("runtimeNodes")
export const runtimeEdgesAtom = createSelectedWorkflowExecutionFieldAtom("runtimeEdges")
export const runtimeMetaAtom = createSelectedWorkflowExecutionFieldAtom("runtimeMeta")

// Global execution defaults (applied to new/generated workflows)
export const globalExecutionDefaultsAtom = atomWithStorage<{
  model: string
  maxTurns: number
  timeout_minutes: number
  maxParallel: number
}>("c8c:global-execution-defaults", { model: "sonnet", maxTurns: 60, timeout_minutes: 30, maxParallel: 8 })

export const providerSettingsAtom = atom<ProviderSettings>({
  defaultProvider: "claude",
  safetyProfile: "workspace_auto",
  features: {
    codexProvider: true,
  },
})
export const defaultProviderAtom = atom(
  (get) => get(providerSettingsAtom).defaultProvider,
  (get, set, next: ProviderId) => {
    set(providerSettingsAtom, { ...get(providerSettingsAtom), defaultProvider: next })
  },
)
export const safetyProfileAtom = atom(
  (get) => get(providerSettingsAtom).safetyProfile,
  (get, set, next: SafetyProfile) => {
    set(providerSettingsAtom, { ...get(providerSettingsAtom), safetyProfile: next })
  },
)
export const providerAvailabilityAtom = atom<Record<ProviderId, ProviderHealth | null>>({
  claude: null,
  codex: null,
})
export const providerAuthStatusAtom = atom<Record<ProviderId, ProviderAuthStatus | null>>({
  claude: null,
  codex: null,
})
export const activeExecutionProviderAtom = atom<ProviderId>("claude")

// Research web-search backend preference
export const webSearchBackendAtom = atomWithStorage<WebSearchBackend>(
  "c8c:web-search-backend",
  "builtin",
)

// CLI status
export const cliStatusAtom = atom<ClaudeCodeSubscriptionStatus | null>(null)
export const cliStatusBannerDismissedAtom = atom(false)

// View mode
export type ViewMode = "list" | "canvas" | "settings"
export const viewModeAtom = atom<ViewMode>("list")

// First launch / onboarding
export const firstLaunchAtom = atomWithStorage("c8c:firstLaunch", true)

// App pages
export type MainView = "thread" | "skills" | "templates" | "settings" | "onboarding"
export const mainViewAtom = atomWithStorage<MainView>(
  "c8c:main-view",
  "thread",
)

// Templates & generation
export const templateBrowserOpenAtom = atom(false)
export const generateDialogOpenAtom = atom(false)

// ── Chat Panel ──────────────────────────────────────────

export interface ChatMessageDisplay {
  id: string
  role: "user" | "assistant" | "tool_call" | "tool_result"
  content: string
  timestamp: number
  toolName?: string
  toolInput?: Record<string, unknown>
  toolCallId?: string
  toolOutput?: string
  toolError?: string
  streaming?: boolean
}

export const chatPanelOpenAtom = atomWithStorage<boolean>("c8c:chat-open", false)
export const chatPanelWidthAtom = atomWithStorage<number>("c8c:chat-width", 380)
export const chatMessagesAtom = atom<ChatMessageDisplay[]>([])
export const chatStatusAtom = atom<"idle" | "thinking" | "streaming" | "error">("idle")
export const chatSessionIdAtom = atom<string | null>(null)
export const chatUndoStackAtom = atom<Workflow[]>([])
export const chatDraftByWorkflowAtom = atom<Record<string, string>>({})
export const chatScrollTopByWorkflowAtom = atom<Record<string, number>>({})

// ── Approval Gate ─────────────────────────────────────

export interface ApprovalRequest {
  runId: string
  nodeId: string
  content: string
  message?: string
  allowEdit: boolean
}

export const approvalRequestsAtom = atom<ApprovalRequest[]>([])
/** @deprecated Use approvalRequestsAtom (array) instead */
export const approvalRequestAtom = approvalRequestsAtom

// ── Batch Runs ────────────────────────────────────────

export type BatchStatus = "idle" | "running" | "done" | "error"

export const batchDialogOpenAtom = atom(false)
export const batchStatusAtom = atom<BatchStatus>("idle")
export const batchIdAtom = atom<string | null>(null)
export const batchErrorAtom = atom<string | null>(null)
export const batchItemsAtom = atom<BatchItemResult[]>([])
export const batchSummaryAtom = atom<BatchSummary | null>(null)
export const batchProgressAtom = atom<{ completed: number; total: number; running: number }>({
  completed: 0,
  total: 0,
  running: 0,
})

// ── Deep Link Templates ─────────────────────────────────

export const deepLinkPendingTemplateAtom = atom<WorkflowTemplate | null>(null)
export const multiRunDashboardOpenAtom = atom(false)

// ── MCP Servers ─────────────────────────────────────────

export const mcpServersAtom = atom<McpServerInfo[]>([])
export const mcpServersLoadingAtom = atom(false)
export const mcpDiscoveredToolsAtom = atom<McpToolInfo[]>([])
