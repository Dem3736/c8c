import { describe, expect, it, vi } from "vitest"
import type { ClaudeCodeSubscriptionStatus, ProviderDiagnostics, Workflow } from "@shared/types"
import {
  applyExecutionProviderFeatureFlags,
  compareSemver,
  evaluateExecutionStartPreflight,
  formatExecutionPreflightTitle,
  loadExecutionStartPreflight,
  MIN_CLAUDE_CLI_VERSION,
  parseCliVersion,
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
    expect(formatExecutionPreflightTitle("claude", "cli_version_unsupported")).toBe("Claude Code update required")
    expect(formatExecutionPreflightTitle("codex", "auth_required")).toBe("OpenAI Codex login required")
  })

  describe("CLI version checking", () => {
    it("blocks start when Claude CLI version is below minimum", () => {
      const result = evaluateExecutionStartPreflight(createWorkflow("claude"), {
        diagnostics: createDiagnostics({
          health: {
            claude: {
              provider: "claude",
              available: true,
              version: "0.1.0",
              error: null,
            },
            codex: {
              provider: "codex",
              available: true,
              error: null,
            },
          },
        }),
        cliStatus: createCliStatus(),
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe("cli_version_unsupported")
        expect(result.message).toContain("0.1.0")
        expect(result.message).toContain(MIN_CLAUDE_CLI_VERSION)
        expect(result.message).toContain("npm update -g @anthropic-ai/claude-code")
      }
    })

    it("allows execution when Claude CLI version meets minimum", () => {
      const result = evaluateExecutionStartPreflight(createWorkflow("claude"), {
        diagnostics: createDiagnostics({
          health: {
            claude: {
              provider: "claude",
              available: true,
              version: "2.0.0",
              error: null,
            },
            codex: {
              provider: "codex",
              available: true,
              error: null,
            },
          },
        }),
        cliStatus: createCliStatus(),
      })

      expect(result.ok).toBe(true)
    })

    it("allows execution when Claude CLI version cannot be parsed (backwards compat)", () => {
      const result = evaluateExecutionStartPreflight(createWorkflow("claude"), {
        diagnostics: createDiagnostics({
          health: {
            claude: {
              provider: "claude",
              available: true,
              version: "unknown-version-format",
              error: null,
            },
            codex: {
              provider: "codex",
              available: true,
              error: null,
            },
          },
        }),
        cliStatus: createCliStatus(),
      })

      expect(result.ok).toBe(true)
    })

    it("allows execution when version field is absent (backwards compat)", () => {
      const result = evaluateExecutionStartPreflight(createWorkflow("claude"), {
        diagnostics: createDiagnostics(),
        cliStatus: createCliStatus(),
      })

      expect(result.ok).toBe(true)
    })

    it("does not version-check Codex provider", () => {
      const result = evaluateExecutionStartPreflight(createWorkflow("codex"), {
        diagnostics: createDiagnostics({
          health: {
            claude: {
              provider: "claude",
              available: true,
              error: null,
            },
            codex: {
              provider: "codex",
              available: true,
              version: "0.0.1",
              error: null,
            },
          },
        }),
        cliStatus: null,
      })

      expect(result.ok).toBe(true)
    })
  })

  describe("parseCliVersion", () => {
    it("extracts semver from plain version string", () => {
      expect(parseCliVersion("1.0.33")).toBe("1.0.33")
    })

    it("extracts semver from prefixed string", () => {
      expect(parseCliVersion("claude 1.0.33")).toBe("1.0.33")
    })

    it("extracts semver from verbose output", () => {
      expect(parseCliVersion("Claude Code v2.1.0 (build abc123)")).toBe("2.1.0")
    })

    it("returns null for unparseable strings", () => {
      expect(parseCliVersion("unknown")).toBeNull()
      expect(parseCliVersion("")).toBeNull()
      expect(parseCliVersion(undefined)).toBeNull()
      expect(parseCliVersion(null)).toBeNull()
    })
  })

  describe("compareSemver", () => {
    it("returns 0 for equal versions", () => {
      expect(compareSemver("1.0.0", "1.0.0")).toBe(0)
    })

    it("returns negative when a < b", () => {
      expect(compareSemver("0.9.0", "1.0.0")).toBeLessThan(0)
      expect(compareSemver("1.0.0", "1.0.1")).toBeLessThan(0)
      expect(compareSemver("1.0.9", "1.1.0")).toBeLessThan(0)
    })

    it("returns positive when a > b", () => {
      expect(compareSemver("2.0.0", "1.0.0")).toBeGreaterThan(0)
      expect(compareSemver("1.1.0", "1.0.9")).toBeGreaterThan(0)
    })
  })
})
