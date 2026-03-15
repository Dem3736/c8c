// ── Node Types ──────────────────────────────────────────

export type NodeType = "input" | "skill" | "evaluator" | "splitter" | "merger" | "output" | "approval"

export interface NodePosition {
  x: number
  y: number
}

export type NodeOnErrorPolicy = "stop" | "continue" | "continue_error_output"
export type NodeRetryBackoff = "none" | "linear" | "exponential"

export interface NodeRetryPolicy {
  enabled?: boolean
  maxTries?: number
  waitMs?: number
  backoff?: NodeRetryBackoff
  retryOn?: Array<ErrorKind>
}

export interface NodeExecutionPolicy {
  onError?: NodeOnErrorPolicy
  alwaysOutputData?: boolean
  executeOnce?: boolean
}

export interface NodeRuntimeConfig {
  retry?: NodeRetryPolicy
  execution?: NodeExecutionPolicy
}

export type PermissionMode = "plan" | "edit"
export type ProviderId = "claude" | "codex"
export type AgentExecutionBackend = "claude_sdk" | "claude_cli" | "codex_acp" | "codex_exec"
export type SafetyProfile =
  | "safe_readonly"
  | "workspace_auto"
  | "workspace_untrusted"
  | "ci_readonly"
  | "dangerous"

export interface ProviderHealth {
  provider: ProviderId
  available: boolean
  executablePath?: string
  version?: string
  error?: string | null
}

export interface ProviderAuthStatus {
  provider: ProviderId
  authenticated: boolean
  authMethod?: string | null
  accountLabel?: string | null
  apiKeyConfigured?: boolean
  error?: string | null
}

export interface ProviderSettings {
  defaultProvider: ProviderId
  safetyProfile: SafetyProfile
  features: {
    codexProvider: boolean
  }
}

export interface ProviderDiagnostics {
  settings: ProviderSettings
  health: Record<ProviderId, ProviderHealth>
  auth: Record<ProviderId, ProviderAuthStatus>
}

export interface AgentRunOptions {
  workdir: string
  prompt: string
  model?: string
  maxTurns?: number
  permissionMode?: string
  executionMode?: PermissionMode
  safetyProfile?: SafetyProfile
  systemPrompts?: string[]
  allowedTools?: string[]
  disallowedTools?: string[]
  settingSources?: string[]
  addDirs?: string[]
  mcpConfigPath?: string
  disableBuiltInTools?: boolean
  disableSlashCommands?: boolean
  extraArgs?: string[]
  extraEnv?: Record<string, string>
  timeout?: number
  abortSignal?: AbortSignal
  onSpawn?: (pid: number) => void
  onStdout?: (data: Buffer) => void
  onStderr?: (data: Buffer) => void
}

export interface AgentRunResult {
  success: boolean
  exitCode: number | null
  signal: string | null
  killed: boolean
  aborted: boolean
  durationMs: number
  pid?: number
}

export interface AgentUsage {
  inputTokens: number
  outputTokens: number
}

export interface AgentExecutionSummary extends AgentRunResult {
  error?: string | null
  providerSessionId?: string | null
  backend?: AgentExecutionBackend
}

export type AgentExecutionEvent =
  | { type: "start" }
  | { type: "spawn"; pid: number }
  | { type: "log-entry"; entry: LogEntry }
  | { type: "usage"; usage: AgentUsage }
  | { type: "stderr"; text: string }
  | { type: "error"; text: string }
  | { type: "finish"; summary: AgentExecutionSummary }

export interface AgentExecutionHandle {
  provider: ProviderId
  backend?: AgentExecutionBackend
  events: AsyncIterable<AgentExecutionEvent>
  abort(): void
  done: Promise<AgentExecutionSummary>
}

export interface AgentProvider {
  id: ProviderId
  checkAvailability(): Promise<ProviderHealth>
  getAuthStatus(): Promise<ProviderAuthStatus>
  executeInteractive(options: AgentRunOptions): Promise<AgentExecutionHandle>
  executeTask(options: AgentRunOptions): Promise<AgentExecutionHandle>
  cancel(sessionId: string): Promise<boolean> | boolean
}

export interface SkillNodeConfig {
  skillRef: string
  prompt: string
  outputMode?: "auto" | "stdout" | "content_file"
  maxTurns?: number
  permissionMode?: PermissionMode
  skillPaths?: string[]
  allowedTools?: string[]
  disallowedTools?: string[]
  runtime?: NodeRuntimeConfig
}

