import { describe, expect, it, vi } from "vitest"
import type { ClaudeCodeSubscriptionStatus, ProviderDiagnostics, Workflow } from "@shared/types"
import {
  applyExecutionProviderFeatureFlags,
  evaluateExecutionStartPreflight,
  formatExecutionPreflightTitle,
  loadExecutionStartPreflight,
  resolveEffectiveExecutionProvider,
} from "./preflight"

function createWorkflow(provider?: "claude" | "codex"): Workflow {
  return {
    version: 1,
    name: "Test workflow",
    defaults: provider ? { provider } : undefined,
    nodes: [],
    edges: [],
  }
}

function createDiagnostics(overrides?: Partial<ProviderDiagnostics>): ProviderDiagnostics {
  return {
    settings: {
      defaultProvider: "claude",
      safetyProfile: "workspace_auto",
      features: {
        codexProvider: true,
      },
    },
    health: {
      claude: {
        provider: "claude",
        available: true,
        error: null,
      },
      codex: {
        provider: "codex",
        available: true,
        error: null,
      },
    },
    auth: {
      claude: {
        provider: "claude",
        state: "authenticated",
        authenticated: true,
      },
      codex: {
        provider: "codex",
        state: "authenticated",
        authenticated: true,
      },
    },
    ...overrides,
  }
}

function createCliStatus(overrides?: Partial<ClaudeCodeSubscriptionStatus>): ClaudeCodeSubscriptionStatus {
  return {
    checkedAt: Date.now(),
    cliInstalled: true,
    loggedIn: true,
    authMethod: "oauth",
    apiProvider: "claude",
    hasSubscription: true,
    error: null,
    ...overrides,
  }
}

describe("execution preflight", () => {
  it("falls back from codex to claude when the codex feature is disabled", () => {
    expect(applyExecutionProviderFeatureFlags("codex", { codexProvider: false })).toBe("claude")
    expect(resolveEffectiveExecutionProvider(createWorkflow("codex"), {
      defaultProvider: "claude",
      safetyProfile: "workspace_auto",
      features: {
        codexProvider: false,
      },
    })).toBe("claude")
  })

  it("blocks start when Claude CLI is unavailable", () => {
    const result = evaluateExecutionStartPreflight(createWorkflow("claude"), {
      diagnostics: createDiagnostics({
        health: {
          claude: {
            provider: "claude",
            available: false,
            error: "Claude CLI is not installed.",
          },
          codex: {
            provider: "codex",
            available: true,
            error: null,
          },
        },
      }),
      cliStatus: createCliStatus({
        cliInstalled: false,
        loggedIn: false,
        error: "Claude CLI is not installed or not available in PATH.",
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.effectiveProvider).toBe("claude")
    if (!result.ok) {
      expect(result.reason).toBe("cli_unavailable")
      expect(result.message).toContain("Claude CLI is not installed")
    }
  })

  it("blocks start when Codex auth is required", () => {
    const result = evaluateExecutionStartPreflight(createWorkflow("codex"), {
      diagnostics: createDiagnostics({
        auth: {
          claude: {
            provider: "claude",
            state: "authenticated",
            authenticated: true,
          },
          codex: {
            provider: "codex",
            state: "unauthenticated",
            authenticated: false,
            error: "Codex CLI is not authenticated.",
          },
        },
      }),
      cliStatus: null,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("auth_required")
      expect(result.message).toContain("Codex CLI is not authenticated")
    }
  })

  it("allows codex when auth state is unknown but CLI is available", () => {
    const result = evaluateExecutionStartPreflight(createWorkflow("codex"), {
      diagnostics: createDiagnostics({
        auth: {
          claude: {
            provider: "claude",
            state: "authenticated",
            authenticated: true,
          },
          codex: {
            provider: "codex",
            state: "unknown",
            authenticated: false,
          },
        },
      }),
      cliStatus: null,
    })

    expect(result).toMatchObject({
      ok: true,
      effectiveProvider: "codex",
    })
  })

  it("loads Claude CLI status only when the effective provider is Claude", async () => {
    const getProviderDiagnostics = vi.fn().mockResolvedValue(createDiagnostics())
    const getClaudeCodeSubscriptionStatus = vi.fn().mockResolvedValue(createCliStatus())

    const result = await loadExecutionStartPreflight(
      {
        getProviderDiagnostics,
        getClaudeCodeSubscriptionStatus,
      },
      createWorkflow("claude"),
    )

    expect(result).toMatchObject({
      ok: true,
      effectiveProvider: "claude",
    })
    expect(getClaudeCodeSubscriptionStatus).toHaveBeenCalledTimes(1)
  })

  it("skips Claude CLI status when the effective provider is Codex", async () => {
    const getProviderDiagnostics = vi.fn().mockResolvedValue(createDiagnostics({
      settings: {
        defaultProvider: "codex",
        safetyProfile: "workspace_auto",
        features: {
          codexProvider: true,
        },
      },
    }))
    const getClaudeCodeSubscriptionStatus = vi.fn()

    const result = await loadExecutionStartPreflight(
      {
        getProviderDiagnostics,
        getClaudeCodeSubscriptionStatus,
      },
      createWorkflow("codex"),
    )

    expect(result).toMatchObject({
      ok: true,
      effectiveProvider: "codex",
    })
    expect(getClaudeCodeSubscriptionStatus).not.toHaveBeenCalled()
  })

  it("formats provider-specific titles", () => {
    expect(formatExecutionPreflightTitle("claude", "cli_unavailable")).toBe("Claude Code unavailable")
    expect(formatExecutionPreflightTitle("codex", "auth_required")).toBe("OpenAI Codex login required")
  })
})
