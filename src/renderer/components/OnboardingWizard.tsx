import { useCallback, useEffect, useRef, useState } from "react"
import { useAtom } from "jotai"
import { Button } from "@/components/ui/button"
import {
  chatPanelOpenAtom,
  firstLaunchAtom,
  globalExecutionDefaultsAtom,
  mainViewAtom,
  providerAuthStatusAtom,
  providerAvailabilityAtom,
  providerSettingsAtom,
  selectedProjectAtom,
} from "@/lib/store"
import { resolveOnboardingPrimaryProvider } from "@/lib/onboarding-provider"
import { PROVIDER_LABELS } from "@shared/provider-metadata"
import type { ProviderDiagnostics, ProviderId } from "@shared/types"
import {
  CheckCircle2,
  XCircle,
  Loader2,
  FolderOpen,
  ArrowRight,
  ArrowLeft,
  Search,
  Pencil,
  FileText,
  LayoutTemplate,
  Terminal,
  Bot,
} from "lucide-react"

type JobChoice = "analyze" | "generate" | "content"

const TOTAL_STEPS = 4

export function OnboardingWizard() {
  const [step, setStep] = useState(1)
  const [selectedJob, setSelectedJob] = useState<JobChoice | null>(null)
  const [, setFirstLaunch] = useAtom(firstLaunchAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [, setSelectedProject] = useAtom(selectedProjectAtom)
  const [, setChatPanelOpen] = useAtom(chatPanelOpenAtom)

  const skip = useCallback(() => {
    setFirstLaunch(false)
    setMainView("thread")
  }, [setFirstLaunch, setMainView])

  const next = useCallback(() => {
    if (step < TOTAL_STEPS) setStep((s) => s + 1)
  }, [step])

  const prev = useCallback(() => {
    if (step > 1) setStep((s) => s - 1)
  }, [step])

  const openAgent = useCallback(() => {
    setFirstLaunch(false)
    setMainView("thread")
    setChatPanelOpen(true)
  }, [setFirstLaunch, setMainView, setChatPanelOpen])

  const goTemplates = useCallback(() => {
    setFirstLaunch(false)
    setMainView("templates")
  }, [setFirstLaunch, setMainView])

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pt-[var(--titlebar-height)]">
      <div className="flex flex-col items-center justify-center min-h-full px-6 py-12">
        <div className="w-full max-w-[520px] space-y-8">
          {/* Progress indicator */}
          <div className="flex items-center justify-center gap-2">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                style={{ transitionProperty: "width, background-color" }}
                className={`h-1.5 rounded-full ui-motion-fast ${
                  i + 1 === step
                    ? "w-8 bg-foreground"
                    : i + 1 < step
                      ? "w-4 bg-foreground/40"
                      : "w-4 bg-muted"
                }`}
              />
            ))}
          </div>

          {/* Step content */}
          <div className="rounded-lg surface-panel p-8 space-y-6">
            {step === 1 && <StepCheckCli />}
            {step === 2 && <StepOpenProject onProjectAdded={setSelectedProject} />}
            {step === 3 && <StepPickJob selectedJob={selectedJob} onSelect={setSelectedJob} />}
            {step === 4 && (
              <StepActivateAgent
                selectedJob={selectedJob}
                onOpenAgent={openAgent}
                onGoTemplates={goTemplates}
              />
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={skip}
              className="text-muted-foreground"
            >
              Skip setup
            </Button>

            <div className="flex items-center gap-2">
              {step > 1 && (
                <Button type="button" variant="ghost" size="sm" onClick={prev}>
                  <ArrowLeft size={14} />
                  Back
                </Button>
              )}
              {step < TOTAL_STEPS && (
                <Button type="button" variant="default" size="sm" onClick={next}>
                  Continue
                  <ArrowRight size={14} />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Step 1: Check CLI ───────────────────────────────────── */

function StepCheckCli() {
  const [, setProviderSettings] = useAtom(providerSettingsAtom)
  const [, setProviderAvailability] = useAtom(providerAvailabilityAtom)
  const [, setProviderAuthStatus] = useAtom(providerAuthStatusAtom)
  const [execDefaults, setExecDefaults] = useAtom(globalExecutionDefaultsAtom)
  const currentModelRef = useRef(execDefaults.model)
  const [diagnostics, setDiagnostics] = useState<ProviderDiagnostics | null>(null)
  const [primaryProvider, setPrimaryProvider] = useState<ProviderId | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    currentModelRef.current = execDefaults.model
  }, [execDefaults.model])

  const applyDiagnostics = useCallback((nextDiagnostics: ProviderDiagnostics) => {
    setDiagnostics(nextDiagnostics)
    setProviderSettings(nextDiagnostics.settings)
    setProviderAvailability(nextDiagnostics.health)
    setProviderAuthStatus(nextDiagnostics.auth)
  }, [setProviderAuthStatus, setProviderAvailability, setProviderSettings])

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    void (async () => {
      try {
        const initialDiagnostics = await window.api.getProviderDiagnostics()
        if (cancelled) return

        applyDiagnostics(initialDiagnostics)

        const resolvedPrimary = resolveOnboardingPrimaryProvider(
          initialDiagnostics,
          currentModelRef.current,
        )

        if (cancelled) return
        setPrimaryProvider(resolvedPrimary?.provider ?? null)

        if (resolvedPrimary?.providerChanged) {
          const nextSettings = await window.api.updateProviderSettings({
            defaultProvider: resolvedPrimary.provider,
          })
          if (cancelled) return

          applyDiagnostics({
            ...initialDiagnostics,
            settings: nextSettings,
          })
        }

        if (resolvedPrimary?.modelChanged) {
          setExecDefaults((prev) => ({
            ...prev,
            model: resolvedPrimary.model,
          }))
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Could not check CLI status.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [applyDiagnostics, setExecDefaults])

  const providers: ProviderId[] = ["claude", "codex"]
  const readyProviders = providers.filter((provider) => {
    const health = diagnostics?.health[provider]
    const auth = diagnostics?.auth[provider]
    return Boolean(health?.available && auth?.authenticated)
  })
  const hasMultipleAvailableProviders = providers.filter((provider) => diagnostics?.health[provider].available).length > 1

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-surface-2">
          <Terminal size={20} className="text-foreground" />
        </div>
        <h2 className="text-title-md text-foreground">Check CLI</h2>
      </div>
      <p className="text-body-md text-muted-foreground">
        c8c can run workflows through Claude Code or Codex. If only one CLI is
        detected, it becomes the default provider automatically.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          Checking CLI status...
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-status-danger/30 bg-status-danger/5 p-3">
          <p className="text-body-sm text-status-danger">{loadError}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((provider) => {
            const health = diagnostics?.health[provider]
            const auth = diagnostics?.auth[provider]
            const available = health?.available ?? false
            const authenticated = auth?.authenticated ?? false
            const authState = auth?.state ?? "unknown"
            const installCommand = provider === "claude"
              ? "npm install -g @anthropic-ai/claude-code"
              : "npm install -g @openai/codex"
            const loginCommand = provider === "claude" ? "claude login" : "codex login"

            return (
              <div key={provider} className="rounded-lg border border-hairline bg-surface-2/60 p-3 space-y-2">
                <div className="text-body-sm font-medium text-foreground">{PROVIDER_LABELS[provider]}</div>

                <div className="flex items-center gap-2 text-body-sm">
                  {available ? (
                    <CheckCircle2 size={16} className="text-status-success shrink-0" />
                  ) : (
                    <XCircle size={16} className="text-status-danger shrink-0" />
                  )}
                  <span className={available ? "text-foreground" : "text-status-danger"}>
                    CLI {available ? "detected" : "not found"}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-body-sm">
                  {authenticated ? (
                    <CheckCircle2 size={16} className="text-status-success shrink-0" />
                  ) : authState === "unknown" ? (
                    <Loader2 size={16} className="text-status-warning shrink-0" />
                  ) : (
                    <XCircle size={16} className="text-status-danger shrink-0" />
                  )}
                  <span className={
                    authenticated
                      ? "text-foreground"
                      : authState === "unknown"
                        ? "text-status-warning"
                        : "text-status-danger"
                  }>
                    {available
                      ? authenticated
                        ? "Authenticated"
                        : authState === "unknown"
                          ? "Authentication could not be verified automatically"
                          : "Not authenticated"
                      : "Authentication unavailable until the CLI is installed"}
                  </span>
                </div>

                {!available && (
                  <p className="text-body-sm text-muted-foreground">
                    Install: <code className="inline-code">{installCommand}</code>
                  </p>
                )}

                {available && authState === "unauthenticated" && (
                  <p className="text-body-sm text-muted-foreground">
                    Authenticate: <code className="inline-code">{loginCommand}</code>
                  </p>
                )}

                {available && authState === "unknown" && auth?.error ? (
                  <p className="text-body-sm text-muted-foreground">
                    Status check: <code className="inline-code">{auth.error}</code>
                  </p>
                ) : null}
              </div>
            )
          })}

          {primaryProvider ? (
            <p className="text-body-sm text-status-success font-medium">
              {PROVIDER_LABELS[primaryProvider]} is the only detected CLI, so it
              will be used as the default provider.
            </p>
          ) : readyProviders.length > 0 ? (
            <p className="text-body-sm text-status-success font-medium">
              {hasMultipleAvailableProviders
                ? "Multiple providers are available. You can switch between them later in Settings."
                : "A provider is ready to go."}
            </p>
          ) : (
            <div className="rounded-lg border border-status-warning/30 bg-status-warning/5 p-3 space-y-2">
              <p className="ui-meta-text text-muted-foreground">
                You can still continue setup and install or authenticate a CLI later.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Step 2: Open a project ──────────────────────────────── */

function StepOpenProject({
  onProjectAdded,
}: {
  onProjectAdded: (path: string | null) => void
}) {
  const [addedPath, setAddedPath] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const handleAddProject = useCallback(async () => {
    setAdding(true)
    try {
      const result = await window.api.addProject()
      if (result) {
        setAddedPath(result)
        onProjectAdded(result)
      }
    } finally {
      setAdding(false)
    }
  }, [onProjectAdded])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-surface-2">
          <FolderOpen size={20} className="text-foreground" />
        </div>
        <h2 className="text-title-md text-foreground">Open a project</h2>
      </div>
      <p className="text-body-md text-muted-foreground">
        Select a folder to use as your project root. Workflows and skills will be
        stored relative to this directory.
      </p>

      {addedPath ? (
        <div className="flex items-center gap-2 text-body-sm">
          <CheckCircle2 size={16} className="text-status-success shrink-0" />
          <span className="text-foreground truncate">{addedPath}</span>
        </div>
      ) : (
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => void handleAddProject()}
          disabled={adding}
        >
          {adding ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <FolderOpen size={14} />
          )}
          Choose folder
        </Button>
      )}

      <p className="ui-meta-text text-muted-foreground">
        You can add more projects later from the sidebar.
      </p>
    </div>
  )
}

/* ── Step 3: What will you build? (JTBD) ─────────────────── */

const JOB_CARDS: { id: JobChoice; icon: typeof Search; title: string; description: string; mode: string }[] = [
  {
    id: "analyze",
    icon: Search,
    title: "Analyze & review",
    description: "Code review, audits, docs",
    mode: "Plan mode (read-only)",
  },
  {
    id: "generate",
    icon: Pencil,
    title: "Generate & refactor",
    description: "Write code, tests, refactor",
    mode: "Edit mode (can modify)",
  },
  {
    id: "content",
    icon: FileText,
    title: "Content pipelines",
    description: "Blog posts, landing pages",
    mode: "Multi-step generation",
  },
]

function StepPickJob({
  selectedJob,
  onSelect,
}: {
  selectedJob: JobChoice | null
  onSelect: (job: JobChoice) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-surface-2">
          <Bot size={20} className="text-foreground" />
        </div>
        <h2 className="text-title-md text-foreground">What will you build?</h2>
      </div>
      <p className="text-body-md text-muted-foreground">
        Pick your primary use case. This helps us show relevant examples.
      </p>

      <div className="flex flex-col gap-3" role="radiogroup">
        {JOB_CARDS.map((card) => {
          const Icon = card.icon
          const selected = selectedJob === card.id
          return (
            <button
              key={card.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(card.id)}
              className={`flex items-start gap-3 rounded-lg p-3 text-left ui-pressable transition-colors ${
                selected
                  ? "surface-panel border border-primary bg-primary/5"
                  : "surface-panel border border-transparent hover:border-muted-foreground/20"
              }`}
            >
              <div className={`flex items-center justify-center w-8 h-8 rounded-md shrink-0 ${
                selected ? "bg-primary/10" : "bg-surface-2"
              }`}>
                <Icon size={16} className={selected ? "text-primary" : "text-muted-foreground"} />
              </div>
              <div className="min-w-0">
                <div className="text-body-sm font-medium text-foreground">{card.title}</div>
                <div className="ui-meta-text text-muted-foreground">{card.description}</div>
                <div className="ui-meta-text text-muted-foreground/60 mt-0.5">{card.mode}</div>
              </div>
            </button>
          )
        })}
      </div>

      <p className="ui-meta-text text-muted-foreground">
        You can always change this later in the toolbar.
      </p>
    </div>
  )
}

/* ── Step 4: Start with the Agent ────────────────────────── */

const EXAMPLE_PROMPTS: Record<JobChoice, string> = {
  analyze: "Review this codebase for security vulnerabilities",
  generate: "Refactor all React class components to hooks",
  content: "Generate a blog post series from research notes",
}

function StepActivateAgent({
  selectedJob,
  onOpenAgent,
  onGoTemplates,
}: {
  selectedJob: JobChoice | null
  onOpenAgent: () => void
  onGoTemplates: () => void
}) {
  const examplePrompt = selectedJob
    ? EXAMPLE_PROMPTS[selectedJob]
    : EXAMPLE_PROMPTS.generate

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-surface-2">
          <Bot size={20} className="text-foreground" />
        </div>
        <h2 className="text-title-md text-foreground">Describe what you need</h2>
      </div>
      <p className="text-body-md text-muted-foreground">
        The fastest way to build a workflow -- open the Agent and describe your
        task. It will find the right skills and set everything up.
      </p>

      <div className="rounded-lg bg-surface-2 p-3 space-y-2">
        <div className="ui-meta-text text-muted-foreground/60 flex items-center gap-1.5">
          Agent <code className="inline-code text-[10px]">&#8984;&#8679;K</code>
        </div>
        <p className="text-body-sm font-mono text-foreground/80">
          {examplePrompt}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="default" size="sm" onClick={onOpenAgent}>
          <Bot size={14} />
          Open the Agent
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onGoTemplates}>
          <LayoutTemplate size={14} />
          Browse templates
        </Button>
      </div>

      <p className="ui-meta-text text-muted-foreground">
        <code className="inline-code text-[10px]">&#8984;Enter</code> to run
        {" "}&middot;{" "}
        <code className="inline-code text-[10px]">&#8984;S</code> to save
      </p>
    </div>
  )
}