export interface EvaluatorNodeConfig {
  criteria: string
  threshold: number
  maxRetries: number
  retryFrom?: string
  // Optional quality skills to inject as evaluation policy context.
  skillRefs?: string[]
  runtime?: NodeRuntimeConfig
}

export interface SplitterNodeConfig {
  strategy: string
  maxBranches?: number
  runtime?: NodeRuntimeConfig
}

export interface MergerNodeConfig {
  strategy: "concatenate" | "summarize" | "select_best"
  prompt?: string
  runtime?: NodeRuntimeConfig
}

export interface ApprovalNodeConfig {
  message?: string
  show_content: boolean
  allow_edit: boolean
  timeout_minutes?: number
  timeout_action?: "auto_approve" | "auto_reject" | "skip"
  runtime?: NodeRuntimeConfig
}

export interface InputNodeConfig {
  inputType?: "auto" | "text" | "url" | "directory"
  required?: boolean
  defaultValue?: string
  placeholder?: string
  runtime?: NodeRuntimeConfig
}
export interface OutputNodeConfig {
  title?: string
  format?: "markdown" | "text"
  runtime?: NodeRuntimeConfig
}

interface BaseWorkflowNode<TType extends NodeType, TConfig> {
  id: string
  type: TType
  position: NodePosition
  config: TConfig
}

export type InputWorkflowNode = BaseWorkflowNode<"input", InputNodeConfig>
export type SkillWorkflowNode = BaseWorkflowNode<"skill", SkillNodeConfig>
export type EvaluatorWorkflowNode = BaseWorkflowNode<"evaluator", EvaluatorNodeConfig>
export type SplitterWorkflowNode = BaseWorkflowNode<"splitter", SplitterNodeConfig>
export type MergerWorkflowNode = BaseWorkflowNode<"merger", MergerNodeConfig>
export type OutputWorkflowNode = BaseWorkflowNode<"output", OutputNodeConfig>
export type ApprovalWorkflowNode = BaseWorkflowNode<"approval", ApprovalNodeConfig>

export type WorkflowNode =
  | InputWorkflowNode
  | SkillWorkflowNode
  | EvaluatorWorkflowNode
  | SplitterWorkflowNode
  | MergerWorkflowNode
  | OutputWorkflowNode
  | ApprovalWorkflowNode

export type NodeConfig = WorkflowNode["config"]

// ── Edge Types ──────────────────────────────────────────

export type EdgeType = "default" | "pass" | "fail"

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  type: EdgeType
}

// ── Workflow Definition ─────────────────────────────────

export interface WorkflowDefaults {
  provider?: ProviderId
  model?: string
  maxTurns?: number
  maxParallel?: number
  timeout_minutes?: number
  allowedTools?: string[]
  disallowedTools?: string[]
  permissionMode?: PermissionMode
  budget_tokens?: number
  budget_cost_usd?: number
  stop_on?: Array<"budget_exceeded" | "mandatory_node_failed">
}

export interface Workflow {
  id?: string
  version: number
  name: string
  description?: string
  defaults?: WorkflowDefaults
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export interface WorkflowFile {
  name: string
  path: string
  updatedAt?: number
}

export interface DiscoveredSkill {
  type: "skill" | "agent" | "command"
  name: string
  description: string
  category: string
  path: string
  format?: "claude-markdown" | "codex-skill"
  sourceScope?: "project" | "user" | "library"
  model?: string
  tools?: string[]
  maxTurns?: number
  allowedTools?: string[]
  disallowedTools?: string[]
  library?: string
}

export interface SkillLibrary {
  id: string
  name: string
  description: string
  repo: string
  enabled: boolean
  installed: boolean
}

export type WorkflowTemplateStage =
  | "research"
  | "strategy"
  | "content"
  | "code"
  | "outreach"
  | "operations"

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  stage: WorkflowTemplateStage
  emoji: string
  headline: string
  how: string
  input: string
  output: string
  steps: string[]
  workflow: Workflow
}

// ── Execution State ─────────────────────────────────────

export type NodeStatus = "pending" | "queued" | "running" | "completed" | "failed" | "skipped" | "waiting_approval"

export type RunStatus = "running" | "paused" | "completed" | "failed" | "cancelled" | "interrupted"

export interface NodeInput {
  content: string
  metadata: {
    source: string
    score?: number
    reason?: string
    iteration?: number
    fix_instructions?: string
    criteria?: Array<{ id: string; score: number; weight?: number }>
    output_source?: "stdout" | "content_file" | "input_fallback"
    partial_on_error?: boolean
    splitter_total_subtasks?: number
    splitter_used_subtasks?: number
    splitter_truncated?: boolean
    error_policy_applied?: NodeOnErrorPolicy
    error_envelope?: boolean
    skipped?: boolean
  }
}

