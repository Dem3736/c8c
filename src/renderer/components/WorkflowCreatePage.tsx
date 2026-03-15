import { useEffect, useMemo, useRef, useState } from "react"
import { useAtom } from "jotai"
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
  workflowCreatePendingMessageAtom,
  workflowDirtyAtom,
  workflowSavedSnapshotAtom,
  workflowsAtom,
} from "@/lib/store"
import { Button } from "@/components/ui/button"
import { AutosizeTextarea } from "@/components/ui/autosize-textarea"
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
import { getTemplateSourceLabel } from "@/lib/template-source"
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
  return template.headline?.trim() || `Start from the ${template.name} workflow pattern.`
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
      className="ui-interactive-card-subtle h-[120px] w-[216px] shrink-0 snap-start !flex-col !items-start !justify-start rounded-lg surface-panel px-4 py-4 text-left !whitespace-normal md:w-[228px]"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-hairline bg-surface-2/80 text-lg shadow-inset-highlight-subtle">
          <span aria-hidden>{template.emoji}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-3 text-body-md font-medium text-foreground">
            {templateCardCopy(template)}
          </p>
          <p className="mt-1 ui-meta-text text-muted-foreground">{getTemplateSourceLabel(template)}</p>
        </div>
      </div>
      <p className="mt-auto ui-meta-text truncate text-muted-foreground">{template.name}</p>
    </Button>
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
  const [, setPendingCreateMessage] = useAtom(workflowCreatePendingMessageAtom)
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

  const targetProjectName = useMemo(
    () => (targetProjectPath ? projectFolderName(targetProjectPath) : null),
    [targetProjectPath],
  )
  const popularTemplatesTitle = useMemo(() => {
    if (targetProjectName && popularTemplatesFromUsage) {
      return `Popular in ${targetProjectName}`
    }
    return "Popular templates"
  }, [popularTemplatesFromUsage, targetProjectName])

  const openWorkflowFile = async (
    filePath: string,
    projectPath: string,
    options?: {
      pendingMessage?: string
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
    setPendingCreateMessage(
      options?.pendingMessage
        ? { workflowPath: filePath, message: options.pendingMessage }
        : null,
    )
    setDraftPrompt("")
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
      const loadedWorkflow = await openWorkflowFile(filePath, targetProjectPath)
      setPendingTemplate(null)
      toast.success(`Created "${loadedWorkflow.name || template.name}" from template`)
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
      })
      setPendingTemplate(null)
      toast.success(`Opened "${template.name}" with agent customization`)
    } catch (error) {
      toast.error(`Failed to customize workflow: ${String(error)}`)
    } finally {
      setTemplateAction(null)
    }
  }

  const handleSend = async () => {
    const message = draftPrompt.trim()
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
      await openWorkflowFile(filePath, targetProjectPath, { pendingMessage: message })
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
      <PageHeader title="New workflow" />

      <div className={cn("mx-auto flex w-full flex-1 flex-col gap-8 pb-8", CREATE_SURFACE_MAX_WIDTH)}>
        <PageHero
          icon={<Sparkles size={36} />}
          title="Let's build workflow for"
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
              <div className="mt-4 flex gap-3 overflow-hidden pb-1">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={`template-skeleton-${index}`}
                    className="h-[120px] w-[216px] shrink-0 animate-pulse rounded-lg surface-panel px-4 py-4 md:w-[228px]"
                  />
                ))}
              </div>
            ) : (
              <div
                ref={templateRailRef}
                aria-label={popularTemplatesTitle}
                className="ui-scroll-region ui-scrollbar-hidden mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1"
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

        <div className="mx-auto mt-auto w-full">
          <div className="rounded-lg surface-elevated transition-[border-color,box-shadow] ui-motion-fast focus-within:border-ring/60 focus-within:ring-[3px] focus-within:ring-ring/20">
            <div className="relative">
              <AutosizeTextarea
                ref={textareaRef}
                aria-label="Workflow creation prompt"
                value={draftPrompt}
                onChange={(event) => setDraftPrompt(event.target.value)}
                onKeyDown={handleTextareaKeyDown}
                placeholder="Describe what to build..."
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
                  disabled={!draftPrompt.trim() || submitting}
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-control-lg w-control-lg rounded-full ui-transition-colors ui-motion-fast",
                    draftPrompt.trim() && !submitting
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
            <div className="flex items-center justify-end gap-3 border-t border-hairline/70 px-4 py-3">
              <p className="ui-meta-text text-muted-foreground">
                Enter send · Shift+Enter newline
              </p>
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
            <DialogTitle>Use template</DialogTitle>
            <DialogDescription>
              &ldquo;{pendingTemplate?.name}&rdquo; is ready to use. Create it directly, or open it with the agent and customize it for this project.
            </DialogDescription>
          </CanvasDialogHeader>
          <CanvasDialogBody className="space-y-3">
            {targetProjectPath ? (
              <div className="rounded-lg border border-hairline bg-surface-2/60 px-3 py-3">
                <p className="ui-meta-text text-muted-foreground">Project</p>
                <p className="mt-1 text-body-md font-medium text-foreground">{targetProjectName}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-hairline bg-surface-2/60 px-3 py-3 text-body-sm text-muted-foreground">
                Select or add a project first. The template will be created as a workflow file in that project.
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
              Create in project
            </Button>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>
    </PageShell>
  )
}
