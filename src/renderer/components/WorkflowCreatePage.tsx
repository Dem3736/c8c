import { useEffect, useMemo, useRef, useState } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  chatPanelOpenAtom,
  currentWorkflowAtom,
  mainViewAtom,
  projectsAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  viewModeAtom,
  webSearchBackendAtom,
  workflowCreateContextAtom,
  workflowCreateDraftPromptAtom,
  workflowCreatePendingEntryAtom,
  workflowCreatePendingMessageAtom,
  workflowEntryStateAtom,
  setWorkflowTemplateContextForKeyAtom,
  workflowDirtyAtom,
  workflowSavedSnapshotAtom,
  workflowsAtom,
} from "@/lib/store"
import { Button } from "@/components/ui/button"
import { AutosizeTextarea } from "@/components/ui/autosize-textarea"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PageHeader, PageHero, PageShell, SectionHeading } from "@/components/ui/page-shell"
import {
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import { resolveTemplateWorkflow } from "@/lib/web-search-backend"
import {
  EMPTY_WORKFLOW_CREATE_SCAFFOLD,
  buildWorkflowCreatePrompt,
  countWorkflowCreateScaffoldFields,
  hasWorkflowCreatePromptContent,
  type WorkflowCreatePromptScaffold,
} from "@/lib/workflow-create-prompt"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { projectFolderName } from "@/components/sidebar/projectSidebarUtils"
import { toast } from "sonner"
import {
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderPlus,
  Loader2,
  Sparkles,
} from "lucide-react"
import type { WorkflowTemplate } from "@shared/types"
import { cn } from "@/lib/cn"
import {
  buildTemplateRunContext,
  buildTemplateWorkflowEntryState,
  deriveTemplateCardCopy,
  deriveTemplateExecutionDisciplineLabels,
  deriveTemplateJourneyStageLabel,
} from "@/lib/workflow-entry"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"

const POPULAR_TEMPLATE_LIMIT = 12
const CREATE_SURFACE_MAX_WIDTH = "max-w-[1040px]"

function buildTemplateCustomizationPrompt(template: WorkflowTemplate): string {
  return [
    `Use the existing "${template.name}" workflow as the starting point.`,
    template.how,
    "Adapt it to this project and update only the steps that need to change.",
  ].join(" ")
}

function templateCardCopy(template: WorkflowTemplate): string {
  return deriveTemplateCardCopy(template)
}

function TemplateSuggestionCard({
  template,
  onSelect,
}: {
  template: WorkflowTemplate
  onSelect: (template: WorkflowTemplate) => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="bare"
      onClick={() => onSelect(template)}
      className="ui-interactive-card-subtle min-h-[144px] w-[216px] shrink-0 snap-start !flex-col !items-start !justify-start overflow-hidden rounded-lg surface-panel px-4 py-4 text-left !whitespace-normal md:w-[228px]"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-hairline bg-surface-2/80 text-lg shadow-inset-highlight-subtle">
          <span aria-hidden>{template.emoji}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-3 text-body-md font-medium text-foreground">
            {templateCardCopy(template)}
          </p>
          {(template.pack || template.executionPolicy?.tags?.length) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {template.pack && (
                <Badge variant="outline" size="compact">
                  {template.pack.label}
                </Badge>
              )}
              {template.pack?.entrypoint ? (
                <Badge variant="info" size="compact">
                  Start here
                </Badge>
              ) : null}
            </div>
          )}
        </div>
      </div>
      <p className="mt-auto w-full min-w-0 truncate ui-meta-text text-muted-foreground">{template.name}</p>
    </Button>
  )
}

function ScaffoldField({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="ui-meta-text text-muted-foreground">
        {label}
      </Label>
      <Textarea
        id={id}
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-[88px] resize-y bg-surface-1/90"
      />
    </div>
  )
}

