import type {
  PermissionMode,
  ProviderId,
  SafetyProfile,
  Workflow,
  WorkflowNode,
} from "./schema.js"

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  claude: "Claude Code",
  codex: "OpenAI Codex",
}

export const PROVIDER_MODELS: Record<ProviderId, string[]> = {
  claude: [
    "sonnet",
    "opus",
    "haiku",
    "claude-sonnet-4-6",
    "claude-opus-4-6",
    "claude-haiku-4-5",
  ],
  codex: [
    "gpt-5.4",
    "gpt-5.3-codex",
    "gpt-5.2-codex",
    "gpt-5.2",
    "gpt-5.1-codex-max",
    "gpt-5.1-codex-mini",
  ],
}

export const DEFAULT_MODEL_BY_PROVIDER: Record<ProviderId, string> = {
  claude: "sonnet",
  codex: "gpt-5.4",
}

export const SAFETY_PROFILE_LABELS: Record<SafetyProfile, string> = {
  safe_readonly: "Safe read-only",
  workspace_auto: "Workspace auto",
  workspace_untrusted: "Workspace untrusted",
  ci_readonly: "CI read-only",
  dangerous: "Dangerous",
}

export function getDefaultModelForProvider(provider: ProviderId): string {
  return DEFAULT_MODEL_BY_PROVIDER[provider]
}

export function resolveWorkflowProvider(
  workflow: Workflow,
  defaultProvider: ProviderId,
): ProviderId {
  return workflow.defaults?.provider || defaultProvider
}

export function resolveNodeProvider(
  _node: WorkflowNode,
  workflow: Workflow,
  defaultProvider: ProviderId,
): ProviderId {
  return workflow.defaults?.provider || defaultProvider
}

export function resolveSafetyProfile(
  executionMode: PermissionMode | undefined,
  configuredProfile: SafetyProfile,
): SafetyProfile {
  if (executionMode === "plan") return "safe_readonly"
  return configuredProfile
}
