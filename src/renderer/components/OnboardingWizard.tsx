import { useCallback, useEffect, useState } from "react"
import { useAtom } from "jotai"
import { Button } from "@/components/ui/button"
import {
  chatPanelOpenAtom,
  firstLaunchAtom,
  mainViewAtom,
  selectedProjectAtom,
} from "@/lib/store"
import type { ClaudeCodeSubscriptionStatus } from "@shared/types"
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