export type ErrorKind = "tool" | "model" | "timeout" | "policy" | "unknown"

export interface NodeMetrics {
  tokens_in: number
  tokens_out: number
  cost_usd: number
  latency_ms: number
}

export interface NodeMeta {
  model_id: string
  prompt_hash: string
  skill_ref?: string
  backend?: AgentExecutionBackend
}

export interface NodeState {
  status: NodeStatus
  attempts: number
  retriesUsed?: number
  policyApplied?: NodeOnErrorPolicy
  output?: NodeInput
  error?: string
  log: LogEntry[]
  startedAt?: number
  completedAt?: number
  metrics?: NodeMetrics
  errorKind?: ErrorKind
  meta?: NodeMeta
}

export interface WorkflowRun {
  id: string
  workflowId: string
  status: RunStatus
  startedAt: number
  nodeStates: Record<string, NodeState>
}

export interface RuntimeMetaEntry {
  subtaskKey: string
  branchIndex: number
  totalBranches: number
  templateId: string
}

export type WorkflowRuntimeMeta = Record<string, RuntimeMetaEntry>

// ── Structured Log ──────────────────────────────────────

export type LogEntry =
  | { type: "thinking"; content: string; timestamp: number }
  | { type: "text"; content: string; timestamp: number }
  | { type: "tool_use"; tool: string; input: Record<string, unknown>; timestamp: number }
  | { type: "tool_result"; tool: string; output: string; status: "success" | "error"; timestamp: number }
  | { type: "error"; content: string; timestamp: number }
  | { type: "diff"; content: string; files: string[]; timestamp: number }

// ── IPC Events ──────────────────────────────────────────

export type WorkflowEvent =
  | { type: "node-start"; runId: string; nodeId: string }
  | { type: "node-log"; runId: string; nodeId: string; entry: LogEntry }
  | { type: "node-done"; runId: string; nodeId: string; output: NodeInput }
  | { type: "node-error"; runId: string; nodeId: string; error: string }
  | { type: "eval-result"; runId: string; nodeId: string; score: number; reason: string; passed: boolean; attempt: number; fix_instructions?: string; criteria?: Array<{ id: string; score: number; weight?: number }> }
  | {
      type: "nodes-expanded"
      runId: string
      newNodeIds: string[]
      runtimeMeta: WorkflowRuntimeMeta
      nodes: WorkflowNode[]
      edges: WorkflowEdge[]
    }
  | { type: "approval-requested"; runId: string; nodeId: string; content: string; message?: string; allowEdit: boolean }
  | { type: "run-done"; runId: string; status: RunStatus; reportPath?: string; workspace?: string }

// ── Input ───────────────────────────────────────────────

export type InputAttachment =
  | { kind: "file"; path: string; name: string }
  | { kind: "run"; runId: string; workspace: string; workflowName: string }
  | { kind: "text"; label: string; content: string }

export type WorkflowInput =
  | { type: "text"; value: string }
  | { type: "url"; value: string }
  | { type: "directory"; value: string }

export type GenerationProgressStep =
  | "starting"
  | "thinking"
  | "writing"
  | "parsing"
  | "done"

export interface GenerationProgress {
  step: GenerationProgressStep | string
  count: number
}

export interface RunResult {
  runId: string
  status: RunStatus
  workflowName: string
  workflowPath?: string
  startedAt: number
  completedAt: number
  reportPath: string
  workspace: string
  // Iteration 7: enriched metrics for comparison & trends
  totalCost?: number
  totalTokensIn?: number
  totalTokensOut?: number
  evalScores?: Record<string, number>
  durationMs?: number
}

// ── Batch Runs ────────────────────────────────────────

export interface BatchItemResult {
  input_index: number
  run_id: string
  status: RunStatus
  eval_scores: Record<string, number>
  cost_usd: number
  duration_ms: number
  error?: string
  output?: string
}

export interface BatchSummary {
  total: number
  processed: number
  passed: number
  failed: number
  cancelled: number
  mean_cost_usd: number
  mean_duration_ms: number
  pass_rate: number
}

export type BatchEvent =
  | { type: "batch-progress"; batchId: string; completed: number; total: number; running: number }
  | { type: "batch-item-done"; batchId: string; item: BatchItemResult }
  | { type: "batch-error"; batchId: string; error: string }
  | { type: "batch-done"; batchId: string; summary: BatchSummary; items: BatchItemResult[] }

