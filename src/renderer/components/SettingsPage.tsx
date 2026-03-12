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
import { PageHeader, PageShell, SectionHeading } from "@/components/ui/page-shell"
import { webSearchBackendAtom } from "@/lib/store"
import type { ClaudeCodeSubscriptionStatus, TelemetrySettings, UpdateInfo, UpdateEvent } from "@shared/types"
import { Download, Loader2, RefreshCw } from "lucide-react"

export function SettingsPage() {
  const [webSearchBackend, setWebSearchBackend] = useAtom(webSearchBackendAtom)
  const [subscriptionStatus, setSubscriptionStatus] = useState<ClaudeCodeSubscriptionStatus | null>(null)
  const [subscriptionStatusLoading, setSubscriptionStatusLoading] = useState(false)
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

  const refreshSubscriptionStatus = useCallback(async () => {
    setSubscriptionStatusLoading(true)
    try {
      const status = await window.api.getClaudeCodeSubscriptionStatus()
      setSubscriptionStatus(status)
    } finally {
      setSubscriptionStatusLoading(false)
    }
  }, [])

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

  useEffect(() => {
    void refreshSubscriptionStatus()
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
  }, [refreshSubscriptionStatus, refreshTelemetrySettings, telemetryApi])

  const subscriptionBadge = useMemo(() => {
    if (subscriptionStatusLoading && !subscriptionStatus) {
      return <span className="ui-meta-text rounded-md border border-hairline bg-surface-2/70 px-2 py-1">Checking...</span>
    }
    if (!subscriptionStatus) {
      return <span className="ui-meta-text rounded-md border border-hairline bg-surface-1/70 px-2 py-1">Unknown</span>
    }
    if (!subscriptionStatus.cliInstalled) {
      return <span className="ui-meta-text rounded-md border border-status-danger/30 bg-status-danger/10 px-2 py-1 text-status-danger">CLI not found</span>
    }
    if (subscriptionStatus.hasSubscription) {
      return <span className="ui-meta-text rounded-md border border-status-success/30 bg-status-success/10 px-2 py-1 text-status-success">Connected</span>
    }
    return <span className="ui-meta-text rounded-md border border-hairline bg-surface-1/70 px-2 py-1">Not connected</span>
  }, [subscriptionStatus, subscriptionStatusLoading])

  const checkedAtLabel = subscriptionStatus
    ? new Date(subscriptionStatus.checkedAt).toLocaleString()
    : null
  const isInitialSubscriptionCheck = subscriptionStatusLoading && !subscriptionStatus
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
      return <span className="ui-meta-text rounded-md border border-hairline bg-surface-2/70 px-2 py-1">Checking...</span>
    }
    if (!telemetryAvailable) {
      return <span className="ui-meta-text rounded-md border border-hairline bg-surface-1/70 px-2 py-1">Disabled in build</span>
    }
    if (telemetryChecked) {
      return <span className="ui-meta-text rounded-md border border-status-success/30 bg-status-success/10 px-2 py-1 text-status-success">Enabled</span>
    }
    return <span className="ui-meta-text rounded-md border border-hairline bg-surface-1/70 px-2 py-1">Disabled</span>
  }, [telemetryAvailable, telemetryChecked, telemetrySettings, telemetrySettingsLoading])

  return (
    <PageShell>
      <PageHeader
        title="Settings"
        subtitle="Configure global behavior for generated and template-based workflows."
      />

      {process.env.NODE_ENV !== "development" && (
      <section className="space-y-3">
        <SectionHeading title="Updates" />

        <article className="rounded-2xl surface-panel p-4 space-y-3">
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
              <div className="h-1.5 w-full rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
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
            <p className="ui-meta-text">You're on the latest version.</p>
          )}

          {updateInfo.status === "error" && (
            <div className="space-y-1">
              <p className="text-body-sm text-destructive">{updateInfo.error}</p>
              <p className="ui-meta-text">
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
        <SectionHeading title="Research" />

        <article className="rounded-2xl surface-panel p-4 space-y-3">
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

          <p className="ui-meta-text">
            Current setting is stored locally for this app profile and does not modify existing workflow files.
          </p>
        </article>
      </section>

      <section className="space-y-3">
        <SectionHeading title="Integrations" />

        <article className="rounded-2xl surface-panel p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-body-md font-semibold">Claude Code Subscription</h3>
              <p className="text-body-sm text-muted-foreground mt-1">
                Checks local Claude CLI auth state and whether Claude subscription auth is available.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {subscriptionBadge}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void refreshSubscriptionStatus()}
                disabled={subscriptionStatusLoading}
              >
                {subscriptionStatusLoading ? (
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
              CLI:{" "}
              <span className="text-foreground">
                {isInitialSubscriptionCheck
                  ? "checking..."
                  : subscriptionStatus?.cliInstalled ? "installed" : "not found"}
              </span>
            </p>
            <p>
              Auth method:{" "}
              <span className="text-foreground">
                {isInitialSubscriptionCheck
                  ? "checking..."
                  : subscriptionStatus?.authMethod || "none"}
              </span>
            </p>
            <p>
              Logged in:{" "}
              <span className="text-foreground">
                {isInitialSubscriptionCheck
                  ? "checking..."
                  : subscriptionStatus?.loggedIn ? "yes" : "no"}
              </span>
            </p>
            <p>
              Provider:{" "}
              <span className="text-foreground">
                {isInitialSubscriptionCheck
                  ? "checking..."
                  : subscriptionStatus?.apiProvider || "n/a"}
              </span>
            </p>
          </div>

          {checkedAtLabel ? (
            <p className="ui-meta-text">
              Last check: {checkedAtLabel}
            </p>
          ) : null}

          {subscriptionStatus?.error ? (
            <p className="text-body-sm text-destructive">
              {subscriptionStatus.error}
            </p>
          ) : null}

          {subscriptionStatus && !subscriptionStatus.cliInstalled && (
            <div className="rounded-lg border border-status-warning/25 bg-status-warning/10 px-3 py-2 text-body-sm space-y-1">
              <p className="font-medium text-status-warning">Claude CLI is required to run workflows</p>
              <p className="text-muted-foreground">
                Install via: <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-foreground">npm install -g @anthropic-ai/claude-code</code>
              </p>
              <p className="text-muted-foreground">
                Then authenticate: <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-foreground">claude login</code>
              </p>
            </div>
          )}

          {subscriptionStatus?.cliInstalled && !subscriptionStatus.loggedIn && (
            <div className="rounded-lg border border-status-warning/25 bg-status-warning/10 px-3 py-2 text-body-sm space-y-1">
              <p className="font-medium text-status-warning">Not authenticated</p>
              <p className="text-muted-foreground">
                Run <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-foreground">claude login</code> in your terminal, then click Refresh above.
              </p>
            </div>
          )}
        </article>
      </section>

      <section className="space-y-3">
        <SectionHeading title="Privacy" />

        <article className="rounded-2xl surface-panel p-4 space-y-3">
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
              <p className="ui-meta-text">
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

          <p className="ui-meta-text">{telemetryHint}</p>
        </article>
      </section>
    </PageShell>
  )
}
