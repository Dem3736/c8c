import { useAtom } from "jotai"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader, PageShell, SectionHeading } from "@/components/ui/page-shell"
import {
  defaultProviderAtom,
  globalExecutionDefaultsAtom,
  providerAuthStatusAtom,
  providerAvailabilityAtom,
  providerSettingsAtom,
  webSearchBackendAtom,
} from "@/lib/store"
import type {
  ProviderDiagnostics,
  ProviderId,
  TelemetrySettings,
  UpdateInfo,
  UpdateEvent,
} from "@shared/types"
import {
  PROVIDER_LABELS,
  SAFETY_PROFILE_LABELS,
  getDefaultModelForProvider,
  modelLooksCompatible,
} from "@shared/provider-metadata"
import { Download, Loader2, RefreshCw } from "lucide-react"
import { McpServersSection } from "@/components/McpServersSection"
import { ProviderModelInput, ProviderSelect } from "@/components/provider-controls"

export function SettingsPage() {
  const [webSearchBackend, setWebSearchBackend] = useAtom(webSearchBackendAtom)
  const [execDefaults, setExecDefaults] = useAtom(globalExecutionDefaultsAtom)
  const [providerSettings, setProviderSettings] = useAtom(providerSettingsAtom)
  const [defaultProvider, setDefaultProvider] = useAtom(defaultProviderAtom)
  const [providerAvailability, setProviderAvailability] = useAtom(providerAvailabilityAtom)
  const [providerAuthStatus, setProviderAuthStatus] = useAtom(providerAuthStatusAtom)
  const [providerDiagnosticsLoading, setProviderDiagnosticsLoading] = useState(false)
  const [codexApiKeyDraft, setCodexApiKeyDraft] = useState("")
  const [codexApiKeySaving, setCodexApiKeySaving] = useState(false)
  const [telemetrySettings, setTelemetrySettings] = useState<TelemetrySettings | null>(null)
  const [telemetrySettingsLoading, setTelemetrySettingsLoading] = useState(false)
  const [telemetryConsentSaving, setTelemetryConsentSaving] = useState(false)
  const [appVersion, setAppVersion] = useState<string>("")
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>({ status: "idle" })
  const [updateChecking, setUpdateChecking] = useState(false)

  const telemetryApi = window.api as typeof window.api & {
    getTelemetrySettings?: () => Promise<TelemetrySettings>
    setTelemetryConsent?: (enabled: boolean) => Promise<TelemetrySettings>
    trackUiEvent?: (eventName: "settings_opened") => Promise<boolean>
  }

  const applyProviderDiagnostics = useCallback((diagnostics: ProviderDiagnostics) => {
    setProviderSettings(diagnostics.settings)
    setProviderAvailability(diagnostics.health)
    setProviderAuthStatus(diagnostics.auth)
  }, [setProviderAuthStatus, setProviderAvailability, setProviderSettings])

  const refreshProviderDiagnostics = useCallback(async () => {
    setProviderDiagnosticsLoading(true)
    try {
      const diagnostics = await window.api.getProviderDiagnostics()
      applyProviderDiagnostics(diagnostics)
    } finally {
      setProviderDiagnosticsLoading(false)
    }
  }, [applyProviderDiagnostics])

  const persistProviderSettings = useCallback(async (patch: Partial<typeof providerSettings>) => {
    const nextSettings = await window.api.updateProviderSettings(patch)
    setProviderSettings(nextSettings)
  }, [setProviderSettings])

  const refreshTelemetrySettings = useCallback(async () => {
    if (typeof telemetryApi.getTelemetrySettings !== "function") {
      setTelemetrySettings({
        buildFlavor: "oss",
        provider: "noop",
        enabledInBuild: false,
        consent: false,
        telemetryLocalTest: false,
        configDetected: false,
      })
      return
    }

    setTelemetrySettingsLoading(true)
    try {
      const nextSettings = await telemetryApi.getTelemetrySettings()
      setTelemetrySettings(nextSettings)
    } finally {
      setTelemetrySettingsLoading(false)
    }
  }, [telemetryApi])

  const updateTelemetryConsent = useCallback(async (enabled: boolean) => {
    if (typeof telemetryApi.setTelemetryConsent !== "function") return
    setTelemetryConsentSaving(true)
    try {
      const nextSettings = await telemetryApi.setTelemetryConsent(enabled)
      setTelemetrySettings(nextSettings)
    } finally {
      setTelemetryConsentSaving(false)
    }
  }, [telemetryApi])

  const handleCheckForUpdate = useCallback(async () => {
    setUpdateChecking(true)
    try {
      const info = await window.api.checkForUpdate()
      setUpdateInfo(info)
    } finally {
      setUpdateChecking(false)
    }
  }, [])

  const handleInstallUpdate = useCallback(() => {
    void window.api.installUpdate()
  }, [])

  const handleDefaultProviderChange = useCallback(async (provider: ProviderId) => {
    await persistProviderSettings({ defaultProvider: provider })
    setDefaultProvider(provider)
    setExecDefaults((prev) => ({
      ...prev,
      model: modelLooksCompatible(provider, prev.model)
        ? prev.model
        : getDefaultModelForProvider(provider),
    }))
  }, [persistProviderSettings, setDefaultProvider, setExecDefaults])

  const handleSaveCodexApiKey = useCallback(async () => {
    setCodexApiKeySaving(true)
    try {
      const diagnostics = await window.api.setCodexApiKey(codexApiKeyDraft)
      applyProviderDiagnostics(diagnostics)
      setCodexApiKeyDraft("")
    } finally {
      setCodexApiKeySaving(false)
    }
  }, [applyProviderDiagnostics, codexApiKeyDraft])

  const handleClearCodexApiKey = useCallback(async () => {
    setCodexApiKeySaving(true)
    try {
      const diagnostics = await window.api.clearCodexApiKey()
      applyProviderDiagnostics(diagnostics)
      setCodexApiKeyDraft("")
    } finally {
      setCodexApiKeySaving(false)
    }
  }, [applyProviderDiagnostics])

  const handleLogoutProvider = useCallback(async (provider: ProviderId) => {
    setProviderDiagnosticsLoading(true)
    try {
      const diagnostics = await window.api.logoutProvider(provider)
      applyProviderDiagnostics(diagnostics)
    } finally {
      setProviderDiagnosticsLoading(false)
    }
  }, [applyProviderDiagnostics])

  useEffect(() => {
    void refreshProviderDiagnostics()
    void refreshTelemetrySettings()
    void window.api.getAppVersion().then(setAppVersion)
    void window.api.getUpdateStatus().then(setUpdateInfo)
    if (typeof telemetryApi.trackUiEvent === "function") {
      void telemetryApi.trackUiEvent("settings_opened").catch(() => undefined)
    }

    const unsubUpdate = window.api.onUpdateEvent((event: UpdateEvent) => {
      switch (event.type) {
        case "checking":
          setUpdateInfo({ status: "checking" })
          break
        case "available":
          setUpdateInfo({ status: "available", version: event.version })
          break
        case "not-available":
          setUpdateInfo({ status: "not-available" })
          break
        case "download-progress":
          setUpdateInfo((prev) => ({ ...prev, status: "downloading", progress: event.percent }))
          break
        case "downloaded":
          setUpdateInfo({ status: "downloaded", version: event.version, progress: 100 })
          break
        case "error":
          setUpdateInfo((prev) => ({ ...prev, status: "error", error: event.message }))
          break
      }
    })

    return unsubUpdate
  }, [refreshProviderDiagnostics, refreshTelemetrySettings, telemetryApi])
  const telemetryAvailable = Boolean(telemetrySettings?.enabledInBuild)
  const telemetryChecked = Boolean(telemetrySettings?.consent)
  const telemetryDisabled = telemetrySettingsLoading || telemetryConsentSaving || !telemetryAvailable
  const telemetryBuildLabel = telemetrySettings
    ? telemetrySettings.buildFlavor === "release"
      ? "Release build"
      : "OSS build"
    : "Unknown"
  const telemetryProviderLabel = telemetrySettings?.provider === "posthog" ? "PostHog" : "Disabled"
  const telemetryHint = useMemo(() => {
    if (!telemetrySettings) return "Telemetry configuration is still loading."
    if (telemetrySettings.enabledInBuild) return "Telemetry pipeline is compiled into this build."
    if (!telemetrySettings.configDetected) {
      return "Missing C8C_POSTHOG_HOST / C8C_POSTHOG_KEY at app start."
    }
    if (telemetrySettings.buildFlavor !== "release" && !telemetrySettings.telemetryLocalTest) {
      return "For local OSS testing set C8C_TELEMETRY_LOCAL_TEST=1 before starting dev."
    }
    return "Telemetry is disabled by current build flags."
  }, [telemetrySettings])
  const telemetryStatusBadge = useMemo(() => {
    if (telemetrySettingsLoading && !telemetrySettings) {
      return <span className="ui-meta-text text-muted-foreground rounded-md border border-hairline bg-surface-2/70 px-2 py-1">Checking...</span>
    }
    if (!telemetryAvailable) {
      return <span className="ui-meta-text text-muted-foreground rounded-md border border-hairline bg-surface-1/70 px-2 py-1">Disabled in build</span>
    }
    if (telemetryChecked) {
      return <span className="ui-meta-text rounded-md border border-status-success/30 bg-status-success/10 px-2 py-1 text-status-success">Enabled</span>
    }
    return <span className="ui-meta-text text-muted-foreground rounded-md border border-hairline bg-surface-1/70 px-2 py-1">Disabled</span>
  }, [telemetryAvailable, telemetryChecked, telemetrySettings, telemetrySettingsLoading])
  const providers = useMemo(() => ["claude", "codex"] as ProviderId[], [])

  return (
    <PageShell>
      <PageHeader
        title="Global Settings"
        subtitle="Configure app-wide defaults, providers, and services used across workflows."
      />

      {process.env.NODE_ENV !== "development" && (
      <section className="space-y-3">
        <SectionHeading title="Updates" />

        <article className="rounded-lg surface-panel p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-body-md font-semibold">Application Updates</h3>
              <p className="text-body-sm text-muted-foreground mt-1">
                Current version: <span className="font-medium">{appVersion || "..."}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {updateInfo.status === "downloaded" ? (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={handleInstallUpdate}
                >
                  <Download size={14} />
                  Restart to update
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleCheckForUpdate()}
                  disabled={updateChecking || updateInfo.status === "checking" || updateInfo.status === "downloading"}
                >
                  {updateChecking || updateInfo.status === "checking" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  Check for updates
                </Button>
              )}
            </div>
          </div>

          {updateInfo.status === "available" && updateInfo.version && (
            <p className="text-body-sm text-status-info">
              Version {updateInfo.version} is available. Downloading...
            </p>
          )}

          {updateInfo.status === "downloading" && (
            <div className="space-y-1">
              <p className="text-body-sm text-muted-foreground">
                Downloading update... {updateInfo.progress ?? 0}%
              </p>
              <div className="ui-progress-track">
                <div
                  className="ui-progress-bar"
                  style={{ width: `${updateInfo.progress ?? 0}%` }}
                />
              </div>
            </div>
          )}

          {updateInfo.status === "downloaded" && (
            <p className="text-body-sm text-status-success">
              Version {updateInfo.version} is ready to install. Restart the app to apply the update.
            </p>
          )}

          {updateInfo.status === "not-available" && (
            <p className="ui-meta-text text-muted-foreground">You're on the latest version.</p>
          )}

          {updateInfo.status === "error" && (
            <div className="space-y-1">
              <p className="text-body-sm text-status-danger">{updateInfo.error}</p>
              <p className="ui-meta-text text-muted-foreground">
                You can download the latest version from{" "}
                <a
                  href="https://github.com/c8c-ai/c8c/releases"
                  className="underline text-accent"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub Releases
                </a>.
              </p>
            </div>
          )}
        </article>
      </section>
      )}

      <section className="space-y-3">
        <SectionHeading title="Execution Defaults" />

        <article className="rounded-lg surface-panel p-4 space-y-3">
          <div>
            <h3 className="text-body-md font-semibold">New Workflow Defaults</h3>
            <p className="text-body-sm text-muted-foreground mt-1">
              Default values applied when creating new workflows. These do not affect existing saved workflows.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="exec-default-model" className="text-body-sm font-medium text-foreground">Model</Label>
              <ProviderModelInput
                id="exec-default-model"
                provider={defaultProvider}
                value={execDefaults.model}
                onValueChange={(value) => setExecDefaults((prev) => ({ ...prev, model: value }))}
                placeholder={getDefaultModelForProvider(defaultProvider)}
                className="w-full"
              />
              <p className="ui-meta-text text-muted-foreground">
                Suggested models follow the current default provider.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exec-default-max-turns" className="text-body-sm font-medium text-foreground">Max Turns</Label>
              <Input
                id="exec-default-max-turns"
                type="number"
                min={1}
                max={1000}
                value={execDefaults.maxTurns}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (!isNaN(v) && v >= 1) setExecDefaults((prev) => ({ ...prev, maxTurns: v }))
                }}
              />
              <p className="ui-meta-text text-muted-foreground">Maximum agentic turns per skill node.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exec-default-timeout" className="text-body-sm font-medium text-foreground">Timeout (minutes)</Label>
              <Input
                id="exec-default-timeout"
                type="number"
                min={1}
                max={480}
                value={execDefaults.timeout_minutes}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (!isNaN(v) && v >= 1) setExecDefaults((prev) => ({ ...prev, timeout_minutes: v }))
                }}
              />
              <p className="ui-meta-text text-muted-foreground">Per-node execution timeout.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exec-default-max-parallel" className="text-body-sm font-medium text-foreground">Max Parallel</Label>
              <Input
                id="exec-default-max-parallel"
                type="number"
                min={1}
                max={32}
                value={execDefaults.maxParallel}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (!isNaN(v) && v >= 1) setExecDefaults((prev) => ({ ...prev, maxParallel: v }))
                }}
              />
              <p className="ui-meta-text text-muted-foreground">Max concurrent branches for splitter fan-out.</p>
            </div>
          </div>

          <p className="ui-meta-text text-muted-foreground">
            Stored locally for this app profile.
          </p>
        </article>
      </section>

      <section className="space-y-3">
        <SectionHeading title="Research" />

        <article className="rounded-lg surface-panel p-4 space-y-3">
          <div>
            <h3 className="text-body-md font-semibold">Web Search Backend</h3>
            <p className="text-body-sm text-muted-foreground mt-1">
              Defines which web-search path is preferred when applying templates from the
              <span className="font-medium"> research </span>
              category.
            </p>
          </div>

          <Select value={webSearchBackend} onValueChange={(value) => setWebSearchBackend(value as typeof webSearchBackend)}>
            <SelectTrigger className="w-full max-w-[340px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Backend</SelectLabel>
                <SelectItem value="builtin">Built-in (default)</SelectItem>
                <SelectItem value="exa">Exa MCP</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <p className="ui-meta-text text-muted-foreground">
            Current setting is stored locally for this app profile and does not modify existing workflow files.
          </p>
        </article>
      </section>

      <section className="space-y-3">
        <SectionHeading title="Providers" />

        <article className="rounded-lg surface-panel p-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="default-provider" className="text-body-sm font-medium text-foreground">
                Default provider
              </Label>
              <ProviderSelect
                id="default-provider"
                value={defaultProvider}
                onValueChange={(value) => void handleDefaultProviderChange(value)}
                codexEnabled={providerSettings.features.codexProvider}
                className="w-full"
              />
              <p className="ui-meta-text text-muted-foreground">
                Used when a workflow does not set its own provider override.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="safety-profile" className="text-body-sm font-medium text-foreground">
                Safety profile
              </Label>
              <Select
                value={providerSettings.safetyProfile}
                onValueChange={(value) => void persistProviderSettings({ safetyProfile: value as typeof providerSettings.safetyProfile })}
              >
                <SelectTrigger id="safety-profile" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Profile</SelectLabel>
                    {Object.entries(SAFETY_PROFILE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className="ui-meta-text text-muted-foreground">
                Mapped to provider-specific sandbox and approval flags at runtime.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void refreshProviderDiagnostics()}
              disabled={providerDiagnosticsLoading}
            >
              {providerDiagnosticsLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh provider status
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {providers.map((providerId) => {
              const health = providerAvailability[providerId]
              const auth = providerAuthStatus[providerId]
              const available = Boolean(health?.available)
              const authenticated = Boolean(auth?.authenticated)
              const authState = auth?.state ?? "unknown"
              const statusLabel = !health
                ? "Checking..."
                : !available
                  ? "CLI not found"
                  : authenticated
                    ? "Ready"
                    : authState === "unknown"
                      ? "Auth check unavailable"
                      : "Needs auth"

              return (
                <article key={providerId} className="rounded-lg border border-hairline bg-surface-1/60 p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-body-md font-semibold">{PROVIDER_LABELS[providerId]}</h3>
                      <p className="text-body-sm text-muted-foreground mt-1">
                        {health?.version || "CLI version unknown"}
                      </p>
                    </div>
                    <span className={`ui-meta-text rounded-md border px-2 py-1 ${
                      authenticated
                        ? "border-status-success/30 bg-status-success/10 text-status-success"
                        : authState === "unknown"
                          ? "border-status-warning/30 bg-status-warning/10 text-status-warning"
                        : available
                          ? "border-status-warning/30 bg-status-warning/10 text-status-warning"
                          : "border-status-danger/30 bg-status-danger/10 text-status-danger"
                    }`}>
                      {statusLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2 text-body-sm text-muted-foreground sm:grid-cols-2">
                    <p>Executable: <span className="text-foreground">{health?.executablePath || "not found"}</span></p>
                    <p>Auth method: <span className="text-foreground">{auth?.authMethod || "none"}</span></p>
                    <p>Account: <span className="text-foreground">{auth?.accountLabel || "n/a"}</span></p>
                    <p>API key override: <span className="text-foreground">{auth?.apiKeyConfigured ? "configured" : "not set"}</span></p>
                  </div>

                  {health?.error ? (
                    <p className="text-body-sm text-status-danger">{health.error}</p>
                  ) : null}
                  {auth?.error ? (
                    <p className="text-body-sm text-status-danger">{auth.error}</p>
                  ) : null}

                  {providerId === "codex" && (
                    <div className="space-y-2 rounded-lg border border-hairline bg-surface-2/40 p-3">
                      <Label htmlFor="codex-api-key" className="text-body-sm font-medium text-foreground">
                        CODEX_API_KEY override
                      </Label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          id="codex-api-key"
                          type="password"
                          value={codexApiKeyDraft}
                          onChange={(event) => setCodexApiKeyDraft(event.target.value)}
                          placeholder="Paste API key to store in the main process"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleSaveCodexApiKey()}
                          disabled={codexApiKeySaving || !codexApiKeyDraft.trim()}
                        >
                          Save key
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => void handleClearCodexApiKey()}
                          disabled={codexApiKeySaving}
                        >
                          Clear key
                        </Button>
                      </div>
                      <p className="ui-meta-text text-muted-foreground">
                        ChatGPT subscription login works via <code className="inline-code">codex login</code> and does not require an API key. The app-managed key is only an optional override stored in the main process.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleLogoutProvider(providerId)}
                      disabled={providerDiagnosticsLoading}
                    >
                      Log out
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        </article>
      </section>

      <McpServersSection provider={defaultProvider} />

      <section className="space-y-3">
        <SectionHeading title="Privacy" />

        <article className="rounded-lg surface-panel p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-body-md font-semibold">Product Analytics</h3>
              <p className="text-body-sm text-muted-foreground mt-1">
                Sends anonymized runtime metrics to improve reliability and update safety. No prompts, content, paths, or secrets are sent.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {telemetryStatusBadge}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void refreshTelemetrySettings()}
                disabled={telemetrySettingsLoading}
              >
                {telemetrySettingsLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Refresh
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 text-body-sm text-muted-foreground sm:grid-cols-2">
            <p>
              Build: <span className="text-foreground">{telemetryBuildLabel || "unknown"}</span>
            </p>
            <p>
              Provider: <span className="text-foreground">{telemetryProviderLabel}</span>
            </p>
            <p>
              Config: <span className="text-foreground">{telemetrySettings?.configDetected ? "present" : "missing"}</span>
            </p>
            <p>
              Local test flag: <span className="text-foreground">{telemetrySettings?.telemetryLocalTest ? "on" : "off"}</span>
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface-1/60 px-3 py-2">
            <div>
              <p className="text-body-sm font-medium text-foreground">Allow product analytics</p>
              <p className="ui-meta-text text-muted-foreground">
                {(telemetryAvailable
                  ? "You can opt in or out at any time."
                  : "Telemetry is not available in this build.")}
              </p>
            </div>
            <Switch
              checked={telemetryChecked}
              disabled={telemetryDisabled}
              aria-label="Allow product analytics"
              onCheckedChange={(enabled) => {
                void updateTelemetryConsent(enabled)
              }}
            />
          </div>

          <p className="ui-meta-text text-muted-foreground">{telemetryHint}</p>
        </article>
      </section>
    </PageShell>
  )
}
