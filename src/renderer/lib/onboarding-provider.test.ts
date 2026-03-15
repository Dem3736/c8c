import { describe, expect, it } from "vitest"
import type { ProviderDiagnostics, ProviderId } from "@shared/types"
import { resolveOnboardingPrimaryProvider } from "./onboarding-provider"

function makeDiagnostics({
  defaultProvider = "claude",
  codexEnabled = true,
  claudeAvailable,
  codexAvailable,
}: {
  defaultProvider?: ProviderId
  codexEnabled?: boolean
  claudeAvailable: boolean
  codexAvailable: boolean
}): Pick<ProviderDiagnostics, "settings" | "health"> {
  return {
    settings: {
      defaultProvider,
      safetyProfile: "workspace_auto",
      features: {
        codexProvider: codexEnabled,
      },
    },
    health: {
      claude: {
        provider: "claude",
        available: claudeAvailable,
      },
      codex: {
        provider: "codex",
        available: codexAvailable,
      },
    },
  }
}

describe("resolveOnboardingPrimaryProvider", () => {
  it("selects codex when it is the only detected provider", () => {
    expect(
      resolveOnboardingPrimaryProvider(
        makeDiagnostics({
          claudeAvailable: false,
          codexAvailable: true,
        }),
        "sonnet",
      ),
    ).toEqual({
      provider: "codex",
      model: "gpt-5-codex",
      providerChanged: true,
      modelChanged: true,
    })
  })

  it("selects claude when it is the only detected provider", () => {
    expect(
      resolveOnboardingPrimaryProvider(
        makeDiagnostics({
          defaultProvider: "codex",
          claudeAvailable: true,
          codexAvailable: false,
        }),
        "gpt-5-codex",
      ),
    ).toEqual({
      provider: "claude",
      model: "sonnet",
      providerChanged: true,
      modelChanged: true,
    })
  })

  it("keeps the existing model when it already matches the only detected provider", () => {
    expect(
      resolveOnboardingPrimaryProvider(
        makeDiagnostics({
          claudeAvailable: true,
          codexAvailable: false,
        }),
        "sonnet",
      ),
    ).toEqual({
      provider: "claude",
      model: "sonnet",
      providerChanged: false,
      modelChanged: false,
    })
  })

  it("does not auto-select when both providers are available", () => {
    expect(
      resolveOnboardingPrimaryProvider(
        makeDiagnostics({
          claudeAvailable: true,
          codexAvailable: true,
        }),
        "sonnet",
      ),
    ).toBeNull()
  })

  it("ignores codex when the provider feature is disabled", () => {
    expect(
      resolveOnboardingPrimaryProvider(
        makeDiagnostics({
          codexEnabled: false,
          claudeAvailable: false,
          codexAvailable: true,
        }),
        "sonnet",
      ),
    ).toBeNull()
  })
})
