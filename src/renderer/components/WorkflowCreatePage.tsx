import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  chatPanelOpenAtom,
  currentWorkflowAtom,
  inputAttachmentsAtom,
  inputValueAtom,
  mainViewAtom,
  projectsAtom,
  selectedResultModeIdAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  templateLibraryContextAtom,
  viewModeAtom,
  webSearchBackendAtom,
  workflowCreateContextAtom,
  workflowCreateDraftPromptAtom,
  workflowCreateModeConfigsAtom,
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
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PageHeader, PageShell, SectionHeading } from "@/components/ui/page-shell"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  FilePlus2,
  Folder,
  FolderPlus,
  Loader2,
  Sparkles,
} from "lucide-react"
import type { InputAttachment, ResultModeId, WorkflowTemplate } from "@shared/types"
import { cn } from "@/lib/cn"
import { STAGE_META } from "@/lib/template-stages"
import {
  buildTemplateRunContext,
  buildTemplateWorkflowEntryState,
  deriveTemplateCardCopy,
  deriveTemplateExecutionDisciplineLabels,
} from "@/lib/workflow-entry"
import {
  buildResultModeSeedInput,
  countResultModeConfigFields,
  getResultModeConfigFields,
  normalizeResultModeConfig,
  type ResultModeConfigField,
} from "@/lib/result-mode-config"
import {
  getResultMode,
  prioritizeTemplatesForResultMode,
  RESULT_MODES,
} from "@/lib/result-modes"
import { getWorkflowTemplateDisplayName } from "@/lib/template-display"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import { useBlankWorkflowCreation } from "@/hooks/useBlankWorkflowCreation"

const POPULAR_TEMPLATE_LIMIT = 12
const CREATE_SURFACE_MAX_WIDTH = "max-w-5xl"

function buildTemplateCustomizationPrompt(template: WorkflowTemplate): string {
  return [
    `Use the existing "${getWorkflowTemplateDisplayName(template)}" workflow as the base workflow.`,
    template.how,
    "Adapt it to this project and update only the steps that need to change.",
  ].join(" ")
}

function templateCardCopy(template: WorkflowTemplate): string {
  return deriveTemplateCardCopy(template)
}

function normalizeTemplateForWorkflowUse(template: WorkflowTemplate): WorkflowTemplate {
  const name = getWorkflowTemplateDisplayName(template)
  if (name === template.name) return template
  return { ...template, name }
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
      className="ui-interactive-card-subtle min-h-36 w-56 shrink-0 snap-start !flex-col !items-start !justify-start overflow-hidden rounded-lg surface-panel px-4 py-4 text-left !whitespace-normal md:w-56"
    >
      <div className="flex w-full items-start gap-3">
        <div className="surface-inset-card flex h-9 w-9 shrink-0 items-center justify-center p-0 text-lg">
          <span aria-hidden>{template.emoji}</span>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="ui-body-text-medium truncate text-foreground">
            {getWorkflowTemplateDisplayName(template)}
          </p>
          <p className="line-clamp-3 text-body-sm text-muted-foreground">
            {template.headline || templateCardCopy(template)}
          </p>
        </div>
      </div>
      <p className="mt-auto ui-meta-text text-muted-foreground">{STAGE_META[template.stage].shortLabel}</p>
    </Button>
  )
}

function PendingTemplateDetails({
  categoryLabel,
  executionSummary,
}: {
  categoryLabel: string | null
  executionSummary: string | null
}) {
  if (!categoryLabel && !executionSummary) return null

  return (
    <div className="rounded-lg surface-inset-card px-3 py-3 space-y-3">
      {categoryLabel ? (
        <div>
          <p className="ui-meta-text text-muted-foreground">Category</p>
          <p className="mt-1 text-body-sm text-foreground">{categoryLabel}</p>
        </div>
      ) : null}
      {executionSummary ? (
        <div>
          <p className="ui-meta-text text-muted-foreground">Working style</p>
          <p className="mt-1 text-body-sm text-foreground">{executionSummary}</p>
        </div>
      ) : null}
    </div>
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
        className="min-h-24 resize-y"
      />
    </div>
  )
}

