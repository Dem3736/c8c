import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import type {
  BatchItemResult,
  BatchSummary,
  ChatMessage,
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  NodeState,
  DiscoveredSkill,
  SkillLibrary,
  WorkflowFile,
  WorkflowTemplate,
  WorkflowRuntimeMeta,
  RunResult,
  DesktopRuntimeInfo,
  DesktopPlatform,
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

export type ExecutionRunStatus = "idle" | "running" | "done" | "error"

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
export const workflowsAtom = atom<WorkflowFile[]>([])
export const selectedWorkflowPathAtom = atom<string | null>(null)
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
  const hasMeaningfulContent = workflow.nodes.length > 0
    || workflow.name.trim().length > 0
    || (workflow.description || "").trim().length > 0
  if (!selectedWorkflowPath && !hasMeaningfulContent) return false
  return workflowSnapshot(workflow) !== get(workflowSavedSnapshotAtom)
})

// Skills
export const skillsAtom = atom<DiscoveredSkill[]>([])
export const skillPickerOpenAtom = atom(false)
export const librariesAtom = atom<SkillLibrary[]>([])

// Input
export const inputValueAtom = atom("")

// Execution state
export const runStatusAtom = atom<ExecutionRunStatus>("idle")
export const runIdAtom = atom<string | null>(null)
export const runWorkflowPathAtom = atom<string | null>(null)
export const nodeStatesAtom = atom<Record<string, NodeState>>({})
export const activeNodeIdAtom = atom<string | null>(null)
export const selectedNodeIdAtom = atom<string | null>(null)
export const evalResultsAtom = atom<Record<string, EvaluationResult[]>>({})
export const finalContentAtom = atom<string>("")
export const reportPathAtom = atom<string | null>(null)
export const workspaceAtom = atom<string | null>(null)
export const pastRunsAtom = atom<RunResult[]>([])
export const selectedPastRunAtom = atom<RunResult | null>(null)

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

// Desktop runtime
export const desktopRuntimeAtom = atom<DesktopRuntimeInfo>(defaultDesktopRuntime())

// Runtime graph (expanded by splitter fan-out)
export const runtimeNodesAtom = atom<WorkflowNode[]>([])
export const runtimeEdgesAtom = atom<WorkflowEdge[]>([])
export const runtimeMetaAtom = atom<WorkflowRuntimeMeta>({})

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

// App pages
export type MainView = "thread" | "skills" | "templates" | "settings"
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

export const approvalRequestAtom = atom<ApprovalRequest | null>(null)

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
