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
  workflowCreatePromptScaffoldAtom,
  workflowEntryStateAtom,
  setWorkflowTemplateContextForKeyAtom,
  workflowDirtyAtom,
  workflowSavedSnapshotAtom,
  workflowsAtom,
} from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { PromptComposer } from "@/components/ui/prompt-composer"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PageHeader, PageShell } from "@/components/ui/page-shell"
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
  countWorkflowCreateScaffoldFields,
  hasWorkflowCreatePromptContent,
} from "@/lib/workflow-create-prompt"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { projectFolderName } from "@/components/sidebar/projectSidebarUtils"
import { toast } from "sonner"
import {
  ArrowUp,
  Check,
  ChevronRight,
  Folder,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  Sparkles,
} from "lucide-react"
import type {
  CreateEntryHelpModeHint,
  CreateEntryRouteOption,
  InputAttachment,
  ProjectInspectionSummary,
  ResultModeId,
  WorkflowTemplate,
} from "@shared/types"
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
  getResultModeQuickStartOptions,
  presentDevelopmentCreateQuickStarts,
  presentDevelopmentCreateRouteOptions,
  prioritizeDevelopmentCreateQuickStarts,
  prioritizeTemplatesForResultMode,
  RESULT_MODES,
  splitTemplatesForResultMode,
} from "@/lib/result-modes"
import { resolveGuidedStartTemplateId } from "@/lib/guided-start"
import { getWorkflowTemplateDisplayName } from "@/lib/template-display"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import { useBlankWorkflowCreation } from "@/hooks/useBlankWorkflowCreation"
import { buildTemplateStartState, buildTemplateStartStateFromRoute } from "@/lib/template-start"

const POPULAR_TEMPLATE_LIMIT = 12
const CREATE_SURFACE_MAX_WIDTH = "max-w-5xl"
const DEVELOPMENT_CREATE_QUICK_START_IDS = new Set([
  "delivery-map-codebase",
  "delivery-shape-project",
  "delivery-plan-phase",
])
const DEVELOPMENT_CONTEXTUAL_ROUTE_OPTIONS: CreateEntryRouteOption[] = [
  {
    templateId: "ux-ui-polish-audit",
    label: "Audit and polish this UI",
    stageLabel: "Review",
  },
  {
    templateId: "impeccable-ui-pipeline",
    label: "Improve this UI flow",
    stageLabel: "Do it",
  },
  {
    templateId: "playwright-visual-audit",
    label: "Audit this UI in browser",
    stageLabel: "Review it",
  },
]

const DEVELOPMENT_HELP_MODE_OPTIONS: Array<{ value: CreateEntryHelpModeHint, label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "do", label: "Do it" },
  { value: "plan", label: "Plan it" },
  { value: "review", label: "Review it" },
]

function buildTemplateCustomizationPrompt(template: WorkflowTemplate, requestedResult?: string): string {
  const lines = [
    `Use the existing "${getWorkflowTemplateDisplayName(template)}" process as the base process.`,
    template.how,
    "Adapt it to this project and update only the steps that need to change.",
  ]

  const cleanRequest = requestedResult?.trim()
  if (cleanRequest) {
    lines.push(`Requested result: ${cleanRequest}`)
  }

  return lines.join(" ")
}

function templateCardCopy(template: WorkflowTemplate): string {
  return deriveTemplateCardCopy(template)
}

async function resolveHubTemplate(template: WorkflowTemplate): Promise<WorkflowTemplate> {
  if (template.source !== "hub" || template.workflow.nodes.length > 0) return template
  const full = await window.api.fetchHubTemplate(template.id)
  return { ...template, ...full, source: "hub" }
}

function normalizeTemplateForWorkflowUse(template: WorkflowTemplate): WorkflowTemplate {
  const name = getWorkflowTemplateDisplayName(template)
  if (name === template.name) return template
  return { ...template, name }
}