function ModeConfigField({
  field,
  value,
  onChange,
}: {
  field: ResultModeConfigField
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`mode-config-${field.id}`} className="ui-meta-text text-muted-foreground">
        {field.label}
      </Label>
      {field.type === "textarea" ? (
        <Textarea
          id={`mode-config-${field.id}`}
          rows={3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className="min-h-24 resize-y"
        />
      ) : (
        <Input
          id={`mode-config-${field.id}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          />
      )}
      {field.helpText ? (
        <p className="ui-meta-text text-muted-foreground">{field.helpText}</p>
      ) : null}
    </div>
  )
}

export function WorkflowCreatePage() {
  const [projects, setProjects] = useAtom(projectsAtom)
  const [, setInputAttachments] = useAtom(inputAttachmentsAtom)
  const [, setInputValue] = useAtom(inputValueAtom)
  const [selectedResultModeId, setSelectedResultModeId] = useAtom(selectedResultModeIdAtom)
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
  const [modeConfigs, setModeConfigs] = useAtom(workflowCreateModeConfigsAtom)
  const [, setPendingCreateEntry] = useAtom(workflowCreatePendingEntryAtom)
  const [, setPendingCreateMessage] = useAtom(workflowCreatePendingMessageAtom)
  const [, setWorkflowEntryState] = useAtom(workflowEntryStateAtom)
  const setWorkflowTemplateContextForKey = useSetAtom(setWorkflowTemplateContextForKeyAtom)
  const setTemplateLibraryContext = useSetAtom(templateLibraryContextAtom)
  const [promptHelperOpen, setPromptHelperOpen] = useState(false)
  const [promptScaffold, setPromptScaffold] = useState<WorkflowCreatePromptScaffold>(
    EMPTY_WORKFLOW_CREATE_SCAFFOLD,
  )
  const [popularTemplates, setPopularTemplates] = useState<WorkflowTemplate[]>([])
  const [availableTemplates, setAvailableTemplates] = useState<WorkflowTemplate[]>([])
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
  const { createBlankWorkflow, creatingBlankWorkflow } = useBlankWorkflowCreation({ confirmDiscard })

  const targetProjectPath = createContext.projectPath

  useEffect(() => {
    if (
      !createContext.locked
      && selectedProject
      && projects.includes(selectedProject)
      && selectedProject !== targetProjectPath
    ) {
      setCreateContext({ projectPath: selectedProject, locked: false })
      return
    }

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
        setAvailableTemplates(templates)
        setPopularTemplatesFromUsage(popular.length > 0)
        const seen = new Set(popular.map((template) => template.id))
        const supplemented = templates.filter((template) => !seen.has(template.id))
        setPopularTemplates(
          [...popular, ...supplemented].slice(0, POPULAR_TEMPLATE_LIMIT),
        )
      } catch (error) {
        if (cancelled) return
        setAvailableTemplates([])
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

  const openTemplateLibrary = () => {
    setTemplateLibraryContext({
      projectPath: targetProjectPath,
      createOnly: Boolean(targetProjectPath),
    })
    setMainView("templates")
  }
  const selectedResultMode = useMemo(
    () => getResultMode(selectedResultModeId),
    [selectedResultModeId],
  )
  const selectedModeConfig = useMemo(
    () => normalizeResultModeConfig(selectedResultModeId, modeConfigs[selectedResultModeId]),
    [modeConfigs, selectedResultModeId],
  )
  const selectedModeConfigFields = useMemo(
    () => getResultModeConfigFields(selectedResultModeId),
    [selectedResultModeId],
  )
  const selectedModeConfigFieldCount = useMemo(
    () => countResultModeConfigFields(selectedResultModeId, selectedModeConfig),
    [selectedModeConfig, selectedResultModeId],
  )
  const pendingTemplateDisciplineLabels = pendingTemplate ? deriveTemplateExecutionDisciplineLabels(pendingTemplate) : []
  const pendingTemplateCategoryLabel = pendingTemplate ? STAGE_META[pendingTemplate.stage].label : null
  const pendingTemplateExecutionSummary = pendingTemplate
    ? pendingTemplate.executionPolicy?.summary?.trim()
      || (pendingTemplateDisciplineLabels.length > 0 ? pendingTemplateDisciplineLabels.join(", ") : null)
    : null
  const scaffoldFieldCount = useMemo(
    () => countWorkflowCreateScaffoldFields(promptScaffold),
    [promptScaffold],
  )
  const optionalDetailCount = selectedModeConfigFieldCount + scaffoldFieldCount
  const canSubmitPrompt = hasWorkflowCreatePromptContent(draftPrompt, promptScaffold)
    || selectedModeConfigFieldCount > 0
  const visiblePopularTemplates = useMemo(() => {
    const modeTemplates = prioritizeTemplatesForResultMode(popularTemplates, selectedResultModeId)
    return (modeTemplates.length > 0 ? modeTemplates : popularTemplates).slice(0, POPULAR_TEMPLATE_LIMIT)
  }, [popularTemplates, selectedResultModeId])
  const popularTemplatesTitle = useMemo(() => {
    const baseLabel = `${selectedResultMode.label} starting points`
    if (targetProjectName && popularTemplatesFromUsage) {
      return `${baseLabel} for ${targetProjectName}`
    }
    return baseLabel
  }, [popularTemplatesFromUsage, selectedResultMode.label, targetProjectName])

  const openWorkflowFile = async (
    filePath: string,
    projectPath: string,
    options?: {
      pendingMessage?: string
      pendingEntryRequest?: string
      entryState?: ReturnType<typeof buildTemplateWorkflowEntryState>
      templateContext?: ReturnType<typeof buildTemplateRunContext>
      initialInputValue?: string
      initialAttachments?: InputAttachment[]
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
    if (typeof options?.initialInputValue === "string") {
      setInputValue(options.initialInputValue)
    }
    if (Array.isArray(options?.initialAttachments)) {
      setInputAttachments(options.initialAttachments)
    }
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

  const handleModeConfigChange = (fieldId: string, value: string) => {
    setModeConfigs((previous) => ({
      ...previous,
      [selectedResultModeId]: {
        ...(previous[selectedResultModeId] || {}),
        [fieldId]: value,
      },
    }))
  }

  const clearModeConfig = () => {
    setModeConfigs((previous) => ({
      ...previous,
      [selectedResultModeId]: normalizeResultModeConfig(selectedResultModeId),
    }))
  }

  const clearOptionalDetails = () => {
    clearModeConfig()
    setPromptScaffold(EMPTY_WORKFLOW_CREATE_SCAFFOLD)
  }

  const handleCreateFromTemplate = async (template: WorkflowTemplate) => {
    if (!targetProjectPath || templateAction) return
    if (!(await confirmDiscard("create a workflow from a template", workflowDirty))) {
      return
    }

    setTemplateAction("create")
    try {
      const templateForWorkflowUse = normalizeTemplateForWorkflowUse(template)
      const nextWorkflow = resolveTemplateWorkflow(templateForWorkflowUse, webSearchBackend)
      const filePath = await window.api.createWorkflow(targetProjectPath, templateForWorkflowUse.name, nextWorkflow)
      await window.api.recordProjectTemplateUsage(targetProjectPath, template.id).catch(() => undefined)
      const loadedWorkflow = await openWorkflowFile(filePath, targetProjectPath, {
        entryState: buildTemplateWorkflowEntryState({
          template: {
            ...templateForWorkflowUse,
            workflow: nextWorkflow,
          },
          workflowPath: filePath,
        }),
        templateContext: buildTemplateRunContext({
          template: {
            ...templateForWorkflowUse,
            workflow: nextWorkflow,
          },
          workflowPath: filePath,
        }),
        initialInputValue: "",
        initialAttachments: [],
      })
      setPendingTemplate(null)
      toast.success(`"${loadedWorkflow.name || templateForWorkflowUse.name}" is ready in ${targetProjectName || "your project"}`)
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
      const templateForWorkflowUse = normalizeTemplateForWorkflowUse(template)
      const nextWorkflow = resolveTemplateWorkflow(templateForWorkflowUse, webSearchBackend)
      const filePath = await window.api.createWorkflow(targetProjectPath, templateForWorkflowUse.name, nextWorkflow)
      await window.api.recordProjectTemplateUsage(targetProjectPath, template.id).catch(() => undefined)
      await openWorkflowFile(filePath, targetProjectPath, {
        pendingMessage: buildTemplateCustomizationPrompt(templateForWorkflowUse),
        entryState: buildTemplateWorkflowEntryState({
          template: {
            ...templateForWorkflowUse,
            workflow: nextWorkflow,
          },
          workflowPath: filePath,
          source: "template_customize",
        }),
        templateContext: buildTemplateRunContext({
          template: {
            ...templateForWorkflowUse,
            workflow: nextWorkflow,
          },
          workflowPath: filePath,
          source: "template_customize",
        }),
        initialInputValue: "",
        initialAttachments: [],
      })
      setPendingTemplate(null)
      toast.success(`"${templateForWorkflowUse.name}" is open for agent refinement`)
    } catch (error) {
      toast.error(`Failed to customize workflow: ${String(error)}`)
    } finally {
      setTemplateAction(null)
    }
  }

  const handleSend = async () => {
    const message = buildResultModeSeedInput(
      selectedResultMode,
      selectedModeConfig,
      draftPrompt,
      promptScaffold,
    )
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
        initialInputValue: "",
        initialAttachments: [],
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

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
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
    <PageShell className="flex min-h-full flex-col space-y-6">
      <PageHeader
        title="New workflow"
        subtitle="Describe the workflow you want, or start from a template."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" aria-label="Select project">
                  <Folder size={14} />
                  <span className="max-w-56 truncate">{targetProjectName || "Select project"}</span>
                  <ChevronRight
                    size={14}
                    className={cn(
                      "shrink-0 transition-transform ui-motion-fast",
                      projectPickerOpen && "rotate-90",
                    )}
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={10}
                className="w-[min(28rem,calc(100vw-2rem))] rounded-lg p-2"
              >
                <DropdownMenuLabel className="px-3 pb-3 pt-2 ui-body-text-medium text-muted-foreground">
                  Select project
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
                  <span className="font-medium">Add project</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={creatingBlankWorkflow}
              onClick={() => void createBlankWorkflow({ projectPath: targetProjectPath })}
            >
              {creatingBlankWorkflow ? <Loader2 size={14} className="animate-spin" /> : <FilePlus2 size={14} />}
              Blank workflow
            </Button>
          </div>
        )}
      />

      <div className={cn("mx-auto flex w-full flex-1 flex-col gap-6 pb-8", CREATE_SURFACE_MAX_WIDTH)}>
        <div ref={composerRef} className="mx-auto w-full">
          <div className="rounded-lg surface-elevated transition-[border-color,box-shadow] ui-motion-fast focus-within:border-ring/60 focus-within:ring-[3px] focus-within:ring-ring/20">
            <div className="border-b border-hairline/70 px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="ui-meta-label text-muted-foreground">Category</p>
                  <Tabs
                    value={selectedResultMode.id}
                    onValueChange={(value) => setSelectedResultModeId(value as ResultModeId)}
                    className="mt-2"
                  >
                    <TabsList className="grid h-auto w-full max-w-[32rem] grid-cols-3 gap-2 bg-transparent p-0">
                      {RESULT_MODES.map((mode) => (
                        <TabsTrigger
                          key={mode.id}
                          value={mode.id}
                          className="h-control-md w-full gap-2 rounded-md px-3"
                        >
                          <span aria-hidden className="text-base leading-none">{mode.emoji}</span>
                          <span className="truncate">{mode.label}</span>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
                <div className="rounded-full surface-inset-card px-3 py-1.5">
                  <p className="ui-meta-text text-muted-foreground">
                    {targetProjectName ? `Will open in ${targetProjectName}` : "Select a project to continue"}
                  </p>
                </div>
              </div>
            </div>

            <div className="relative">
              <AutosizeTextarea
                ref={textareaRef}
                aria-label="Workflow creation prompt"
                value={draftPrompt}
                onChange={(event) => setDraftPrompt(event.target.value)}
                onKeyDown={handleTextareaKeyDown}
                placeholder={selectedResultMode.composerPlaceholder}
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
                  variant="send"
                  size="icon"
                  className="h-control-lg w-control-lg rounded-full"
                >
                  {submitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ArrowUp size={16} />
                  )}
                </Button>
              </div>
            </div>
            <div data-open={promptHelperOpen ? "true" : "false"} className="ui-collapsible">
              <div className="ui-collapsible-inner">
                <div className="px-4 pt-3">
                  <div ref={promptHelperRef} className="surface-inset-card overflow-hidden">
                    <div className="flex flex-wrap items-start justify-between gap-3 px-3 pb-0 pt-3">
                      <div className="space-y-1">
                        <p className="section-kicker">Optional details</p>
                        <p className="ui-meta-text text-muted-foreground">
                          Add structure only when the main prompt is not enough.
                        </p>
                      </div>
                      {optionalDetailCount > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="shrink-0 text-muted-foreground"
                          onClick={clearOptionalDetails}
                        >
                          Clear details
                        </Button>
                      ) : null}
                    </div>

                    <div
                      ref={promptHelperScrollRef}
                      className="ui-scroll-region max-h-[min(56vh,36rem)] overflow-y-auto border-t border-hairline/70 px-3 py-3"
                    >
                      <div className="space-y-5">
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <p className="ui-meta-label text-muted-foreground">Mode details</p>
                            <p className="ui-meta-text text-muted-foreground">
                              A few structured fields for {selectedResultMode.label.toLowerCase()} work.
                            </p>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {selectedModeConfigFields.map((field) => (
                              <ModeConfigField
                                key={field.id}
                                field={field}
                                value={selectedModeConfig[field.id] || ""}
                                onChange={(value) => handleModeConfigChange(field.id, value)}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3 border-t border-hairline/70 pt-4">
                          <div className="space-y-1">
                            <p className="ui-meta-label text-muted-foreground">Prompt helper</p>
                            <p className="ui-meta-text text-muted-foreground">
                              Use this only if the main message still feels too vague.
                            </p>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <ScaffoldField
                              id="workflow-helper-goal"
                              label="Goal"
                              placeholder={selectedResultMode.scaffoldPlaceholders.goal}
                              value={promptScaffold.goal}
                              onChange={(value) => setPromptScaffold((prev) => ({ ...prev, goal: value }))}
                            />
                            <ScaffoldField
                              id="workflow-helper-input"
                              label="Input"
                              placeholder={selectedResultMode.scaffoldPlaceholders.input}
                              value={promptScaffold.input}
                              onChange={(value) => setPromptScaffold((prev) => ({ ...prev, input: value }))}
                            />
                            <ScaffoldField
                              id="workflow-helper-constraints"
                              label="Constraints"
                              placeholder={selectedResultMode.scaffoldPlaceholders.constraints}
                              value={promptScaffold.constraints}
                              onChange={(value) => setPromptScaffold((prev) => ({ ...prev, constraints: value }))}
                            />
                            <ScaffoldField
                              id="workflow-helper-success"
                              label="Success criteria"
                              placeholder={selectedResultMode.scaffoldPlaceholders.successCriteria}
                              value={promptScaffold.successCriteria}
                              onChange={(value) => setPromptScaffold((prev) => ({ ...prev, successCriteria: value }))}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-hairline/70 px-4 py-3">
              <div className="control-cluster control-cluster-compact flex flex-wrap items-center justify-between gap-2 rounded-lg">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant={promptHelperOpen ? "secondary" : "ghost"}
                    size="sm"
                    aria-pressed={promptHelperOpen}
                    className="text-muted-foreground"
                    onClick={() => setPromptHelperOpen((prev) => !prev)}
                  >
                    <Sparkles size={14} />
                    {promptHelperOpen ? "Hide details" : "Add details"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={openTemplateLibrary}
                    className="text-muted-foreground"
                  >
                    Browse templates
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {optionalDetailCount > 0 ? (
                    <Badge variant="secondary" size="pill">
                      {optionalDetailCount} detail{optionalDetailCount === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                  <p className="ui-meta-text text-muted-foreground">Press Enter to start</p>
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

        {visiblePopularTemplates.length > 0 && (
          <section aria-label={popularTemplatesTitle} className="w-full">
            <SectionHeading
              title="Suggested templates"
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
                    onClick={openTemplateLibrary}
                    className="rounded-md text-muted-foreground"
                  >
                    All templates
                  </Button>
                </div>
              )}
            />

            {loadingTemplates ? (
              <div className="mt-4 flex gap-3 overflow-hidden pb-3 pt-1">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={`template-skeleton-${index}`}
                    className="h-36 w-56 shrink-0 animate-pulse rounded-lg surface-panel px-4 py-4 md:w-56"
                  />
                ))}
              </div>
            ) : (
              <div
                ref={templateRailRef}
                aria-label={popularTemplatesTitle}
                className="ui-scroll-region ui-scrollbar-hidden mt-4 flex items-stretch snap-x snap-mandatory gap-3 overflow-x-auto pb-3 pt-1"
              >
                {visiblePopularTemplates.map((template) => (
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
      </div>

      {unsavedChangesDialog}
      <Dialog open={pendingTemplate !== null} onOpenChange={(open) => !open && setPendingTemplate(null)}>
        <CanvasDialogContent showCloseButton={false}>
          <CanvasDialogHeader>
            <DialogTitle>Use this template</DialogTitle>
            <DialogDescription>
              &ldquo;{pendingTemplate ? getWorkflowTemplateDisplayName(pendingTemplate) : ""}&rdquo; is ready to use. Start with it directly, or open it with the agent and tailor it first.
            </DialogDescription>
          </CanvasDialogHeader>
          <CanvasDialogBody className="space-y-3">
            {targetProjectPath ? (
              <div className="rounded-lg surface-inset-card px-3 py-3">
                <p className="ui-meta-text text-muted-foreground">Selected project</p>
                <p className="mt-1 ui-body-text-medium text-foreground">{targetProjectName}</p>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  It will open here ready to run or refine.
                </p>
              </div>
            ) : (
              <div className="rounded-lg surface-inset-card px-3 py-3 text-body-sm text-muted-foreground">
                Select or add a project first so this template has somewhere to open.
              </div>
            )}
            <PendingTemplateDetails
              categoryLabel={pendingTemplateCategoryLabel}
              executionSummary={pendingTemplateExecutionSummary}
            />
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
