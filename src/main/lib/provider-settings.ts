import { app, safeStorage } from "electron"
import { mkdir, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { ProviderId, ProviderSettings, SafetyProfile } from "@shared/types"
import { writeFileAtomic } from "./atomic-write"

interface ProviderSettingsState {
  settings: ProviderSettings
  codexApiKey?: string
}

interface PersistedProviderSettings {
  defaultProvider?: ProviderId
  safetyProfile?: SafetyProfile
  features?: {
    codexProvider?: boolean
  }
  codexApiKey?: string
  codexApiKeyEncrypted?: string
}

const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  defaultProvider: "claude",
  safetyProfile: "workspace_auto",
  features: {
    codexProvider: true,
  },
}

function resolveHomeDir(): string {
  try {
    const home = app.getPath("home")
    if (home) return home
  } catch {
    // app.getPath can throw before Electron finishes initialization.
  }
  return homedir()
}

function providerSettingsPath(): string {
  return join(resolveHomeDir(), ".c8c", "provider-settings.json")
}

function normalizeProviderId(value: unknown): ProviderId | undefined {
  return value === "claude" || value === "codex" ? value : undefined
}

function normalizeSafetyProfile(value: unknown): SafetyProfile | undefined {
  return value === "safe_readonly"
    || value === "workspace_auto"
    || value === "workspace_untrusted"
    || value === "ci_readonly"
    || value === "dangerous"
    ? value
    : undefined
}

function encodeSecret(secret: string): { encrypted?: string; plain?: string } {
  if (safeStorage.isEncryptionAvailable()) {
    return {
      encrypted: safeStorage.encryptString(secret).toString("base64"),
    }
  }
  return { plain: secret }
}

function decodeSecret(payload: PersistedProviderSettings): string | undefined {
  if (typeof payload.codexApiKeyEncrypted === "string" && payload.codexApiKeyEncrypted.trim()) {
    try {
      const buffer = Buffer.from(payload.codexApiKeyEncrypted, "base64")
      return safeStorage.decryptString(buffer)
    } catch {
      // Fall through to plaintext fallback.
    }
  }

  if (typeof payload.codexApiKey === "string" && payload.codexApiKey.trim()) {
    return payload.codexApiKey.trim()
  }

  return undefined
}

function normalizeSettings(payload: PersistedProviderSettings | null | undefined): ProviderSettingsState {
  return {
    settings: {
      defaultProvider: normalizeProviderId(payload?.defaultProvider) || DEFAULT_PROVIDER_SETTINGS.defaultProvider,
      safetyProfile: normalizeSafetyProfile(payload?.safetyProfile) || DEFAULT_PROVIDER_SETTINGS.safetyProfile,
      features: {
        codexProvider: typeof payload?.features?.codexProvider === "boolean"
          ? payload.features.codexProvider
          : DEFAULT_PROVIDER_SETTINGS.features.codexProvider,
      },
    },
    codexApiKey: decodeSecret(payload || {}),
  }
}

async function loadProviderState(): Promise<ProviderSettingsState> {
  try {
    const raw = await readFile(providerSettingsPath(), "utf-8")
    const parsed = JSON.parse(raw) as PersistedProviderSettings
    return normalizeSettings(parsed)
  } catch {
    return normalizeSettings(null)
  }
}

async function saveProviderState(state: ProviderSettingsState): Promise<void> {
  const path = providerSettingsPath()
  await mkdir(dirname(path), { recursive: true })
  const encoded = state.codexApiKey ? encodeSecret(state.codexApiKey) : {}
  const payload: PersistedProviderSettings = {
    defaultProvider: state.settings.defaultProvider,
    safetyProfile: state.settings.safetyProfile,
    features: {
      codexProvider: state.settings.features.codexProvider,
    },
    ...(encoded.encrypted ? { codexApiKeyEncrypted: encoded.encrypted } : {}),
    ...(encoded.plain ? { codexApiKey: encoded.plain } : {}),
  }
  await writeFileAtomic(path, JSON.stringify(payload, null, 2))
}

export async function getProviderSettings(): Promise<ProviderSettings> {
  return (await loadProviderState()).settings
}

export async function updateProviderSettings(
  patch: Partial<ProviderSettings>,
): Promise<ProviderSettings> {
  const state = await loadProviderState()
  state.settings = {
    defaultProvider: normalizeProviderId(patch.defaultProvider) || state.settings.defaultProvider,
    safetyProfile: normalizeSafetyProfile(patch.safetyProfile) || state.settings.safetyProfile,
    features: {
      codexProvider: typeof patch.features?.codexProvider === "boolean"
        ? patch.features.codexProvider
        : state.settings.features.codexProvider,
    },
  }
  await saveProviderState(state)
  return state.settings
}

export async function getCodexApiKey(): Promise<string | undefined> {
  return (await loadProviderState()).codexApiKey
}

export async function hasCodexApiKey(): Promise<boolean> {
  return Boolean(await getCodexApiKey())
}

export async function setCodexApiKey(apiKey: string): Promise<boolean> {
  const normalized = apiKey.trim()
  const state = await loadProviderState()
  state.codexApiKey = normalized || undefined
  await saveProviderState(state)
  return Boolean(normalized)
}

export async function clearCodexApiKey(): Promise<boolean> {
  const state = await loadProviderState()
  const hadValue = Boolean(state.codexApiKey)
  state.codexApiKey = undefined
  await saveProviderState(state)
  return hadValue
}
