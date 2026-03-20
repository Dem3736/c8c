import type {
  EvaluationResult,
  NodeState,
  RunStatus,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  WorkflowRuntimeMeta,
} from "@shared/types"

export const ELECTRON_SMOKE_SCENARIOS = [
  "launch-empty",
  "seeded-project-sidebar",
  "command-palette-toggle",
  "settings-navigation",
  "quick-switch-rail",
  "canvas-add-recenter-delete",
  "approval-dialog",
  "create-ready-continuation",
  "blocked-relaunch",
] as const

export type ElectronSmokeScenario = typeof ELECTRON_SMOKE_SCENARIOS[number]

export function isElectronSmokeScenario(value: string): value is ElectronSmokeScenario {
  return ELECTRON_SMOKE_SCENARIOS.includes(value as ElectronSmokeScenario)
}

export type ElectronSmokeMainView =
  | "thread"
  | "factory"
  | "workflow_create"
  | "skills"
  | "templates"
  | "artifacts"
  | "settings"
  | "inbox"
  | "onboarding"

export interface ElectronSmokeUiState {
  mainView: string
  viewMode: string
  firstLaunch: boolean
  projectCount: number
  selectedProject: string | null
  selectedWorkflowPath: string | null
  currentWorkflowName: string
  commandPaletteOpen: boolean
  commandPaletteVisible: boolean
  sidebarOpen: boolean
  sidebarVisible: boolean
  applicationShellVisible: boolean
  desktopPlatform: string
  primaryModifierKey: "meta" | "ctrl"
  flowStatusRailVisible: boolean
  flowStatusRailLabels: string[]
  availableWorkflowNames: string[]
  approvalDialogOpen: boolean
  settingsPageVisible: boolean
}

export interface ElectronSmokeCanvasViewport {
  x: number
  y: number
  zoom: number
}

export interface ElectronSmokeCanvasState {
  nodeCount: number
  nodeLabels: string[]
  selectedNodeId: string | null
  selectedNodeLabel: string | null
  viewport: ElectronSmokeCanvasViewport | null
}

export type ElectronSmokeViewMode = "list" | "canvas" | "settings"

export interface ElectronSmokeWorkflowOpenInput {
  projectPath: string
  workflowPath: string
  viewMode?: ElectronSmokeViewMode
}

export interface ElectronSmokeMainViewInput {
  mainView: ElectronSmokeMainView
  projectPath?: string | null
}

export type ElectronSmokeExecutionRunStatus =
  | "idle"
  | "starting"
  | "running"
  | "paused"
  | "cancelling"
  | "done"
  | "error"

export interface ElectronSmokeExecutionStateSeed {
  runStatus?: ElectronSmokeExecutionRunStatus
  runOutcome?: RunStatus | null
  runId?: string | null
  runWorkflowPath?: string | null
  workflowName?: string
  projectPath?: string | null
  lastError?: string | null
  workflowSnapshot?: Workflow | null
  nodeStates?: Record<string, NodeState>
  activeNodeId?: string | null
  evalResults?: Record<string, EvaluationResult[]>
  runtimeNodes?: WorkflowNode[]
  runtimeEdges?: WorkflowEdge[]
  runtimeMeta?: WorkflowRuntimeMeta
}

export interface ElectronSmokeApprovalRequest {
  workflowKey: string
  runId: string
  nodeId: string
  content: string
  message?: string
  allowEdit: boolean
}

export interface ElectronSmokeExecutionSeedInput {
  workflowKey: string
  state: ElectronSmokeExecutionStateSeed
  approvalRequests?: ElectronSmokeApprovalRequest[]
}

export interface ElectronRendererSmokeHarness {
  getUiState: () => ElectronSmokeUiState
  openWorkflow?: (input: ElectronSmokeWorkflowOpenInput) => Promise<boolean> | boolean
  setMainView?: (input: ElectronSmokeMainViewInput) => Promise<boolean> | boolean
  seedExecutionState?: (input: ElectronSmokeExecutionSeedInput) => Promise<boolean> | boolean
  getCanvasState?: () => ElectronSmokeCanvasState | null
  setCanvasViewport?: (viewport: ElectronSmokeCanvasViewport) => Promise<boolean> | boolean
}

export interface ElectronSmokeAssertion {
  label: string
  details?: string
}

export interface ElectronSmokeConsoleEntry {
  level: "verbose" | "info" | "warning" | "error"
  message: string
  sourceId: string
  lineNumber: number
  timestamp: string
}

export interface ElectronSmokeArtifact {
  label: string
  path: string
}

export type ElectronSmokeScenarioInvariants =
  | {
      kind: "launch-empty"
      projectCount: number
      mainView: string
      selectedProject: string | null
    }
  | {
      kind: "seeded-project-sidebar"
      projectCount: number
      selectedProject: string | null
      sidebarVisible: boolean
    }
  | {
      kind: "command-palette-toggle"
      openedWithShortcut: boolean
      commandPaletteVisible: boolean
    }
  | {
      kind: "settings-navigation"
      openedWithShortcut: boolean
      mainViewAfterShortcut: string
      settingsPageVisible: boolean
    }
  | {
      kind: "quick-switch-rail"
      workflowNames: string[]
      selectedInitially: string
      selectedAfterShortcut: string
      selectedAfterClick: string
    }
  | {
      kind: "canvas-add-recenter-delete"
      nodeCountBefore: number
      nodeCountAfterAdd: number
      nodeCountAfterDelete: number
      viewportChanged: boolean
      addedNodeLabel: string | null
    }
  | {
      kind: "approval-dialog"
      workflowName: string
      dialogOpened: boolean
      dialogClosedAfterShortcut: boolean
    }
  | {
      kind: "create-ready-continuation"
      title: string
      readinessText: string
      actionLabel: string
      latestCheckText: string | null
    }
  | {
      kind: "blocked-relaunch"
      workflowName: string
      createActionLabel: string
      blockedHeaderVisible: boolean
      blockedTaskVisible: boolean
      statusText: string
      reasonText: string
    }

export interface ElectronSmokeScenarioReport {
  scenario: ElectronSmokeScenario
  ok: boolean
  startedAt: string
  finishedAt: string
  screenshotPath: string | null
  uiState: ElectronSmokeUiState | null
  assertions: ElectronSmokeAssertion[]
  rendererConsole: ElectronSmokeConsoleEntry[]
  ignoredRendererConsole?: ElectronSmokeConsoleEntry[]
  invariants: ElectronSmokeScenarioInvariants | null
  artifacts?: ElectronSmokeArtifact[]
  error?: string
}

declare global {
  interface Window {
    __C8C_RENDERER_SMOKE__?: ElectronRendererSmokeHarness
  }
}

export {}
