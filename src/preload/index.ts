import { contextBridge, ipcRenderer } from "electron"
import type { C8cApi } from "@shared/c8c-api"
import type {
  ClaudeCodeSubscriptionStatus,
  BatchEvent,
  TelemetrySettings,
  TelemetryUiEvent,
  ArtifactRecord,
  ChatConversation,
  ChatEvent,
  ChatSessionSnapshot,
  DesktopRuntimeInfo,
  DiscoveredSkill,
  ProjectFactoryBlueprint,
  ProjectFactoryState,
  GenerationProgress,
  HumanTaskSnapshot,
  HumanTaskSubmitInput,
  HumanTaskSummary,
  InstalledPlugin,
  MarketplaceSource,
  McpServerInfo,
  McpTestResult,
  McpToolInfo,
  PersistArtifactsFromRunRequest,
  PersistArtifactsFromRunResult,
  SaveProjectFactoryBlueprintInput,
  SpawnFactoryCasesFromArtifactInput,
  SpawnFactoryCasesFromArtifactResult,
  RunResult,
  SkillLibrary,
  UpdateEvent,
  UpdateInfo,
  ProviderDiagnostics,
  ProviderId,
  ProviderSettings,
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
        } catch (error) {
          // Never let one renderer callback break channel delivery.
          console.warn("[preload] subscriber error", { channel, error: String(error) })
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

const api: C8cApi = {
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
  readSkillContent: (path: string) => ipcRenderer.invoke("skills:read-content", path),

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
  duplicateWorkflow: (filePath: string) => ipcRenderer.invoke("workflows:duplicate", filePath),
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
  pauseRun: (runId: string) => ipcRenderer.invoke("run:pause", runId),
  resumeRun: (runId: string) => ipcRenderer.invoke("run:resume", runId),
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
  continueRun: (
    workflow: Workflow,
    workspace: string,
    projectPath?: string,
    workflowPath?: string,
    webSearchBackend?: "builtin" | "exa",
  ) =>
    ipcRenderer.invoke(
      "executor:continue",
      workflow,
      workspace,
      projectPath,
      workflowPath,
      webSearchBackend,
    ),
  listRuns: (projectPath: string) => ipcRenderer.invoke("executor:list-runs", projectPath),
  loadRunResult: (workspace: string) => ipcRenderer.invoke("executor:load-run-result", workspace),
  openReport: (reportPath: string) => ipcRenderer.invoke("executor:open-report", reportPath),
  getActiveExecutions: () => ipcRenderer.invoke("executor:get-active-executions"),
  persistArtifactsFromRun: (input: PersistArtifactsFromRunRequest) =>
    ipcRenderer.invoke("executor:persist-artifacts-from-run", input) as Promise<PersistArtifactsFromRunResult>,
  listProjectArtifacts: (projectPath: string) =>
    ipcRenderer.invoke("executor:list-project-artifacts", projectPath) as Promise<ArtifactRecord[]>,
  loadProjectFactoryBlueprint: (projectPath: string) =>
    ipcRenderer.invoke("factory:load-blueprint", projectPath) as Promise<ProjectFactoryBlueprint | null>,
  saveProjectFactoryBlueprint: (input: SaveProjectFactoryBlueprintInput) =>
    ipcRenderer.invoke("factory:save-blueprint", input) as Promise<ProjectFactoryBlueprint>,
  loadProjectFactoryState: (projectPath: string) =>
    ipcRenderer.invoke("factory:load-state", projectPath) as Promise<ProjectFactoryState>,
  spawnFactoryCasesFromArtifact: (input: SpawnFactoryCasesFromArtifactInput) =>
    ipcRenderer.invoke("factory:spawn-cases-from-artifact", input) as Promise<SpawnFactoryCasesFromArtifactResult>,

  // Libraries
  listLibraries: () => ipcRenderer.invoke("libraries:list"),
  installLibrary: (id: string) => ipcRenderer.invoke("libraries:install", id),
  removeLibrary: (id: string) => ipcRenderer.invoke("libraries:remove", id),
  scanLibraries: () => ipcRenderer.invoke("libraries:scan"),
  listMarketplaces: () => ipcRenderer.invoke("plugins:list-marketplaces") as Promise<MarketplaceSource[]>,
  installMarketplace: (id: string) => ipcRenderer.invoke("plugins:install-marketplace", id),
  updateMarketplace: (id: string) => ipcRenderer.invoke("plugins:update-marketplace", id),
  removeMarketplace: (id: string) => ipcRenderer.invoke("plugins:remove-marketplace", id),
  scanPlugins: () => ipcRenderer.invoke("plugins:scan") as Promise<InstalledPlugin[]>,
  setPluginEnabled: (pluginId: string, enabled: boolean) =>
    ipcRenderer.invoke("plugins:set-enabled", pluginId, enabled),

  // Templates
  listTemplates: () => ipcRenderer.invoke("templates:list"),
  listPopularProjectTemplates: (projectPath: string, limit?: number) =>
    ipcRenderer.invoke("templates:list-popular-project", projectPath, limit),
  recordProjectTemplateUsage: (projectPath: string, templateId: string) =>
    ipcRenderer.invoke("templates:record-usage", projectPath, templateId),
  saveAsTemplate: (name: string, workflow: Workflow) =>
    ipcRenderer.invoke("templates:save-user", name, workflow),
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
  getProviderDiagnostics: () =>
    ipcRenderer.invoke("system:get-provider-diagnostics"),
  updateProviderSettings: (patch: Partial<ProviderSettings>) =>
    ipcRenderer.invoke("system:update-provider-settings", patch),
  setCodexApiKey: (apiKey: string) =>
    ipcRenderer.invoke("system:set-codex-api-key", apiKey),
  clearCodexApiKey: () =>
    ipcRenderer.invoke("system:clear-codex-api-key"),
  logoutProvider: (provider: ProviderId) =>
    ipcRenderer.invoke("system:logout-provider", provider),
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
  chatGetActiveSession: (workflowPath: string) =>
    ipcRenderer.invoke("chat:get-active-session", workflowPath) as Promise<ChatSessionSnapshot | null>,
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
  listHumanTasks: (projectPath?: string) =>
    ipcRenderer.invoke("executor:list-human-tasks", projectPath) as Promise<HumanTaskSummary[]>,
  loadHumanTask: (taskId: string, workspace: string) =>
    ipcRenderer.invoke("executor:load-human-task", taskId, workspace) as Promise<HumanTaskSnapshot | null>,
  submitHumanTask: (taskId: string, workspace: string, input: HumanTaskSubmitInput) =>
    ipcRenderer.invoke("executor:submit-human-task", taskId, workspace, input),
  rejectHumanTask: (taskId: string, workspace: string, comment?: string, idempotencyKey?: string) =>
    ipcRenderer.invoke("executor:reject-human-task", taskId, workspace, comment, idempotencyKey),

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

  // Deep link (c8c:// protocol)
  onDeepLinkTemplate: (callback: (template: WorkflowTemplate) => void) =>
    subscribeIpcChannel<WorkflowTemplate>("template:deep-link", callback),
  onDeepLinkTemplateError: (callback: (err: { templateId: string; error: string }) => void) =>
    subscribeIpcChannel<{ templateId: string; error: string }>("template:deep-link-error", callback),

  // Files
  listProjectFiles: (projectPath: string, query?: string) =>
    ipcRenderer.invoke("files:list-project", projectPath, query),
  readFileContent: (filePath: string, projectPath: string) =>
    ipcRenderer.invoke("files:read-content", filePath, projectPath),

  // MCP servers
  mcpListServers: (provider: ProviderId, projectPath?: string) =>
    ipcRenderer.invoke("mcp:list-servers", provider, projectPath),
  mcpListAllServers: (provider: ProviderId) =>
    ipcRenderer.invoke("mcp:list-all-servers", provider),
  mcpListPluginServers: () =>
    ipcRenderer.invoke("mcp:list-plugin-servers"),
  mcpAddServer: (provider: ProviderId, server: McpServerInfo, projectPath?: string) =>
    ipcRenderer.invoke("mcp:add-server", provider, server, projectPath),
  mcpUpdateServer: (provider: ProviderId, name: string, server: McpServerInfo, projectPath?: string) =>
    ipcRenderer.invoke("mcp:update-server", provider, name, server, projectPath),
  mcpRemoveServer: (provider: ProviderId, name: string, scope: McpServerInfo["scope"], projectPath?: string) =>
    ipcRenderer.invoke("mcp:remove-server", provider, name, scope, projectPath),
  mcpToggleServer: (provider: ProviderId, name: string, scope: McpServerInfo["scope"], disabled: boolean, projectPath?: string) =>
    ipcRenderer.invoke("mcp:toggle-server", provider, name, scope, disabled, projectPath),
  mcpTestServer: (provider: ProviderId, name: string, scope: McpServerInfo["scope"], projectPath?: string) =>
    ipcRenderer.invoke("mcp:test-server", provider, name, scope, projectPath),
  mcpDiscoverTools: (provider: ProviderId, serverName?: string, projectPath?: string) =>
    ipcRenderer.invoke("mcp:discover-tools", provider, serverName, projectPath),
  mcpSetPluginServerApproved: (serverId: string, approved: boolean) =>
    ipcRenderer.invoke("mcp:set-plugin-server-approved", serverId, approved),
}

contextBridge.exposeInMainWorld("api", api)