export interface IpcError {
  code:
    | "NOT_FOUND"
    | "PERMISSION_DENIED"
    | "EXECUTION_FAILED"
    | "INVALID_INPUT"
    | "UNKNOWN"
  message: string
  detail?: string
}

// ── Desktop Runtime ────────────────────────────────────

export type DesktopPlatform = "macos" | "windows" | "linux"

export interface DesktopRuntimeInfo {
  platform: DesktopPlatform
  titlebarHeight: number
  primaryModifierKey: "meta" | "ctrl"
  primaryModifierLabel: "⌘" | "Ctrl"
  isFullscreen: boolean
  isMaximized: boolean
}

export interface ClaudeCodeSubscriptionStatus {
  checkedAt: number
  cliInstalled: boolean
  loggedIn: boolean
  authMethod: string | null
  apiProvider: string | null
  hasSubscription: boolean
  error: string | null
}

// ── Telemetry ───────────────────────────────────────────

export type BuildFlavor = "oss" | "release"

export type TelemetryProvider = "noop" | "posthog"

export interface TelemetrySettings {
  buildFlavor: BuildFlavor
  provider: TelemetryProvider
  enabledInBuild: boolean
  consent: boolean
  telemetryLocalTest: boolean
  configDetected: boolean
}

export type TelemetryUiEvent = "settings_opened"

// ── Auto-Updater ─────────────────────────────────────────

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error"

export interface UpdateInfo {
  status: UpdateStatus
  version?: string
  progress?: number
  error?: string
}

export type UpdateEvent =
  | { type: "checking" }
  | { type: "available"; version: string }
  | { type: "not-available" }
  | { type: "download-progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string }

// ── Chat Pipeline Editor ────────────────────────────────

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "tool_call" | "tool_result"
  content: string
  timestamp: number
  toolName?: string
  toolInput?: Record<string, unknown>
  toolCallId?: string
  toolOutput?: string
  toolError?: string
}

export interface ChatConversation {
  version: 1
  workflowPath: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export type ChatEvent =
  | { type: "text-delta"; sessionId: string; content: string }
  | { type: "thinking"; sessionId: string; content?: string }
  | {
      type: "tool-call"
      sessionId: string
      toolName: string
      toolInput: Record<string, unknown>
      toolCallId: string
    }
  | {
      type: "tool-result"
      sessionId: string
      toolName: string
      toolCallId: string
      toolOutput?: string
      toolError?: string
    }
  | { type: "workflow-mutated"; sessionId: string; workflow: Workflow }
  | { type: "message-complete"; sessionId: string; message: ChatMessage }
  | { type: "turn-complete"; sessionId: string; workflow: Workflow }
  | { type: "error"; sessionId: string; content: string }

export type ChatEventType = ChatEvent["type"]

export interface SkillCategoryNode {
  name: string
  path: string
  count: number
  children: SkillCategoryNode[]
  skills?: Array<{ name: string; description: string; skillRef: string }>
}

// ── MCP (Model Context Protocol) ────────────────────────

export type McpTransportType = "stdio" | "http" | "sse"
export type McpServerScope = "local" | "project" | "user"

export interface McpServerInfo {
  name: string
  scope: McpServerScope
  provider?: ProviderId
  projectPath?: string
  type: McpTransportType
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  headers?: Record<string, string>
  disabled?: boolean
  autoApprove?: string[]
}

export interface McpToolInfo {
  name: string
  serverName: string
  qualifiedName: string
  provider?: ProviderId
  description?: string
}

export interface McpMutationResult {
  success: boolean
  error?: string
}

export interface McpTestResult {
  healthy: boolean
  tools: McpToolInfo[]
  error?: string
  latencyMs: number
}

export interface McpProvider {
  id: ProviderId
  listServers(scope?: McpServerScope, projectPath?: string): Promise<McpServerInfo[]>
  listAllServers?(): Promise<McpServerInfo[]>
  addServer(server: McpServerInfo, projectPath?: string): Promise<McpMutationResult>
  updateServer?(name: string, server: McpServerInfo, projectPath?: string): Promise<McpMutationResult>
  removeServer(name: string, scope: McpServerScope, projectPath?: string): Promise<McpMutationResult>
  toggleServer(name: string, scope: McpServerScope, disabled: boolean, projectPath?: string): Promise<McpMutationResult>
  testServer(name: string, scope: McpServerScope, projectPath?: string): Promise<McpTestResult>
  discoverTools(serverName?: string, projectPath?: string): Promise<McpToolInfo[]>
}
