import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { SIDEBAR_DEFAULT_WIDTH } from "@/lib/sidebar-layout"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { workflowHasMeaningfulContent } from "@/lib/workflow-content"
import type {
  BatchItemResult,
  BatchSummary,
  ChatMessage,
  Workflow,
  DiscoveredSkill,
  InputAttachment,
  McpServerInfo,
  McpToolInfo,
  SkillLibrary,
  WorkflowFile,
  WorkflowTemplate,
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
import type { WorkflowEntryState } from "./workflow-entry"

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
export {
  DRAFT_WORKFLOW_EXECUTION_KEY,
  createEmptyWorkflowExecutionState,
  toWorkflowExecutionKey,
} from "./workflow-execution"
export type {
  ApprovalRequest,
  EvaluationResult,
  EvalCriterion,
  ExecutionRunStatus,
  WorkflowExecutionState,
} from "./workflow-execution"

// ── Local Types ──────────────────────────────────────────

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
    titlebarHeight: isMac ? 24 : 0,
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
  SIDEBAR_DEFAULT_WIDTH,
)
export const projectSidebarOpenAtom = atomWithStorage<boolean>("c8c:sidebar-open", true)

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
export const selectedNodeIdAtom = atom<string | null>(null)

// Desktop runtime
export const desktopRuntimeAtom = atom<DesktopRuntimeInfo>(defaultDesktopRuntime())

// Canvas manual positions (overrides Dagre layout)
export const canvasManualPositionsAtom = atom<Record<string, { x: number; y: number }>>({})

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
export const workflowReviewModeAtom = atom(false)

// First launch / onboarding
export const firstLaunchAtom = atomWithStorage("c8c:firstLaunch", true)

// App pages
export type MainView =
  | "thread"
  | "workflow_create"
  | "skills"
  | "templates"
  | "settings"
  | "inbox"
  | "onboarding"
export const mainViewAtom = atomWithStorage<MainView>(
  "c8c:main-view",
  "thread",
)

// ── Inbox / Notification Memory ───────────────────────

export type InboxNotificationLevel = "info" | "success" | "warning" | "error"
export type InboxNotificationSource = "workflow" | "batch" | "agent" | "system"

export interface InboxNotification {
  id: string
  title: string
  description?: string
  level: InboxNotificationLevel
  source: InboxNotificationSource
  createdAt: number
  read: boolean
}

const MAX_INBOX_NOTIFICATIONS = 150
const INBOX_DEDUPE_WINDOW_MS = 15_000

export const inboxNotificationsAtom = atomWithStorage<InboxNotification[]>(
  "c8c:inbox-notifications-v2",
  [],
)

export const unreadInboxCountAtom = atom((get) =>
  get(inboxNotificationsAtom).filter((notification) => !notification.read).length,
)

export const addInboxNotificationAtom = atom(
  null,
  (
    get,
    set,
    notification: Omit<InboxNotification, "id" | "createdAt" | "read">,
  ) => {
    const existing = get(inboxNotificationsAtom)
    const now = Date.now()
    const duplicate = existing.find((entry) =>
      entry.title === notification.title
      && entry.description === notification.description
      && entry.level === notification.level
      && entry.source === notification.source
      && (now - entry.createdAt) < INBOX_DEDUPE_WINDOW_MS,
    )
    if (duplicate) return

    const nextEntry: InboxNotification = {
      id: `${now}-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: now,
      read: false,
      ...notification,
    }
    const next = [nextEntry, ...existing].slice(0, MAX_INBOX_NOTIFICATIONS)
    set(inboxNotificationsAtom, next)
  },
)

export const markInboxNotificationReadAtom = atom(
  null,
  (get, set, notificationId: string) => {
    set(
      inboxNotificationsAtom,
      get(inboxNotificationsAtom).map((notification) =>
        notification.id === notificationId
          ? { ...notification, read: true }
          : notification,
      ),
    )
  },
)

export const markAllInboxNotificationsReadAtom = atom(
  null,
  (get, set) => {
    set(
      inboxNotificationsAtom,
      get(inboxNotificationsAtom).map((notification) =>
        notification.read ? notification : { ...notification, read: true },
      ),
    )
  },
)

export const clearInboxNotificationsAtom = atom(
  null,
  (_get, set) => {
    set(inboxNotificationsAtom, [])
  },
)

// Templates & generation
export const templateBrowserOpenAtom = atom(false)
export const generateDialogOpenAtom = atom(false)
export const workflowCreateContextAtom = atom<{
  projectPath: string | null
  locked: boolean
}>({
  projectPath: null,
  locked: false,
})
export const workflowCreateDraftPromptAtom = atom("")
export const workflowCreatePendingMessageAtom = atom<Record<string, string>>({})
export const workflowCreatePendingEntryAtom = atom<Record<string, string>>({})
export const workflowEntryStateAtom = atom<WorkflowEntryState | null>(null)

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
