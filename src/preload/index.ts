import { contextBridge, ipcRenderer } from "electron"
import type {
  ClaudeCodeSubscriptionStatus,
  BatchEvent,
  TelemetrySettings,
  TelemetryUiEvent,
  ChatConversation,
  ChatEvent,
  DesktopRuntimeInfo,
  DiscoveredSkill,
  GenerationProgress,
  RunResult,
  SkillLibrary,
  UpdateEvent,
  UpdateInfo,
  Workflow,
  WorkflowEvent,
  WorkflowFile,
  WorkflowInput,
  WorkflowTemplate,
} from "@shared/types"

type Listener = (payload: unknown) => void

const channelSubscribers = new Map<string, Set<Listener>>()
const channelHandlers = new Map<string, (_event: unknown, payload: unknown) => void>()

function subscribeIpcChannel<T>(channel: string, callback: (payload: T) => void): () => void {
  let subscribers = channelSubscribers.get(channel)
  if (!subscribers) {
    subscribers = new Set<Listener>()
    channelSubscribers.set(channel, subscribers)
  }

  if (subscribers.size === 0) {
    const handler = (_event: unknown, payload: unknown) => {
      const currentSubscribers = channelSubscribers.get(channel)
      if (!currentSubscribers || currentSubscribers.size === 0) return
      for (const subscriber of currentSubscribers) {
        try {
          subscriber(payload)
        } catch {
          // Never let one renderer callback break channel delivery.
        }
      }
    }
    channelHandlers.set(channel, handler)
    ipcRenderer.on(channel, handler)
  }

  const listener = callback as Listener
  subscribers.add(listener)

  return () => {
    const currentSubscribers = channelSubscribers.get(channel)
    if (!currentSubscribers) return
    currentSubscribers.delete(listener)
    if (currentSubscribers.size > 0) return

    channelSubscribers.delete(channel)
    const handler = channelHandlers.get(channel)
    if (!handler) return
    ipcRenderer.removeListener(channel, handler)
    channelHandlers.delete(channel)
  }
}

