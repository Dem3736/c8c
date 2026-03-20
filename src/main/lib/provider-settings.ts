import { mkdir, readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import type { ProviderId, ProviderSettings, SafetyProfile } from "@shared/types"
import { writeFileAtomic } from "./atomic-write"
import { runSerialTask } from "./serial-task"
import { resolveAppHomeDir } from "./runtime-paths"

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

interface ElectronAppLike {
  getPath(name: "home"): string
}

interface ElectronSafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

const require = createRequire(import.meta.url)

function getElectronBindings(): {
  app?: ElectronAppLike
  safeStorage?: ElectronSafeStorageLike
} {
  try {
    const electron = require("electron") as {
      app?: ElectronAppLike
      safeStorage?: ElectronSafeStorageLike
    }

    return {
      app: electron.app,
      safeStorage: electron.safeStorage,
    }
  } catch {
    return {}
  }
}

function resolveHomeDir(): string {
  return resolveAppHomeDir({ app: getElectronBindings().app })
}

function providerSettingsPath(): string {
  return join(resolveHomeDir(), ".c8c", "provider-settings.json")
}

const PROVIDER_SETTINGS_SERIAL_KEY = "provider-settings"

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
  try {
    const storage = getElectronBindings().safeStorage
    if (storage?.isEncryptionAvailable()) {
      return {
        encrypted: storage.encryptString(secret).toString("base64"),
      }
    }
  } catch {
    // Fall back to plaintext storage outside Electron or before safeStorage is ready.
  }

  return { plain: secret }
}

function decodeSecret(payload: PersistedProviderSettings): string | undefined {
  if (typeof payload.codexApiKeyEncrypted === "string" && payload.codexApiKeyEncrypted.trim()) {
    try {
      const storage = getElectronBindings().safeStorage
      if (!storage?.isEncryptionAvailable()) {
        return undefined
      }
      const buffer = Buffer.from(payload.codexApiKeyEncrypted, "base64")
      return storage.decryptString(buffer)
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

async function mutateProviderState<T>(
  mutation: (state: ProviderSettingsState) => Promise<T> | T,
): Promise<T> {
  return runSerialTask(PROVIDER_SETTINGS_SERIAL_KEY, async () => {
    const state = await loadProviderState()
    const result = await mutation(state)
    await saveProviderState(state)
    return result
  })
}

export async function getProviderSettings(): Promise<ProviderSettings> {
  return (await loadProviderState()).settings
}

export async function updateProviderSettings(
  patch: Partial<ProviderSettings>,
): Promise<ProviderSettings> {
  return mutateProviderState((state) => {
    state.settings = {
      defaultProvider: normalizeProviderId(patch.defaultProvider) || state.settings.defaultProvider,
      safetyProfile: normalizeSafetyProfile(patch.safetyProfile) || state.settings.safetyProfile,
      features: {
        codexProvider: typeof patch.features?.codexProvider === "boolean"
          ? patch.features.codexProvider
          : state.settings.features.codexProvider,
      },
    }
    return state.settings
  })
}

export async function getCodexApiKey(): Promise<string | undefined> {
  return (await loadProviderState()).codexApiKey
}

export async function hasCodexApiKey(): Promise<boolean> {
  return Boolean(await getCodexApiKey())
}

export async function setCodexApiKey(apiKey: string): Promise<boolean> {
  const normalized = apiKey.trim()
  return mutateProviderState((state) => {
    state.codexApiKey = normalized || undefined
    return Boolean(normalized)
  })
}

export async function clearCodexApiKey(): Promise<boolean> {
  return mutateProviderState((state) => {
    const hadValue = Boolean(state.codexApiKey)
    state.codexApiKey = undefined
    return hadValue
  })
}
