import { useCallback, useEffect, useState } from "react"
import { useAtom } from "jotai"
import { Button } from "@/components/ui/button"
import { firstLaunchAtom, mainViewAtom, selectedProjectAtom } from "@/lib/store"
import type { ClaudeCodeSubscriptionStatus } from "@shared/types"
import {
  CheckCircle2,
  XCircle,
  Loader2,
  FolderOpen,
  ArrowRight,
  ArrowLeft,
  LayoutTemplate,
  Workflow,
  Terminal,
} from "lucide-react"

const TOTAL_STEPS = 4

export function OnboardingWizard() {
  const [step, setStep] = useState(1)
  const [, setFirstLaunch] = useAtom(firstLaunchAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [, setSelectedProject] = useAtom(selectedProjectAtom)

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
            {step === 1 && <StepWhatIsC8c />}
            {step === 2 && <StepCheckCli />}
            {step === 3 && <StepOpenProject onProjectAdded={setSelectedProject} />}
            {step === 4 && <StepCreateWorkflow onFinish={skip} onGoTemplates={() => {
              setFirstLaunch(false)
              setMainView("templates")
            }} />}
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

/* ── Step 1: What is c8c ─────────────────────────────────── */

function StepWhatIsC8c() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-surface-2">
          <Workflow size={20} className="text-foreground" />
        </div>
        <h2 className="text-title-md text-foreground">Welcome to c8c</h2>
      </div>
      <p className="text-body-md text-muted-foreground leading-relaxed">
        c8c (cybernetic) is a visual workflow builder for the Claude CLI.
        Like Apple Shortcuts, but for Claude -- give input, pick a chain of
        skills, and get processed output.
      </p>
      <ul className="space-y-2 text-body-sm text-muted-foreground">
        <li className="flex items-start gap-2">
          <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-foreground/40 shrink-0" />
          Build directed graphs of skill nodes that execute via the Claude CLI
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-foreground/40 shrink-0" />
          Use evaluators, splitters, and approval gates to control flow
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-foreground/40 shrink-0" />
          Start from templates or build your own workflows from scratch
        </li>
      </ul>
    </div>
  )
}

/* ── Step 2: Check CLI ───────────────────────────────────── */

function StepCheckCli() {
  const [status, setStatus] = useState<ClaudeCodeSubscriptionStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api
      .getClaudeCodeSubscriptionStatus()
      .then((s) => {
        if (!cancelled) setStatus(s)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const cliInstalled = status?.cliInstalled ?? false
  const loggedIn = status?.loggedIn ?? false
  const ready = cliInstalled && loggedIn

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-surface-2">
          <Terminal size={20} className="text-foreground" />
        </div>
        <h2 className="text-title-md text-foreground">Check CLI</h2>
      </div>
      <p className="text-body-md text-muted-foreground">
        c8c requires the Claude Code CLI to execute workflows.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          Checking CLI status...
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-body-sm">
            {cliInstalled ? (
              <CheckCircle2 size={16} className="text-status-success shrink-0" />
            ) : (
              <XCircle size={16} className="text-status-danger shrink-0" />
            )}
            <span className={cliInstalled ? "text-foreground" : "text-status-danger"}>
              Claude CLI {cliInstalled ? "is installed" : "not found"}
            </span>
          </div>

          <div className="flex items-center gap-2 text-body-sm">
            {loggedIn ? (
              <CheckCircle2 size={16} className="text-status-success shrink-0" />
            ) : (
              <XCircle size={16} className="text-status-danger shrink-0" />
            )}
            <span className={loggedIn ? "text-foreground" : "text-status-danger"}>
              {loggedIn ? "Logged in" : "Not logged in"}
            </span>
          </div>

          {ready ? (
            <p className="text-body-sm text-status-success font-medium">
              All set -- the CLI is ready to go.
            </p>
          ) : (
            <div className="rounded-lg border border-status-warning/30 bg-status-warning/5 p-3 space-y-2">
              {!cliInstalled && (
                <p className="text-body-sm text-muted-foreground">
                  Install the CLI:{" "}
                  <code className="inline-code">npm install -g @anthropic-ai/claude-code</code>
                </p>
              )}
              {cliInstalled && !loggedIn && (
                <p className="text-body-sm text-muted-foreground">
                  Authenticate:{" "}
                  <code className="inline-code">claude login</code>
                </p>
              )}
              <p className="ui-meta-text text-muted-foreground">
                You can still continue setup and install later.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Step 3: Open a project ──────────────────────────────── */

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

/* ── Step 4: Create your first workflow ──────────────────── */

function StepCreateWorkflow({
  onFinish,
  onGoTemplates,
}: {
  onFinish: () => void
  onGoTemplates: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-surface-2">
          <LayoutTemplate size={20} className="text-foreground" />
        </div>
        <h2 className="text-title-md text-foreground">Create your first workflow</h2>
      </div>
      <p className="text-body-md text-muted-foreground">
        Start from a pre-built template to see how workflows are structured, or
        jump straight to the editor and build from scratch.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="default" size="sm" onClick={onGoTemplates}>
          <LayoutTemplate size={14} />
          Browse templates
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onFinish}>
          Start from scratch
        </Button>
      </div>
    </div>
  )
}