contextBridge.exposeInMainWorld("api", {
  // Projects
  listProjects: () => ipcRenderer.invoke("projects:list"),
  addProject: () => ipcRenderer.invoke("projects:add"),
  removeProject: (path: string) => ipcRenderer.invoke("projects:remove", path),
  setSelectedProject: (path: string) => ipcRenderer.invoke("projects:set-selected", path),
  getSelectedProject: () => ipcRenderer.invoke("projects:get-selected"),

  // Skills
  scanSkills: (projectPath: string) => ipcRenderer.invoke("skills:scan", projectPath),
  createSkillTemplate: (projectPath: string) => ipcRenderer.invoke("skills:create-template", projectPath),
  scaffoldMissingSkills: (
    workflow: Workflow,
    availableSkills: Pick<DiscoveredSkill, "name" | "category">[],
    projectPath: string,
  ) => ipcRenderer.invoke("skills:scaffold", workflow, availableSkills, projectPath),

  // Workflows
  listProjectWorkflows: (projectPath: string) =>
    ipcRenderer.invoke("workflows:list-project", projectPath),
  listGlobalWorkflows: () => ipcRenderer.invoke("workflows:list-global"),
  loadWorkflow: (filePath: string) => ipcRenderer.invoke("workflows:load", filePath),
  saveWorkflow: (filePath: string, chain: Workflow) =>
    ipcRenderer.invoke("workflows:save", filePath, chain),
  saveWorkflowAs: (chain: Workflow, projectPath?: string) =>
    ipcRenderer.invoke("workflows:save-as", chain, projectPath),
  openWorkflowFile: () => ipcRenderer.invoke("workflows:open-file"),
  createWorkflow: (projectPath: string, name: string, chain: Workflow) =>
    ipcRenderer.invoke("workflows:create", projectPath, name, chain),
  renameWorkflow: (filePath: string, nextName: string) =>
    ipcRenderer.invoke("workflows:rename", filePath, nextName),
  deleteWorkflow: (filePath: string) => ipcRenderer.invoke("workflows:delete", filePath),

  // Executor
  runChain: (
    chain: Workflow,
    input: WorkflowInput,
    projectPath?: string,
    workflowPath?: string,
    webSearchBackend?: "builtin" | "exa",
  ) =>
    ipcRenderer.invoke("executor:run", chain, input, projectPath, workflowPath, webSearchBackend),
  cancelRun: (runId: string) => ipcRenderer.invoke("executor:cancel", runId),
  rerunFrom: (
    fromNodeId: string,
    workflow: Workflow,
    workspace: string,
    projectPath?: string,
    workflowPath?: string,
    webSearchBackend?: "builtin" | "exa",
  ) =>
    ipcRenderer.invoke(
      "executor:rerun-from",
      fromNodeId,
      workflow,
      workspace,
      projectPath,
      workflowPath,
      webSearchBackend,
    ),
  listRuns: (projectPath: string) => ipcRenderer.invoke("executor:list-runs", projectPath),
  loadRunResult: (workspace: string) => ipcRenderer.invoke("executor:load-run-result", workspace),
  openReport: (reportPath: string) => ipcRenderer.invoke("executor:open-report", reportPath),

  // Libraries
  listLibraries: () => ipcRenderer.invoke("libraries:list"),
  installLibrary: (id: string) => ipcRenderer.invoke("libraries:install", id),
  removeLibrary: (id: string) => ipcRenderer.invoke("libraries:remove", id),
  scanLibraries: () => ipcRenderer.invoke("libraries:scan"),

  // Templates
  listTemplates: () => ipcRenderer.invoke("templates:list"),
  generateWorkflow: (
    description: string,
    availableSkills: Pick<DiscoveredSkill, "name" | "category" | "description">[],
    projectPath?: string,
  ) =>
    ipcRenderer.invoke("templates:generate", description, availableSkills, projectPath),
  cancelGenerate: () => ipcRenderer.invoke("templates:cancel-generate"),

  // System
  getAppVersion: () => ipcRenderer.invoke("system:get-app-version"),
  getDesktopRuntime: () => ipcRenderer.invoke("system:get-desktop-runtime"),
  onDesktopRuntimeChange: (callback: (runtime: DesktopRuntimeInfo) => void) =>
    subscribeIpcChannel<DesktopRuntimeInfo>("system:desktop-runtime-changed", callback),
  getProjectStatus: (projectPath: string | null) =>
    ipcRenderer.invoke("system:get-project-status", projectPath),
  getClaudeCodeSubscriptionStatus: () =>
    ipcRenderer.invoke("system:get-claude-subscription-status"),
  getTelemetrySettings: () =>
    ipcRenderer.invoke("system:get-telemetry-settings"),
  setTelemetryConsent: (enabled: boolean) =>
    ipcRenderer.invoke("system:set-telemetry-consent", enabled),
  trackUiEvent: (eventName: TelemetryUiEvent) =>
    ipcRenderer.invoke("system:track-ui-event", eventName),
  openPath: (path: string) =>
    ipcRenderer.invoke("system:open-path", path),
  showInFinder: (path: string) =>
    ipcRenderer.invoke("system:show-in-finder", path),

  // Auto-updater
  checkForUpdate: () =>
    ipcRenderer.invoke("system:check-for-update"),
  installUpdate: () =>
    ipcRenderer.invoke("system:install-update"),
  getUpdateStatus: () =>
    ipcRenderer.invoke("system:get-update-status"),
  onUpdateEvent: (callback: (event: UpdateEvent) => void) =>
    subscribeIpcChannel<UpdateEvent>("update:event", callback),

  // Chat
  chatSendMessage: (workflowPath: string, message: string, projectPath: string, currentWorkflow: Workflow) =>
    ipcRenderer.invoke("chat:send-message", workflowPath, message, projectPath, currentWorkflow),
  chatLoadHistory: (workflowPath: string) =>
    ipcRenderer.invoke("chat:load-history", workflowPath),
  chatCancel: (sessionId: string) =>
    ipcRenderer.invoke("chat:cancel", sessionId),
  chatClearHistory: (workflowPath: string) =>
    ipcRenderer.invoke("chat:clear-history", workflowPath),

  onChatEvent: (callback: (event: ChatEvent) => void) =>
    subscribeIpcChannel<ChatEvent>("chat:event", callback),

  // Approval gates
  approveNode: (runId: string, nodeId: string, editedContent?: string) =>
    ipcRenderer.invoke("executor:approve", runId, nodeId, editedContent),
  rejectNode: (runId: string, nodeId: string) =>
    ipcRenderer.invoke("executor:reject", runId, nodeId),

  // Batch runs
  runBatch: (
    workflow: Workflow,
    inputs: WorkflowInput[],
    concurrency: number,
    stopOnFailure: boolean,
    projectPath?: string,
    workflowPath?: string,
  ) => ipcRenderer.invoke("executor:run-batch", workflow, inputs, concurrency, stopOnFailure, projectPath, workflowPath),
  cancelBatch: (batchId: string) => ipcRenderer.invoke("executor:cancel-batch", batchId),
  onBatchEvent: (callback: (event: BatchEvent) => void) =>
    subscribeIpcChannel<BatchEvent>("batch:event", callback),

  // Workflow events listener (new graph-based execution)
  onWorkflowEvent: (callback: (event: WorkflowEvent) => void) =>
    subscribeIpcChannel<WorkflowEvent>("workflow:event", callback),

  // Generate progress listener
  onGenerateProgress: (callback: (progress: GenerationProgress) => void) =>
    subscribeIpcChannel<GenerationProgress>("generate:progress", callback),
})