function TemplateSuggestionCard({
  template,
  onSelect,
  title,
  summary,
  eyebrow,
  recommended = false,
}: {
  template: WorkflowTemplate
  onSelect: (template: WorkflowTemplate) => void
  title?: string
  summary?: string
  eyebrow?: string
  recommended?: boolean
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="bare"
      onClick={() => onSelect(template)}
      className="ui-interactive-card-subtle h-auto w-full !items-start gap-2.5 rounded-[1rem] border border-hairline/80 bg-surface-1/78 px-3 py-3 text-left !whitespace-normal"
    >
      <div className="surface-inset-card flex h-9 w-9 shrink-0 items-center justify-center p-0 text-[15px]">
        <span aria-hidden>{template.emoji}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {eyebrow ? (
            <Badge variant="outline" size="compact">
              {eyebrow}
            </Badge>
          ) : null}
          {recommended ? (
            <Badge variant="secondary" size="compact">
              Suggested
            </Badge>
          ) : null}
        </div>
        <p className="truncate text-body-sm font-medium text-foreground">
          {title || getWorkflowTemplateDisplayName(template)}
        </p>
        <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">
          {summary || template.headline || templateCardCopy(template)}
        </p>
      </div>
    </Button>
  )
}

function PendingTemplateDetails({
  stageLabel,
  executionSummary,
}: {
  stageLabel: string | null
  executionSummary: string | null
}) {
  if (!stageLabel && !executionSummary) return null

  return (
    <div className="rounded-lg surface-inset-card px-3 py-3">
      <div className="flex flex-wrap gap-3">
      {stageLabel ? (
        <div className="space-y-1">
          <p className="ui-meta-text text-muted-foreground">Stage</p>
          <p className="text-body-sm text-foreground">{stageLabel}</p>
        </div>
      ) : null}
      {executionSummary ? (
        <div className="space-y-1">
          <p className="ui-meta-text text-muted-foreground">Policy</p>
          <p className="text-body-sm text-foreground">{executionSummary}</p>
        </div>
      ) : null}
      </div>
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
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-20 resize-y"
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
          rows={2}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className="min-h-20 resize-y"
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
  const [projectInspection, setProjectInspection] = useState<ProjectInspectionSummary | null>(null)
  const [developmentHelpModeHint, setDevelopmentHelpModeHint] = useState<CreateEntryHelpModeHint>("auto")
  const [draftPrompt, setDraftPrompt] = useAtom(workflowCreateDraftPromptAtom)
  const [modeConfigs, setModeConfigs] = useAtom(workflowCreateModeConfigsAtom)
  const [promptScaffold, setPromptScaffold] = useAtom(workflowCreatePromptScaffoldAtom)
  const [, setPendingCreateEntry] = useAtom(workflowCreatePendingEntryAtom)
  const [, setPendingCreateMessage] = useAtom(workflowCreatePendingMessageAtom)
  const [, setWorkflowEntryState] = useAtom(workflowEntryStateAtom)
  const setWorkflowTemplateContextForKey = useSetAtom(setWorkflowTemplateContextForKeyAtom)
  const setTemplateLibraryContext = useSetAtom(templateLibraryContextAtom)
  const [promptHelperOpen, setPromptHelperOpen] = useState(false)
  const [popularTemplates, setPopularTemplates] = useState<WorkflowTemplate[]>([])
  const [availableTemplates, setAvailableTemplates] = useState<WorkflowTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [openingProject, setOpeningProject] = useState(false)
  const [projectPickerOpen, setProjectPickerOpen] = useState(false)
  const [pendingTemplate, setPendingTemplate] = useState<WorkflowTemplate | null>(null)
  const [templateAction, setTemplateAction] = useState<"create" | "customize" | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
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

    if (projects.length === 1) {
      setCreateContext({ projectPath: projects[0], locked: false })
      return
    }

    if (projects.length > 1) {
      if (targetProjectPath !== null || createContext.locked) {
        setCreateContext({ projectPath: null, locked: false })
      }
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
              toast.error(`Failed to load popular starting points: ${message}`)
            }
          }
        }

        if (cancelled) return
        setAvailableTemplates(templates)
        const seen = new Set(popular.map((template) => template.id))
        const supplemented = templates.filter((template) => !seen.has(template.id))
        setPopularTemplates(
          [...popular, ...supplemented].slice(0, POPULAR_TEMPLATE_LIMIT),
        )
      } catch (error) {
        if (cancelled) return
        setAvailableTemplates([])
        setPopularTemplates([])
        toast.error(`Failed to load starting points: ${String(error)}`)
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
  const createSeedMessage = useMemo(
    () => (
      canSubmitPrompt
        ? buildResultModeSeedInput(
          selectedResultMode,
          selectedModeConfig,
          draftPrompt,
          promptScaffold,
        )
        : ""
    ),
    [canSubmitPrompt, draftPrompt, promptScaffold, selectedModeConfig, selectedResultMode],
  )
  const modeTemplateSplit = useMemo(
    () => splitTemplatesForResultMode(availableTemplates, selectedResultModeId),
    [availableTemplates, selectedResultModeId],
  )
  const visibleQuickStarts = modeTemplateSplit.quickStarts
  const quickStartOptions = useMemo(
    () => getResultModeQuickStartOptions(selectedResultMode.id),
    [selectedResultMode.id],
  )
  const routeOptions = useMemo<CreateEntryRouteOption[]>(
    () => {
      const basePrimaryOptions = (visibleQuickStarts.length > 0 ? visibleQuickStarts : quickStartOptions).map((quickStart) => ({
        templateId: "template" in quickStart ? quickStart.template.id : quickStart.templateId,
        label: quickStart.label,
        stageLabel: quickStart.stageLabel,
        recommended: quickStart.recommended,
      }))
      const primaryOptions = selectedResultMode.id === "development"
        ? presentDevelopmentCreateRouteOptions(basePrimaryOptions, projectInspection?.projectKind)
        : basePrimaryOptions
      if (selectedResultMode.id !== "development") return primaryOptions

      const availableTemplateIds = new Set(availableTemplates.map((template) => template.id))
      const contextualOptions = DEVELOPMENT_CONTEXTUAL_ROUTE_OPTIONS.filter((option) =>
        availableTemplateIds.has(option.templateId))

      return [...primaryOptions, ...contextualOptions].filter((option, index, array) =>
        array.findIndex((candidate) => candidate.templateId === option.templateId) === index)
    },
    [availableTemplates, projectInspection?.projectKind, quickStartOptions, selectedResultMode.id, visibleQuickStarts],
  )
  const resolvedStartTemplateId = useMemo(
    () => resolveGuidedStartTemplateId({
      modeId: selectedResultMode.id,
      fallbackTemplateId: selectedResultMode.startTemplateId,
      draftPrompt,
      modeConfig: selectedModeConfig,
      projectPath: targetProjectPath,
    }),
    [draftPrompt, selectedModeConfig, selectedResultMode.id, selectedResultMode.startTemplateId, targetProjectPath],
  )
  const resolvedStartTemplate = useMemo(
    () => availableTemplates.find((template) => template.id === resolvedStartTemplateId) || null,
    [availableTemplates, resolvedStartTemplateId],
  )
  const submitHint = useMemo(() => {
    if (selectedResultMode.id === "development") {
      return "Best start chosen after submit"
    }
    if (resolvedStartTemplate) {
      return `Starts with ${getWorkflowTemplateDisplayName(resolvedStartTemplate)}`
    }
    return null
  }, [resolvedStartTemplate, selectedResultMode.id])
  const displayQuickStarts = useMemo(() => {
    if (visibleQuickStarts.length === 0) return []
    if (selectedResultMode.id !== "development") return visibleQuickStarts
    const entryQuickStarts = visibleQuickStarts.filter((quickStart) =>
      DEVELOPMENT_CREATE_QUICK_START_IDS.has(quickStart.template.id) || quickStart.template.id === "delivery-verify-phase")
    const prioritizedQuickStarts = prioritizeDevelopmentCreateQuickStarts(
      entryQuickStarts.length > 0 ? entryQuickStarts : visibleQuickStarts,
      projectInspection?.projectKind,
    )
    const primaryQuickStarts = prioritizedQuickStarts.length > 0 ? prioritizedQuickStarts : visibleQuickStarts.slice(0, 3)
    return presentDevelopmentCreateQuickStarts(primaryQuickStarts, projectInspection?.projectKind)
  }, [projectInspection?.projectKind, selectedResultMode.id, visibleQuickStarts])
  const visiblePopularTemplates = useMemo(() => {
    const modeTemplates = prioritizeTemplatesForResultMode(popularTemplates, selectedResultModeId)
    return (modeTemplates.length > 0 ? modeTemplates : popularTemplates).slice(0, POPULAR_TEMPLATE_LIMIT)
  }, [popularTemplates, selectedResultModeId])
  const suggestedTemplates = useMemo(() => {
    if (displayQuickStarts.length > 0) {
      return displayQuickStarts.map((quickStart) => ({
        template: quickStart.template,
        title: quickStart.label,
        summary: quickStart.summary,
        eyebrow: quickStart.stageLabel,
        recommended: quickStart.recommended,
      }))
    }

    return visiblePopularTemplates.slice(0, 6).map((template) => ({
      template,
      title: undefined,
      summary: undefined,
      eyebrow: undefined,
      recommended: false,
    }))
  }, [displayQuickStarts, visiblePopularTemplates])
  const suggestedTemplatesTitle = useMemo(() => {
    if (selectedResultMode.id === "development") return "Suggested starts"
    return `Suggested ${selectedResultMode.label.toLowerCase()} starts`
  }, [selectedResultMode.id, selectedResultMode.label])
  const pendingQuickStart = useMemo(
    () => displayQuickStarts.find((quickStart) => quickStart.template.id === pendingTemplate?.id) || null,
    [displayQuickStarts, pendingTemplate?.id],
  )
  const pendingPrimaryActionLabel = pendingQuickStart?.stageLabel
    ? `Start ${pendingQuickStart.label}`
    : "Start here"

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

  useEffect(() => {
    let cancelled = false

    if (!targetProjectPath) {
      setProjectInspection(null)
      return () => {
        cancelled = true
      }
    }

    const inspectCreateEntryProject = (window.api as typeof window.api & {
      inspectCreateEntryProject?: typeof window.api.inspectCreateEntryProject
    }).inspectCreateEntryProject

    if (!inspectCreateEntryProject) {
      setProjectInspection(null)
      return () => {
        cancelled = true
      }
    }

    void inspectCreateEntryProject(targetProjectPath)
      .then((inspection) => {
        if (!cancelled) {
          setProjectInspection(inspection)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjectInspection(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [targetProjectPath])

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
    if (!(await confirmDiscard("create a process from a starting point", workflowDirty))) {
      return
    }

    setTemplateAction("create")
    try {
      const resolved = await resolveHubTemplate(template)
      const templateForWorkflowUse = normalizeTemplateForWorkflowUse(resolved)
      const nextWorkflow = resolveTemplateWorkflow(templateForWorkflowUse, webSearchBackend)
      const filePath = await window.api.createWorkflow(targetProjectPath, templateForWorkflowUse.name, nextWorkflow)
      const templateStartState = buildTemplateStartState({
        template: {
          ...templateForWorkflowUse,
          workflow: nextWorkflow,
        },
        workflowPath: filePath,
        projectPath: targetProjectPath,
        requestedResult: createSeedMessage,
      })
      await window.api.recordProjectTemplateUsage(targetProjectPath, template.id).catch(() => undefined)
      const loadedWorkflow = await openWorkflowFile(filePath, targetProjectPath, {
        entryState: templateStartState.entryState,
        templateContext: templateStartState.templateContext,
        initialInputValue: templateStartState.initialInputValue,
        initialAttachments: templateStartState.initialAttachments,
      })
      setPendingTemplate(null)
      toast.success(`"${loadedWorkflow.name || templateForWorkflowUse.name}" is ready in ${targetProjectName || "your project"}`)
    } catch (error) {
      toast.error(`Failed to create process: ${String(error)}`)
    } finally {
      setTemplateAction(null)
    }
  }

  const handleCustomizeTemplate = async (template: WorkflowTemplate) => {
    if (!targetProjectPath || templateAction) return
    if (!(await confirmDiscard("customize a starting point with agent", workflowDirty))) {
      return
    }

    setTemplateAction("customize")
    try {
      const resolved = await resolveHubTemplate(template)
      const templateForWorkflowUse = normalizeTemplateForWorkflowUse(resolved)
      const nextWorkflow = resolveTemplateWorkflow(templateForWorkflowUse, webSearchBackend)
      const filePath = await window.api.createWorkflow(targetProjectPath, templateForWorkflowUse.name, nextWorkflow)
      const templateStartState = buildTemplateStartState({
        template: {
          ...templateForWorkflowUse,
          workflow: nextWorkflow,
        },
        workflowPath: filePath,
        projectPath: targetProjectPath,
        requestedResult: createSeedMessage,
        source: "template_customize",
      })
      await window.api.recordProjectTemplateUsage(targetProjectPath, template.id).catch(() => undefined)
      await openWorkflowFile(filePath, targetProjectPath, {
        pendingMessage: buildTemplateCustomizationPrompt(templateForWorkflowUse, createSeedMessage),
        entryState: templateStartState.entryState,
        templateContext: templateStartState.templateContext,
        initialInputValue: templateStartState.initialInputValue,
        initialAttachments: templateStartState.initialAttachments,
      })
      setPendingTemplate(null)
      toast.success(`"${templateForWorkflowUse.name}" is ready for agent refinement`)
    } catch (error) {
      toast.error(`Failed to customize process: ${String(error)}`)
    } finally {
      setTemplateAction(null)
    }
  }

  const handleSend = async () => {
    const message = createSeedMessage
    if (!message || submitting) return
    if (!targetProjectPath) {
      const errorMessage = "Open or select a project before starting a process."
      setSubmitError(errorMessage)
      toast.error(errorMessage)
      return
    }

    if (!(await confirmDiscard("start a new process", workflowDirty))) {
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      const routeCreateEntry = (window.api as typeof window.api & {
        routeCreateEntry?: typeof window.api.routeCreateEntry
      }).routeCreateEntry
      const routeResult = routeCreateEntry
        ? await routeCreateEntry({
          modeId: selectedResultMode.id,
          projectPath: targetProjectPath,
          fallbackTemplateId: selectedResultMode.startTemplateId,
          draftPrompt,
          requestedResult: message,
          helpModeHint: selectedResultMode.id === "development" ? developmentHelpModeHint : "auto",
          modeConfig: selectedModeConfig,
          promptScaffold,
          allowedOptions: routeOptions,
        }).catch((error) => {
          const message = String(error)
          if (!message.includes("No handler registered")) {
            console.warn("[WorkflowCreatePage] routeCreateEntry failed, falling back to heuristic start", error)
          }
          return null
        })
        : null
      const catalog = availableTemplates.length > 0 ? availableTemplates : await window.api.listTemplates()
      const startTemplate = (routeResult
        ? catalog.find((template) => template.id === routeResult.recommendedTemplateId)
        : null)
        || catalog.find((template) => template.id === resolvedStartTemplateId)
        || null

      if (startTemplate) {
        const resolvedStartTemplate = await resolveHubTemplate(startTemplate)
        const templateForWorkflowUse = normalizeTemplateForWorkflowUse(resolvedStartTemplate)
        const nextWorkflow = resolveTemplateWorkflow(templateForWorkflowUse, webSearchBackend)
        const filePath = await window.api.createWorkflow(targetProjectPath, templateForWorkflowUse.name, nextWorkflow)
        const template = {
          ...templateForWorkflowUse,
          workflow: nextWorkflow,
        }
        const templateStartState = routeResult
          ? buildTemplateStartStateFromRoute({
            template,
            workflowPath: filePath,
            projectPath: targetProjectPath,
            requestedResult: message,
            routeResult,
          })
          : buildTemplateStartState({
            template,
            workflowPath: filePath,
            projectPath: targetProjectPath,
            requestedResult: message,
          })

        await window.api.recordProjectTemplateUsage(targetProjectPath, startTemplate.id).catch(() => undefined)
        await openWorkflowFile(filePath, targetProjectPath, {
          entryState: templateStartState.entryState,
          templateContext: templateStartState.templateContext,
          initialInputValue: templateStartState.initialInputValue,
          initialAttachments: templateStartState.initialAttachments,
        })
        return
      }

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

  return (
    <PageShell className="flex min-h-full flex-col space-y-6">
      <PageHeader
        title="Start a process"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" aria-label="Select project" className="no-drag">
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

          </div>
        )}
      />

      <div className={cn("mx-auto flex w-full flex-1 flex-col gap-5 pb-8", CREATE_SURFACE_MAX_WIDTH)}>
        <div ref={composerRef} className="mx-auto w-full space-y-4">
          <div className="flex flex-col gap-2 px-1">
            <Tabs
              value={selectedResultMode.id}
              onValueChange={(value) => setSelectedResultModeId(value as ResultModeId)}
              className="w-full"
            >
              <TabsList className="h-auto w-fit flex-wrap rounded-[0.95rem] border border-hairline/75 bg-surface-1/72 p-1 shadow-[inset_0_1px_0_var(--inset-highlight)]">
                {RESULT_MODES.map((mode) => (
                  <TabsTrigger
                    key={mode.id}
                    value={mode.id}
                    className="h-8 gap-2 rounded-[0.75rem] border-transparent px-3 text-[15px] font-medium text-muted-foreground hover:bg-surface-2/45 hover:text-foreground data-[state=active]:border-transparent data-[state=active]:bg-surface-1 data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_1px_0_var(--inset-highlight),0_1px_2px_hsl(var(--foreground)/0.08)]"
                  >
                    <span aria-hidden>{mode.emoji}</span>
                    <span>{mode.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <PromptComposer
            ref={textareaRef}
            aria-label="Process request"
            value={draftPrompt}
            onChange={(event) => setDraftPrompt(event.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder={selectedResultMode.composerPlaceholder}
            rows={1}
            maxHeight={220}
            shellClassName="rounded-[1.875rem]"
            textareaClassName="min-h-28 text-[1.02rem] leading-7"
            action={(
              <Button
                type="button"
                onClick={() => void handleSend()}
                disabled={!canSubmitPrompt || submitting}
                variant="send"
                size="icon"
                className="h-11 w-11 rounded-full"
                aria-label={selectedResultMode.startActionLabel || "Start process"}
                title={selectedResultMode.startActionLabel || "Start process"}
              >
                {submitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ArrowUp size={16} />
                )}
              </Button>
            )}
            footer={(
              <div className="space-y-2.5">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {selectedResultMode.id === "development" ? (
                      <>
                        <span className="ui-meta-text shrink-0 text-muted-foreground">Mode</span>
                        <div
                          className="control-cluster control-cluster-compact flex flex-wrap items-center gap-1 rounded-xl surface-inset-card p-1"
                          aria-label="Development help mode"
                        >
                          {DEVELOPMENT_HELP_MODE_OPTIONS.map((option) => (
                            <Button
                              key={option.value}
                              type="button"
                              variant={developmentHelpModeHint === option.value ? "secondary" : "ghost"}
                              size="xs"
                              aria-pressed={developmentHelpModeHint === option.value}
                              onClick={() => setDevelopmentHelpModeHint(option.value)}
                              className="px-2.5 text-muted-foreground"
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="ui-meta-text text-muted-foreground">{selectedResultMode.runtimeLine}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      variant={promptHelperOpen ? "secondary" : "ghost"}
                      size="xs"
                      aria-pressed={promptHelperOpen}
                      className="text-muted-foreground"
                      onClick={() => setPromptHelperOpen((prev) => !prev)}
                    >
                      <Sparkles size={13} />
                      {promptHelperOpen ? "Hide details" : "Details"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={openTemplateLibrary}
                      className="text-muted-foreground"
                    >
                      Library
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label="More create actions"
                          className="text-muted-foreground"
                        >
                          <MoreHorizontal size={14} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 rounded-lg p-1.5">
                        <DropdownMenuItem
                          onSelect={() => void createBlankWorkflow({ projectPath: targetProjectPath })}
                          disabled={creatingBlankWorkflow || !targetProjectPath}
                          className="h-auto items-center gap-2 rounded-md px-3 py-2 text-body-sm"
                        >
                          {creatingBlankWorkflow ? <Loader2 size={14} className="animate-spin" /> : null}
                          Blank process
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    {submitHint ? (
                      <p className="ui-meta-text text-muted-foreground">{submitHint}</p>
                    ) : null}
                    {optionalDetailCount > 0 ? (
                      <Badge variant="secondary" size="compact">
                        {optionalDetailCount} detail{optionalDetailCount === 1 ? "" : "s"}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="ui-meta-text text-muted-foreground">
                    {submitting ? "Choosing the best start..." : "Enter to start · Shift+Enter new line"}
                  </p>
                </div>
              </div>
            )}
          />

          <div data-open={promptHelperOpen ? "true" : "false"} className="ui-collapsible">
            <div className="ui-collapsible-inner">
              <div className="px-2 pt-1">
                <div ref={promptHelperRef} className="surface-inset-card overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-0 pt-4">
                    <div>
                      <p className="section-kicker">Details</p>
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
                    className="ui-scroll-region max-h-[min(56vh,36rem)] overflow-y-auto border-t border-hairline/70 px-4 py-4"
                  >
                    <div className="space-y-5">
                      <div className="space-y-3">
                        <p className="ui-meta-label text-muted-foreground">Mode details</p>
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
                        <p className="ui-meta-label text-muted-foreground">Request scaffold</p>
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

          {submitError ? (
            <div className="rounded-lg ui-alert-danger text-status-danger">
              {submitError}
            </div>
          ) : null}
        </div>

        {(loadingTemplates || suggestedTemplates.length > 0) ? (
          <section aria-label={suggestedTemplatesTitle} className="w-full space-y-2.5">
            <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-body-sm font-medium text-muted-foreground">{suggestedTemplatesTitle}</p>
              <Button
                variant="ghost"
                size="xs"
                onClick={openTemplateLibrary}
                className="w-fit text-muted-foreground"
              >
                Browse library
              </Button>
            </div>

            {loadingTemplates ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={`template-skeleton-${index}`}
                    className="h-24 animate-pulse rounded-xl surface-panel"
                  />
                ))}
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {suggestedTemplates.map((suggestion) => (
                  <TemplateSuggestionCard
                    key={suggestion.template.id}
                    template={suggestion.template}
                    title={suggestion.title}
                    summary={suggestion.summary}
                    eyebrow={suggestion.eyebrow}
                    recommended={suggestion.recommended}
                    onSelect={handleTemplateSelect}
                  />
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>

      {unsavedChangesDialog}
      <Dialog open={pendingTemplate !== null} onOpenChange={(open) => !open && setPendingTemplate(null)}>
          <CanvasDialogContent showCloseButton={false} size="lg">
          <CanvasDialogHeader>
            <DialogTitle>{pendingQuickStart?.label ? `Start ${pendingQuickStart.label}` : "Start from this starting point"}</DialogTitle>
            <DialogDescription>
              &ldquo;{pendingQuickStart?.label || (pendingTemplate ? getWorkflowTemplateDisplayName(pendingTemplate) : "")}&rdquo; is ready in the selected project.
            </DialogDescription>
          </CanvasDialogHeader>
          <CanvasDialogBody className="space-y-3">
            {targetProjectPath ? (
              <div className="rounded-lg surface-inset-card px-3 py-3">
                <p className="ui-meta-text text-muted-foreground">Selected project</p>
                <p className="mt-1 ui-body-text-medium text-foreground">{targetProjectName}</p>
              </div>
            ) : (
              <div className="rounded-lg surface-inset-card px-3 py-3 text-body-sm text-muted-foreground">
                Select or add a project first so this starting point has somewhere to start.
              </div>
            )}
            <PendingTemplateDetails
              stageLabel={pendingQuickStart?.stageLabel || pendingTemplateCategoryLabel}
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
              Refine with agent
            </Button>
            <Button
              size="sm"
              disabled={!pendingTemplate || !targetProjectPath || templateAction !== null}
              isLoading={templateAction === "create"}
              loadingText="Creating process"
              onClick={() => pendingTemplate && void handleCreateFromTemplate(pendingTemplate)}
            >
              {pendingPrimaryActionLabel}
            </Button>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>
    </PageShell>
  )
}
