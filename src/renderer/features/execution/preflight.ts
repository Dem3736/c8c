import type { C8cApi } from "@shared/c8c-api"
import { PROVIDER_LABELS, resolveWorkflowProvider } from "@shared/provider-metadata"
import type {
  ClaudeCodeSubscriptionStatus,
  ProviderDiagnostics,
  ProviderId,
  ProviderSettings,
  Workflow,
} from "@shared/types"

export interface ExecutionPreflightSnapshot {
  diagnostics: ProviderDiagnostics
  cliStatus: ClaudeCodeSubscriptionStatus | null
}

export interface ExecutionPreflightSuccess {
  ok: true
  effectiveProvider: ProviderId
  snapshot: ExecutionPreflightSnapshot
}

export interface ExecutionPreflightFailure {
  ok: false
  reason: "cli_unavailable" | "auth_required"
  effectiveProvider: ProviderId
  message: string
  snapshot: ExecutionPreflightSnapshot
}

export type ExecutionPreflightResult = ExecutionPreflightSuccess | ExecutionPreflightFailure

type ExecutionPreflightApi = Pick<C8cApi, "getProviderDiagnostics" | "getClaudeCodeSubscriptionStatus">

export function applyExecutionProviderFeatureFlags(
  provider: ProviderId,
  features: ProviderSettings["features"],
): ProviderId {
  if (provider === "codex" && !features.codexProvider) return "claude"
  return provider
}

export function resolveEffectiveExecutionProvider(
  workflow: Workflow,
  settings: ProviderSettings,
): ProviderId {
  const requestedProvider = resolveWorkflowProvider(workflow, settings.defaultProvider)
  return applyExecutionProviderFeatureFlags(requestedProvider, settings.features)
}

function unavailableMessage(
  provider: ProviderId,
  cliStatus: ClaudeCodeSubscriptionStatus | null,
  providerError?: string | null,
): string {
  if (provider === "codex") {
    return providerError
      || "Codex CLI is not installed or not executable. Install it with: npm install -g @openai/codex"
  }

  if (cliStatus && !cliStatus.cliInstalled) {
    return cliStatus.error
      || "Claude CLI is not installed. Install it with: npm install -g @anthropic-ai/claude-code"
  }

  return providerError
    || "Claude CLI is not installed. Install it with: npm install -g @anthropic-ai/claude-code"
}

function authRequiredMessage(
  provider: ProviderId,
  cliStatus: ClaudeCodeSubscriptionStatus | null,
  providerError?: string | null,
): string {
  if (provider === "codex") {
    return providerError
      || "Codex CLI is not authenticated. Run `codex login` (ChatGPT subscription works) or configure an optional CODEX_API_KEY in Settings."
  }

  if (cliStatus && !cliStatus.loggedIn) {
    return cliStatus.error
      || "Claude CLI is not authenticated. Run `claude login` in your terminal."
  }

  return providerError
    || "Claude CLI is not authenticated. Run `claude login` in your terminal."
}

export function evaluateExecutionStartPreflight(
  workflow: Workflow,
  snapshot: ExecutionPreflightSnapshot,
): ExecutionPreflightResult {
  const effectiveProvider = resolveEffectiveExecutionProvider(workflow, snapshot.diagnostics.settings)
  const providerHealth = snapshot.diagnostics.health[effectiveProvider]
  const providerAuth = snapshot.diagnostics.auth[effectiveProvider]

  if (!providerHealth?.available) {
    return {
      ok: false,
      reason: "cli_unavailable",
      effectiveProvider,
      message: unavailableMessage(effectiveProvider, snapshot.cliStatus, providerHealth?.error),
      snapshot,
    }
  }

  // Codex can legitimately return unknown auth state when ACP/API-key-backed flows are available.
  if (effectiveProvider === "codex" && providerAuth?.state === "unknown") {
    return {
      ok: true,
      effectiveProvider,
      snapshot,
    }
  }

  if (!providerAuth?.authenticated) {
    return {
      ok: false,
      reason: "auth_required",
      effectiveProvider,
      message: authRequiredMessage(effectiveProvider, snapshot.cliStatus, providerAuth?.error),
      snapshot,
    }
  }

  return {
    ok: true,
    effectiveProvider,
    snapshot,
  }
}

export async function loadExecutionStartPreflight(
  api: ExecutionPreflightApi,
  workflow: Workflow,
): Promise<ExecutionPreflightResult> {
  const diagnostics = await api.getProviderDiagnostics()
  const effectiveProvider = resolveEffectiveExecutionProvider(workflow, diagnostics.settings)
  const cliStatus = effectiveProvider === "claude"
    ? await api.getClaudeCodeSubscriptionStatus()
    : null

  return evaluateExecutionStartPreflight(workflow, {
    diagnostics,
    cliStatus,
  })
}

export function formatExecutionPreflightTitle(provider: ProviderId, reason: ExecutionPreflightFailure["reason"]): string {
  const providerLabel = PROVIDER_LABELS[provider]
  return reason === "cli_unavailable"
    ? `${providerLabel} unavailable`
    : `${providerLabel} login required`
}