export function WorkflowCreatePage() {
  const [projects, setProjects] = useAtom(projectsAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setWorkflow] = useAtom(currentWorkflowAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [, setViewMode] = useAtom(viewModeAtom)
  const [, setChatPanelOpen] = useAtom(chatPanelOpenAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
  const [workflowDirty] = useAtom(workflowDirtyAtom)
  const [createContext, setCreateContext] = useAtom(workflowCreateContextAtom)
  const [draftPrompt, setDraftPrompt] = useAtom(workflowCreateDraftPromptAtom)
  const [, setPendingCreateEntry] = useAtom(workflowCreatePendingEntryAtom)
  const [, setPendingCreateMessage] = useAtom(workflowCreatePendingMessageAtom)
  const [, setWorkflowEntryState] = useAtom(workflowEntryStateAtom)
  const setWorkflowTemplateContextForKey = useSetAtom(setWorkflowTemplateContextForKeyAtom)
  const [promptHelperOpen, setPromptHelperOpen] = useState(false)
  const [promptScaffold, setPromptScaffold] = useState<WorkflowCreatePromptScaffold>(
    EMPTY_WORKFLOW_CREATE_SCAFFOLD,
  )
  const [popularTemplates, setPopularTemplates] = useState<WorkflowTemplate[]>([])
  const [popularTemplatesFromUsage, setPopularTemplatesFromUsage] = useState(false)
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [openingProject, setOpeningProject] = useState(false)
  const [projectPickerOpen, setProjectPickerOpen] = useState(false)
  const [pendingTemplate, setPendingTemplate] = useState<WorkflowTemplate | null>(null)
  const [templateAction, setTemplateAction] = useState<"create" | "customize" | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const templateRailRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLDivElement | null>(null)
  const promptHelperRef = useRef<HTMLDivElement | null>(null)
  const promptHelperScrollRef = useRef<HTMLDivElement | null>(null)
  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()

  const targetProjectPath = createContext.projectPath

  useEffect(() => {
    if (targetProjectPath && projects.includes(targetProjectPath)) return

    if (selectedProject && projects.includes(selectedProject)) {
      setCreateContext({ projectPath: selectedProject, locked: false })
      return
    }

    if (projects.length > 0) {
      setCreateContext({ projectPath: projects[0], locked: false })
      return
    }

    if (targetProjectPath !== null || createContext.locked) {
      setCreateContext({ projectPath: null, locked: false })
    }
  }, [
    createContext.locked,
    projects,
    selectedProject,
    setCreateContext,
    targetProjectPath,
  ])

  useEffect(() => {
    let cancelled = false
    setLoadingTemplates(true)

    void (async () => {
      try {
        const templates = await window.api.listTemplates()
        let popular: WorkflowTemplate[] = []

        if (targetProjectPath) {
          try {
            popular = await window.api.listPopularProjectTemplates(
              targetProjectPath,
              POPULAR_TEMPLATE_LIMIT,
            )
          } catch (error) {
            const message = String(error)
            if (!message.includes("No handler registered")) {
              toast.error(`Failed to load popular templates: ${message}`)
            }
          }
        }

        if (cancelled) return
        setPopularTemplatesFromUsage(popular.length > 0)
        const seen = new Set(popular.map((template) => template.id))
        const supplemented = templates.filter((template) => !seen.has(template.id))
        setPopularTemplates(
          [...popular, ...supplemented].slice(0, POPULAR_TEMPLATE_LIMIT),
        )
      } catch (error) {
        if (cancelled) return
        setPopularTemplates([])
        setPopularTemplatesFromUsage(false)
        toast.error(`Failed to load templates: ${String(error)}`)
      } finally {
        if (!cancelled) {
          setLoadingTemplates(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [targetProjectPath])

  useEffect(() => {
    textareaRef.current?.style.setProperty("height", "auto")
  }, [draftPrompt])

  useEffect(() => {
    if (!promptHelperOpen) return

    const frame = window.requestAnimationFrame(() => {
      promptHelperRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      })
      promptHelperScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      composerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [promptHelperOpen])

  const targetProjectName = useMemo(
    () => (targetProjectPath ? projectFolderName(targetProjectPath) : null),
    [targetProjectPath],
  )
  const pendingTemplateStageLabel = pendingTemplate ? deriveTemplateJourneyStageLabel(pendingTemplate) : null
  const pendingTemplateDisciplineLabels = pendingTemplate ? deriveTemplateExecutionDisciplineLabels(pendingTemplate) : []
  const scaffoldFieldCount = useMemo(
    () => countWorkflowCreateScaffoldFields(promptScaffold),
    [promptScaffold],
  )
  const canSubmitPrompt = hasWorkflowCreatePromptContent(draftPrompt, promptScaffold)
  const popularTemplatesTitle = useMemo(() => {
    if (targetProjectName && popularTemplatesFromUsage) {
      return `Good starting points for ${targetProjectName}`
    }
    return "Ready-made starting points"
  }, [popularTemplatesFromUsage, targetProjectName])

  const openWorkflowFile = async (
    filePath: string,
    projectPath: string,
    options?: {
      pendingMessage?: string
      pendingEntryRequest?: string
      entryState?: ReturnType<typeof buildTemplateWorkflowEntryState>
      templateContext?: ReturnType<typeof buildTemplateRunContext>
    },
  ) => {
    const loadedWorkflow = await window.api.loadWorkflow(filePath)
    const refreshedWorkflows = await window.api.listProjectWorkflows(projectPath)

    setSelectedProject(projectPath)
    setWorkflows(refreshedWorkflows)
    setSelectedWorkflowPath(filePath)
    setWorkflow(loadedWorkflow)
    setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
    setViewMode("list")
    setChatPanelOpen(Boolean(options?.pendingMessage))
    setPendingCreateMessage((prev) => (
      options?.pendingMessage
        ? { ...prev, [filePath]: options.pendingMessage }
        : prev
    ))
    setPendingCreateEntry((prev) => (
      options?.pendingEntryRequest
        ? { ...prev, [filePath]: options.pendingEntryRequest }
        : prev
    ))
    setWorkflowEntryState(options?.entryState ?? null)
    setWorkflowTemplateContextForKey({
      key: toWorkflowExecutionKey(filePath),
      context: options?.templateContext ?? null,
    })
    setDraftPrompt("")
    setPromptScaffold(EMPTY_WORKFLOW_CREATE_SCAFFOLD)
    setPromptHelperOpen(false)
    setMainView("thread")
    return loadedWorkflow
  }

  const handleOpenProject = async () => {
    if (openingProject) return
    setOpeningProject(true)
    try {
      const projectPath = await window.api.addProject()
      if (!projectPath) return
      setProjects((prev) => (prev.includes(projectPath) ? prev : [...prev, projectPath]))
      setSelectedProject(projectPath)
      setCreateContext({ projectPath, locked: false })
    } catch (error) {
      toast.error(`Failed to add project: ${String(error)}`)
    } finally {
      setOpeningProject(false)
    }
  }

  const handleTemplateSelect = (template: WorkflowTemplate) => {
    setPendingTemplate(template)
    setSubmitError(null)
  }

  const handleCreateFromTemplate = async (template: WorkflowTemplate) => {
    if (!targetProjectPath || templateAction) return
    if (!(await confirmDiscard("create a workflow from a template", workflowDirty))) {
      return
    }

    setTemplateAction("create")
    try {
      const nextWorkflow = resolveTemplateWorkflow(template, webSearchBackend)
      const filePath = await window.api.createWorkflow(targetProjectPath, template.name, nextWorkflow)
      await window.api.recordProjectTemplateUsage(targetProjectPath, template.id).catch(() => undefined)
      const loadedWorkflow = await openWorkflowFile(filePath, targetProjectPath, {
        entryState: buildTemplateWorkflowEntryState({
          template: {
            ...template,
            workflow: nextWorkflow,
          },
          workflowPath: filePath,
        }),
        templateContext: buildTemplateRunContext({
          template: {
            ...template,
            workflow: nextWorkflow,
          },
          workflowPath: filePath,
        }),
      })
      setPendingTemplate(null)
      toast.success(`"${loadedWorkflow.name || template.name}" is ready in ${targetProjectName || "your project"}`)
    } catch (error) {
      toast.error(`Failed to create workflow: ${String(error)}`)
    } finally {
      setTemplateAction(null)
    }
  }

  const handleCustomizeTemplate = async (template: WorkflowTemplate) => {
    if (!targetProjectPath || templateAction) return
    if (!(await confirmDiscard("customize a template with agent", workflowDirty))) {
      return
    }

    setTemplateAction("customize")
    try {
      const nextWorkflow = resolveTemplateWorkflow(template, webSearchBackend)
      const filePath = await window.api.createWorkflow(targetProjectPath, template.name, nextWorkflow)
      await window.api.recordProjectTemplateUsage(targetProjectPath, template.id).catch(() => undefined)
      await openWorkflowFile(filePath, targetProjectPath, {
        pendingMessage: buildTemplateCustomizationPrompt(template),
        entryState: buildTemplateWorkflowEntryState({
          template: {
            ...template,
            workflow: nextWorkflow,
          },
          workflowPath: filePath,
          source: "template_customize",
        }),
        templateContext: buildTemplateRunContext({
          template: {
            ...template,
            workflow: nextWorkflow,
          },
          workflowPath: filePath,
          source: "template_customize",
        }),
      })
      setPendingTemplate(null)
      toast.success(`"${template.name}" is open for agent refinement`)
    } catch (error) {
      toast.error(`Failed to customize workflow: ${String(error)}`)
    } finally {
      setTemplateAction(null)
    }
  }

  const handleSend = async () => {
    const message = buildWorkflowCreatePrompt(draftPrompt, promptScaffold)
    if (!message || submitting) return
    if (!targetProjectPath) {
      setSubmitError("Open or select a project before starting a workflow.")
      return
    }

    if (!(await confirmDiscard("start a new workflow", workflowDirty))) {
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      const draftWorkflow = createEmptyWorkflow()
      const filePath = await window.api.createWorkflow(targetProjectPath, "new-workflow", draftWorkflow)
      await openWorkflowFile(filePath, targetProjectPath, {
        pendingMessage: message,
        pendingEntryRequest: message,
      })
    } catch (error) {
      setSubmitError(
        String(error).replace(
          /^Error: Error invoking remote method '[^']+': Error: /,
          "",
        ),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
    }
  }

  const scrollTemplates = (direction: "left" | "right") => {
    const rail = templateRailRef.current
    if (!rail) return
    const amount = Math.max(rail.clientWidth * 0.72, 260)
    rail.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    })
  }

  return (
    <PageShell className="flex min-h-full flex-col space-y-8">
      <PageHeader title="Create with Agent" subtitle="Describe the job you need done and the agent will prepare a runnable flow." />

      <div className={cn("mx-auto flex w-full flex-1 flex-col gap-8 pb-8", CREATE_SURFACE_MAX_WIDTH)}>
        <PageHero
          icon={<Sparkles size={36} />}
          title="What should this flow do for you?"
          className="pt-2"
        >
          <DropdownMenu open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="auto"
                className="mx-auto inline-flex h-auto max-w-[420px] items-center justify-center gap-2 rounded-md px-2 py-1 text-title-lg font-medium text-muted-foreground hover:bg-transparent hover:text-foreground hover:border-transparent"
                aria-label="Select project"
              >
                <span className="truncate">{targetProjectName || "Select project"}</span>
                <ChevronRight
                  size={20}
                  className={cn(
                    "shrink-0 transition-transform ui-motion-fast",
                    projectPickerOpen && "rotate-90",
                  )}
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="center"
              sideOffset={12}
              className="w-[min(32rem,calc(100vw-2rem))] rounded-lg p-2"
            >
              <DropdownMenuLabel className="px-3 pt-2 pb-3 text-body-md font-medium text-muted-foreground">
                Select your project
              </DropdownMenuLabel>
              {projects.map((projectPath) => {
                const isActive = projectPath === targetProjectPath
                return (
                  <DropdownMenuItem
                    key={projectPath}
                    onSelect={() => setCreateContext({ projectPath, locked: false })}
                    className="h-auto items-center gap-3 rounded-md px-3 py-3 text-body-md text-foreground"
                  >
                    <Folder size={18} className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {projectFolderName(projectPath)}
                    </span>
                    {isActive ? <Check size={18} className="shrink-0 text-foreground" /> : null}
                  </DropdownMenuItem>
                )
              })}
              <DropdownMenuSeparator className="my-2" />
              <DropdownMenuItem
                onSelect={() => void handleOpenProject()}
                disabled={openingProject}
                className="h-auto items-center gap-3 rounded-md px-3 py-3 text-body-md text-foreground"
              >
                {openingProject ? (
                  <Loader2 size={18} className="shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <FolderPlus size={18} className="shrink-0 text-muted-foreground" />
                )}
                <span className="font-medium">Add new project</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </PageHero>

        {popularTemplates.length > 0 && (
          <section aria-label={popularTemplatesTitle} className="w-full">
            <SectionHeading
              title={popularTemplatesTitle}
              meta={(
                <div className="control-cluster flex items-center gap-1 rounded-lg p-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => scrollTemplates("left")}
                    className="text-muted-foreground"
                    aria-label="Scroll templates left"
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => scrollTemplates("right")}
                    className="text-muted-foreground"
                    aria-label="Scroll templates right"
                  >
                    <ChevronRight size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMainView("templates")}
                    className="rounded-md text-muted-foreground"
                  >
                    Explore all
                  </Button>
                </div>
              )}
            />

            {loadingTemplates ? (
              <div className="mt-4 flex gap-3 overflow-hidden pb-3 pt-1">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={`template-skeleton-${index}`}
                    className="h-[144px] w-[216px] shrink-0 animate-pulse rounded-lg surface-panel px-4 py-4 md:w-[228px]"
                  />
                ))}
              </div>
            ) : (
              <div
                ref={templateRailRef}
                aria-label={popularTemplatesTitle}
                className="ui-scroll-region ui-scrollbar-hidden mt-4 flex items-stretch snap-x snap-mandatory gap-3 overflow-x-auto pb-3 pt-1"
              >
                {popularTemplates.map((template) => (
                  <TemplateSuggestionCard
                    key={template.id}
                    template={template}
                    onSelect={handleTemplateSelect}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        <div ref={composerRef} className="mx-auto w-full">
          <div className="rounded-lg surface-elevated transition-[border-color,box-shadow] ui-motion-fast focus-within:border-ring/60 focus-within:ring-[3px] focus-within:ring-ring/20">
            <div className="relative">
              <AutosizeTextarea
                ref={textareaRef}
                aria-label="Workflow creation prompt"
                value={draftPrompt}
                onChange={(event) => setDraftPrompt(event.target.value)}
                onKeyDown={handleTextareaKeyDown}
                placeholder="Describe the job, the input you will give it, and the result you want back..."
                rows={1}
                maxHeight={240}
                className={cn(
                  "min-h-28 w-full resize-none border-0 bg-transparent px-5 py-4 pr-16 shadow-none hover:border-transparent hover:bg-transparent",
                  "text-body-md text-foreground placeholder:text-muted-foreground/80 focus-visible:border-transparent focus-visible:ring-transparent",
                )}
              />
              <div className="absolute bottom-3 right-3">
                <Button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!canSubmitPrompt || submitting}
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-control-lg w-control-lg rounded-full ui-transition-colors ui-motion-fast",
                    canSubmitPrompt && !submitting
                      ? "bg-foreground text-background hover:bg-foreground/90"
                      : "bg-surface-3 text-muted-foreground/70",
                  )}
                >
                  {submitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ArrowUp size={16} />
                  )}
                </Button>
              </div>
            </div>
            <div
              data-open={promptHelperOpen ? "true" : "false"}
              className="ui-collapsible"
            >
              <div className="ui-collapsible-inner">
                <div className="px-4 pt-3">
                  <div ref={promptHelperRef} className="surface-inset-card overflow-hidden">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 px-3 pb-0 pt-3">
                        <p className="section-kicker">Prompt helper</p>
                        <p className="ui-meta-text text-muted-foreground">
                          Optional details that sharpen the request before the agent builds the flow.
                        </p>
                      </div>
                      {scaffoldFieldCount > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="mr-3 mt-3 shrink-0 text-muted-foreground"
                          onClick={() => setPromptScaffold(EMPTY_WORKFLOW_CREATE_SCAFFOLD)}
                        >
                          Clear fields
                        </Button>
                      ) : null}
                    </div>

                    <div
                      ref={promptHelperScrollRef}
                      className="ui-scroll-region max-h-[min(56vh,36rem)] overflow-y-auto border-t border-hairline/70 px-3 py-3"
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <ScaffoldField
                          id="workflow-helper-goal"
                          label="Goal"
                          placeholder="What should this workflow accomplish?"
                          value={promptScaffold.goal}
                          onChange={(value) => setPromptScaffold((prev) => ({ ...prev, goal: value }))}
                        />
                        <ScaffoldField
                          id="workflow-helper-input"
                          label="Input"
                          placeholder="What input, URL, file, or context will it receive?"
                          value={promptScaffold.input}
                          onChange={(value) => setPromptScaffold((prev) => ({ ...prev, input: value }))}
                        />
                        <ScaffoldField
                          id="workflow-helper-constraints"
                          label="Constraints"
                          placeholder="Limits, formatting rules, providers, budgets, or safety constraints"
                          value={promptScaffold.constraints}
                          onChange={(value) => setPromptScaffold((prev) => ({ ...prev, constraints: value }))}
                        />
                        <ScaffoldField
                          id="workflow-helper-success"
                          label="Success criteria"
                          placeholder="How should the workflow evaluate that it did the job well?"
                          value={promptScaffold.successCriteria}
                          onChange={(value) => setPromptScaffold((prev) => ({ ...prev, successCriteria: value }))}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-hairline/70 px-4 py-3">
              <div className="control-cluster control-cluster-compact flex flex-wrap items-center justify-between gap-2 rounded-lg">
                <Button
                  type="button"
                  variant={promptHelperOpen ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={promptHelperOpen}
                  className="text-muted-foreground"
                  onClick={() => setPromptHelperOpen((prev) => !prev)}
                >
                  <Sparkles size={14} />
                  {promptHelperOpen ? "Hide prompt helper" : "Add prompt helper"}
                </Button>
                <div className="flex flex-wrap items-center gap-2">
                  {scaffoldFieldCount > 0 ? (
                    <Badge variant="secondary" size="pill">
                      {scaffoldFieldCount} field{scaffoldFieldCount === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                  <p className="ui-meta-text text-muted-foreground">
                    Enter to start · Shift+Enter for a new line
                  </p>
                </div>
              </div>
            </div>
          </div>

          {submitError && (
            <div className="mt-4 rounded-lg ui-alert-danger text-status-danger">
              {submitError}
            </div>
          )}
        </div>
      </div>

      {unsavedChangesDialog}
      <Dialog open={pendingTemplate !== null} onOpenChange={(open) => !open && setPendingTemplate(null)}>
        <CanvasDialogContent showCloseButton={false}>
          <CanvasDialogHeader>
            <DialogTitle>Use this starting point</DialogTitle>
            <DialogDescription>
              &ldquo;{pendingTemplate?.name}&rdquo; is ready to use. Start with it directly, or open it with the agent and tailor it first.
            </DialogDescription>
          </CanvasDialogHeader>
          <CanvasDialogBody className="space-y-3">
            {targetProjectPath ? (
              <div className="rounded-lg border border-hairline bg-surface-2/60 px-3 py-3">
                <p className="ui-meta-text text-muted-foreground">Selected project</p>
                <p className="mt-1 text-body-md font-medium text-foreground">{targetProjectName}</p>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  It will open here ready to run or refine.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-hairline bg-surface-2/60 px-3 py-3 text-body-sm text-muted-foreground">
                Select or add a project first so this starting point has somewhere to open.
              </div>
            )}
            {(pendingTemplate?.pack || pendingTemplateDisciplineLabels.length > 0) && (
              <div className="rounded-lg border border-hairline bg-surface-2/40 px-3 py-3 space-y-2">
                {pendingTemplate?.pack && (
                  <div>
                    <p className="ui-meta-text text-muted-foreground">Factory pack</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="outline" size="compact">{pendingTemplate.pack.label}</Badge>
                      {pendingTemplateStageLabel ? <Badge variant="secondary" size="compact">{pendingTemplateStageLabel}</Badge> : null}
                      {pendingTemplate.pack.entrypoint ? <Badge variant="info" size="compact">Start here</Badge> : null}
                    </div>
                  </div>
                )}
                {pendingTemplateDisciplineLabels.length > 0 && (
                  <div>
                    <p className="ui-meta-text text-muted-foreground">Execution discipline</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {pendingTemplateDisciplineLabels.map((label) => (
                        <Badge key={`pending-template-discipline-${label}`} variant="info" size="compact">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CanvasDialogBody>
          <CanvasDialogFooter>
            {!targetProjectPath ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleOpenProject()}
                disabled={openingProject}
              >
                {openingProject ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}
                Add project
              </Button>
            ) : null}
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              variant="outline"
              size="sm"
              disabled={!pendingTemplate || !targetProjectPath || templateAction !== null}
              isLoading={templateAction === "customize"}
              loadingText="Opening with agent"
              onClick={() => pendingTemplate && void handleCustomizeTemplate(pendingTemplate)}
            >
              Customize with agent
            </Button>
            <Button
              size="sm"
              disabled={!pendingTemplate || !targetProjectPath || templateAction !== null}
              isLoading={templateAction === "create"}
              loadingText="Creating workflow"
              onClick={() => pendingTemplate && void handleCreateFromTemplate(pendingTemplate)}
            >
              Use now
            </Button>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>
    </PageShell>
  )
}
