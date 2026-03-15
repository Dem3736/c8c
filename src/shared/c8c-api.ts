import type {
  BatchEvent,
  ChatConversation,
  ChatEvent,
  ClaudeCodeSubscriptionStatus,
  DesktopRuntimeInfo,
  DiscoveredSkill,
  GenerationProgress,
  McpServerInfo,
  McpTestResult,
  McpToolInfo,
  ProviderDiagnostics,
  ProviderId,
  ProviderSettings,
  RunResult,
  SkillLibrary,
  TelemetrySettings,
  TelemetryUiEvent,
  UpdateEvent,
  UpdateInfo,
  Workflow,
  WorkflowEvent,
  WorkflowFile,
  WorkflowInput,
  WorkflowTemplate,
} from "@shared/types"

export interface C8cApi {
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
  readSkillContent: (path: string) => Promise<string>
  listProjectWorkflows: (projectPath: string) => Promise<WorkflowFile[]>
  listGlobalWorkflows: () => Promise<WorkflowFile[]>
  loadWorkflow: (filePath: string) => Promise<Workflow>
  saveWorkflow: (filePath: string, chain: Workflow) => Promise<string>
  saveWorkflowAs: (chain: Workflow, projectPath?: string) => Promise<string | null>
  openWorkflowFile: () => Promise<{ filePath: string; chain: Workflow } | null>
  createWorkflow: (projectPath: string, name: string, chain: Workflow) => Promise<string>
  renameWorkflow: (filePath: string, nextName: string) => Promise<string>
  duplicateWorkflow: (filePath: string) => Promise<string>
  deleteWorkflow: (filePath: string) => Promise<void>
  listLibraries: () => Promise<SkillLibrary[]>
  installLibrary: (id: string) => Promise<boolean>
  removeLibrary: (id: string) => Promise<boolean>
  scanLibraries: () => Promise<DiscoveredSkill[]>
  listTemplates: () => Promise<WorkflowTemplate[]>
  saveAsTemplate: (name: string, workflow: Workflow) => Promise<string>
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
  getProviderDiagnostics: () => Promise<ProviderDiagnostics>
  updateProviderSettings: (patch: Partial<ProviderSettings>) => Promise<ProviderSettings>
  setCodexApiKey: (apiKey: string) => Promise<ProviderDiagnostics>
  clearCodexApiKey: () => Promise<ProviderDiagnostics>
  logoutProvider: (provider: ProviderId) => Promise<ProviderDiagnostics>
  getTelemetrySettings: () => Promise<TelemetrySettings>
  setTelemetryConsent: (enabled: boolean) => Promise<TelemetrySettings>
  trackUiEvent: (eventName: TelemetryUiEvent) => Promise<boolean>
  openPath: (path: string) => Promise<string>
  showInFinder: (path: string) => Promise<boolean>
  checkForUpdate: () => Promise<UpdateInfo>
  installUpdate: () => Promise<boolean>
  getUpdateStatus: () => Promise<UpdateInfo>
  onUpdateEvent: (callback: (event: UpdateEvent) => void) => () => void
  runChain: (
    chain: Workflow,
    input: WorkflowInput,
    projectPath?: string,
    workflowPath?: string,
    webSearchBackend?: "builtin" | "exa",
  ) => Promise<string | { error: string } | null>
  cancelRun: (runId: string) => Promise<boolean>
  pauseRun: (runId: string) => Promise<boolean>
  resumeRun: (runId: string) => Promise<boolean>
  rerunFrom: (
    fromNodeId: string,
    workflow: Workflow,
    workspace: string,
    projectPath?: string,
    workflowPath?: string,
    webSearchBackend?: "builtin" | "exa",
  ) => Promise<string | { error: string } | null>
  continueRun: (
    workflow: Workflow,
    workspace: string,
    projectPath?: string,
    workflowPath?: string,
    webSearchBackend?: "builtin" | "exa",
  ) => Promise<string | { error: string } | null>
  listRuns: (projectPath: string) => Promise<RunResult[]>
  loadRunResult: (workspace: string) => Promise<(RunResult & { reportContent: string }) | null>
  openReport: (reportPath: string) => Promise<string>
  chatSendMessage: (
    workflowPath: string,
    message: string,
    projectPath: string,
    currentWorkflow: Workflow,
  ) => Promise<string>
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
  onDeepLinkTemplate: (callback: (template: WorkflowTemplate) => void) => () => void
  onDeepLinkTemplateError: (callback: (err: { templateId: string; error: string }) => void) => () => void
  listProjectFiles: (
    projectPath: string,
    query?: string,
  ) => Promise<{ name: string; relativePath: string }[]>
  readFileContent: (
    filePath: string,
    projectPath: string,
  ) => Promise<{ content: string; truncated: boolean }>
  mcpListServers: (provider: ProviderId, projectPath?: string) => Promise<McpServerInfo[]>
  mcpListAllServers: (provider: ProviderId) => Promise<McpServerInfo[]>
  mcpAddServer: (
    provider: ProviderId,
    server: McpServerInfo,
    projectPath?: string,
  ) => Promise<{ success: boolean; error?: string }>
  mcpUpdateServer: (
    provider: ProviderId,
    name: string,
    server: McpServerInfo,
    projectPath?: string,
  ) => Promise<{ success: boolean; error?: string }>
  mcpRemoveServer: (
    provider: ProviderId,
    name: string,
    scope: McpServerInfo["scope"],
    projectPath?: string,
  ) => Promise<{ success: boolean; error?: string }>
  mcpToggleServer: (
    provider: ProviderId,
    name: string,
    scope: McpServerInfo["scope"],
    disabled: boolean,
    projectPath?: string,
  ) => Promise<{ success: boolean; error?: string }>
  mcpTestServer: (
    provider: ProviderId,
    name: string,
    scope: McpServerInfo["scope"],
    projectPath?: string,
  ) => Promise<McpTestResult>
  mcpDiscoverTools: (
    provider: ProviderId,
    serverName?: string,
    projectPath?: string,
  ) => Promise<McpToolInfo[]>
}

declare global {
  interface Window {
    api: C8cApi
  }
}

export {}