// Type declaration
export interface C8cApi {
  // Returns the effective path the workflow was saved to.
  listProjects: () => Promise<string[]>
  addProject: () => Promise<string | null>
  removeProject: (path: string) => Promise<void>
  setSelectedProject: (path: string) => Promise<void>
  getSelectedProject: () => Promise<string | null>
  scanSkills: (projectPath: string) => Promise<DiscoveredSkill[]>
  createSkillTemplate: (projectPath: string) => Promise<string>
  scaffoldMissingSkills: (
    workflow: Workflow,
    availableSkills: Pick<DiscoveredSkill, "name" | "category">[],
    projectPath: string,
  ) => Promise<Workflow>
  listProjectWorkflows: (projectPath: string) => Promise<WorkflowFile[]>
  listGlobalWorkflows: () => Promise<WorkflowFile[]>
  loadWorkflow: (filePath: string) => Promise<Workflow>
  saveWorkflow: (filePath: string, chain: Workflow) => Promise<string>
  saveWorkflowAs: (chain: Workflow, projectPath?: string) => Promise<string | null>
  openWorkflowFile: () => Promise<{ filePath: string; chain: Workflow } | null>
  createWorkflow: (projectPath: string, name: string, chain: Workflow) => Promise<string>
  renameWorkflow: (filePath: string, nextName: string) => Promise<string>
  deleteWorkflow: (filePath: string) => Promise<void>
  listLibraries: () => Promise<SkillLibrary[]>
  installLibrary: (id: string) => Promise<boolean>
  removeLibrary: (id: string) => Promise<boolean>
  scanLibraries: () => Promise<DiscoveredSkill[]>
  listTemplates: () => Promise<WorkflowTemplate[]>
  generateWorkflow: (
    description: string,
    availableSkills: Pick<DiscoveredSkill, "name" | "category" | "description">[],
    projectPath?: string,
  ) => Promise<Workflow>
  cancelGenerate: () => Promise<void>
  getAppVersion: () => Promise<string>
  getDesktopRuntime: () => Promise<DesktopRuntimeInfo>
  onDesktopRuntimeChange: (callback: (runtime: DesktopRuntimeInfo) => void) => () => void
  getProjectStatus: (projectPath: string | null) => Promise<{ branch: string | null }>
  getClaudeCodeSubscriptionStatus: () => Promise<ClaudeCodeSubscriptionStatus>
  getTelemetrySettings: () => Promise<TelemetrySettings>
  setTelemetryConsent: (enabled: boolean) => Promise<TelemetrySettings>
  trackUiEvent: (eventName: TelemetryUiEvent) => Promise<boolean>
  openPath: (path: string) => Promise<string>
  showInFinder: (path: string) => Promise<boolean>
  checkForUpdate: () => Promise<UpdateInfo>
  installUpdate: () => Promise<boolean>
  getUpdateStatus: () => Promise<UpdateInfo>
  onUpdateEvent: (callback: (event: UpdateEvent) => void) => () => void
  // Returns runId on success, error payload on validation/concurrency errors, or null when no window is available.
  runChain: (
    chain: Workflow,
    input: WorkflowInput,
    projectPath?: string,
    workflowPath?: string,
    webSearchBackend?: "builtin" | "exa",
  ) => Promise<string | { error: string } | null>
  cancelRun: (runId: string) => Promise<boolean>
  rerunFrom: (
    fromNodeId: string,
    workflow: Workflow,
    workspace: string,
    projectPath?: string,
    workflowPath?: string,
    webSearchBackend?: "builtin" | "exa",
  ) => Promise<string | null>
  listRuns: (projectPath: string) => Promise<RunResult[]>
  loadRunResult: (workspace: string) => Promise<(RunResult & { reportContent: string }) | null>
  openReport: (reportPath: string) => Promise<string>
  chatSendMessage: (workflowPath: string, message: string, projectPath: string, currentWorkflow: Workflow) => Promise<string>
  chatLoadHistory: (workflowPath: string) => Promise<ChatConversation | null>
  chatCancel: (sessionId: string) => Promise<boolean>
  chatClearHistory: (workflowPath: string) => Promise<void>
  approveNode: (runId: string, nodeId: string, editedContent?: string) => Promise<boolean>
  rejectNode: (runId: string, nodeId: string) => Promise<boolean>
  runBatch: (
    workflow: Workflow,
    inputs: WorkflowInput[],
    concurrency: number,
    stopOnFailure: boolean,
    projectPath?: string,
    workflowPath?: string,
  ) => Promise<string | null>
  cancelBatch: (batchId: string) => Promise<boolean>
  onBatchEvent: (callback: (event: BatchEvent) => void) => () => void
  onChatEvent: (callback: (event: ChatEvent) => void) => () => void
  onWorkflowEvent: (callback: (event: WorkflowEvent) => void) => () => void
  onGenerateProgress: (callback: (progress: GenerationProgress) => void) => () => void
}

declare global {
  interface Window {
    api: C8cApi
  }
}
