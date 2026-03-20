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
import { PromptComposer } from "@/components/ui/prompt-composer"
import { PageHeader, PageShell } from "@/components/ui/page-shell"
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
  Loader2,
} from "lucide-react"
import type {
  CreateEntryRouteClarification,
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
  deriveTemplateExecutionDisciplineLabels,
} from "@/lib/workflow-entry"
import {
  buildResultModeSeedInput,
  countResultModeConfigFields,
  getResultModeConfigFields,
  normalizeResultModeConfig,
} from "@/lib/result-mode-config"
import {
  filterDirectCreateEntryOptions,
  sanitizeDirectCreateFallbackTemplateId,
} from "@shared/create-entry-routing"
import {
  getResultMode,
  getResultModeQuickStartOptions,
  presentDevelopmentCreateQuickStarts,
  presentDevelopmentCreateRouteOptions,
  prioritizeDevelopmentCreateQuickStarts,
  prioritizeTemplatesForResultMode,
  splitTemplatesForResultMode,
} from "@/lib/result-modes"
import { resolveGuidedStartTemplateId } from "@/lib/guided-start"
import { getWorkflowTemplateDisplayName } from "@/lib/template-display"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import { useBlankWorkflowCreation } from "@/hooks/useBlankWorkflowCreation"
import { buildTemplateStartState, buildTemplateStartStateFromRoute } from "@/lib/template-start"
import { PendingTemplateDialog, RouteClarificationDialog } from "@/components/create/WorkflowCreateDialogs"
import { WorkflowCreateProjectPicker } from "@/components/create/WorkflowCreateProjectPicker"
import { WorkflowCreateDetailsPanel } from "@/components/create/WorkflowCreateDetailsPanel"
import { WorkflowCreateSuggestionsSection } from "@/components/create/WorkflowCreateSuggestionsSection"
import { WorkflowCreateModeTabs } from "@/components/create/WorkflowCreateModeTabs"
import { WorkflowCreateComposerFooter } from "@/components/create/WorkflowCreateComposerFooter"

const POPULAR_TEMPLATE_LIMIT = 12
const CREATE_SURFACE_MAX_WIDTH = "max-w-5xl"
const DEVELOPMENT_CREATE_QUICK_START_IDS = new Set([
  "delivery-map-codebase",
  "delivery-shape-project",
  "delivery-plan-phase",
  "delivery-review-phase",
])
const DEVELOPMENT_CONTEXTUAL_ROUTE_OPTIONS: CreateEntryRouteOption[] = [
  {
    templateId: "full-stack-code-audit",
    label: "Audit codebase risks",
    intentLabel: "Review it",
  },
  {
    templateId: "ux-ui-polish-audit",
    label: "Audit and polish this UI",
    intentLabel: "Review it",
  },
  {
    templateId: "impeccable-ui-pipeline",
    label: "Improve this UI flow",
    intentLabel: "Do it",
  },
  {
    templateId: "playwright-visual-audit",
    label: "Audit this UI in browser",
    intentLabel: "Review it",
  },
]

function buildTemplateCustomizationPrompt(template: WorkflowTemplate, requestedResult?: string): string {
  const lines = [
    `Use the existing "${getWorkflowTemplateDisplayName(template)}" flow as the base flow.`,
    template.how,
    "Adapt it to this project and update only the steps that need to change.",
  ]

  const cleanRequest = requestedResult?.trim()
  if (cleanRequest) {
    lines.push(`Requested result: ${cleanRequest}`)
  }

  return lines.join(" ")
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
  const [developmentHelpModeHint, setDevelopmentHelpModeHint] = useState<CreateEntryHelpModeHint | null>(null)
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
  const [routeClarification, setRouteClarification] = useState<CreateEntryRouteClarification | null>(null)
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
        intentLabel: quickStart.intentLabel,
        recommended: quickStart.recommended,
      }))
      const primaryOptions = filterDirectCreateEntryOptions(
        selectedResultMode.id,
        selectedResultMode.id === "development"
          ? presentDevelopmentCreateRouteOptions(basePrimaryOptions, projectInspection?.projectKind)
          : basePrimaryOptions,
      )
      if (selectedResultMode.id !== "development") return primaryOptions

      const availableTemplateIds = new Set(availableTemplates.map((template) => template.id))
      const contextualOptions = filterDirectCreateEntryOptions(
        selectedResultMode.id,
        DEVELOPMENT_CONTEXTUAL_ROUTE_OPTIONS.filter((option) => availableTemplateIds.has(option.templateId)),
      )

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
  const displayQuickStarts = useMemo(() => {
    if (visibleQuickStarts.length === 0) return []
    if (selectedResultMode.id !== "development") return visibleQuickStarts
    const entryQuickStarts = visibleQuickStarts.filter((quickStart) =>
      DEVELOPMENT_CREATE_QUICK_START_IDS.has(quickStart.template.id))
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
        eyebrow: quickStart.intentLabel,
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
    if (selectedResultMode.id === "development") return "Suggested starting points"
    return `Suggested ${selectedResultMode.label.toLowerCase()} starting points`
  }, [selectedResultMode.id, selectedResultMode.label])
  const pendingQuickStart = useMemo(
    () => displayQuickStarts.find((quickStart) => quickStart.template.id === pendingTemplate?.id) || null,
    [displayQuickStarts, pendingTemplate?.id],
  )
  const pendingPrimaryActionLabel = pendingQuickStart?.intentLabel
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
    if (!(await confirmDiscard("create a flow from a starting point", workflowDirty))) {
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
      toast.error(`Failed to create flow: ${String(error)}`)
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
      toast.error(`Failed to customize flow: ${String(error)}`)
    } finally {
      setTemplateAction(null)
    }
  }

  const handleSend = async (
    helpModeOverride?: CreateEntryHelpModeHint | null,
    skipDiscardConfirm = false,
  ) => {
    const message = createSeedMessage
    if (!message || submitting) return
    if (!targetProjectPath) {
      const errorMessage = "Open or select a project before starting a flow."
      setSubmitError(errorMessage)
      toast.error(errorMessage)
      return
    }

    if (!skipDiscardConfirm && !(await confirmDiscard("start a new flow", workflowDirty))) {
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    setRouteClarification(null)

    try {
      const effectiveHelpModeHint =
        selectedResultMode.id === "development"
          ? (helpModeOverride ?? developmentHelpModeHint ?? undefined)
          : undefined
      const routeCreateEntry = (window.api as typeof window.api & {
        routeCreateEntry?: typeof window.api.routeCreateEntry
      }).routeCreateEntry
      const routeResult = routeCreateEntry
        ? await routeCreateEntry({
          modeId: selectedResultMode.id,
          projectPath: targetProjectPath,
          fallbackTemplateId: sanitizeDirectCreateFallbackTemplateId(
            selectedResultMode.id,
            selectedResultMode.startTemplateId,
          ),
          draftPrompt,
          requestedResult: message,
          helpModeHint: effectiveHelpModeHint,
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
      if (routeResult?.clarification) {
        setRouteClarification(routeResult.clarification)
        return
      }
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

  const handleClarificationSelect = (helpMode: CreateEntryHelpModeHint) => {
    setDevelopmentHelpModeHint(helpMode)
    setRouteClarification(null)
    void handleSend(helpMode, true)
  }

  return (
    <PageShell className="flex min-h-full flex-col space-y-6">
      <PageHeader
        title="Start a flow"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <WorkflowCreateProjectPicker
              open={projectPickerOpen}
              onOpenChange={setProjectPickerOpen}
              targetProjectName={targetProjectName}
              projects={projects}
              targetProjectPath={targetProjectPath}
              openingProject={openingProject}
              projectNameForPath={projectFolderName}
              onSelectProject={(projectPath) => setCreateContext({ projectPath, locked: false })}
              onAddProject={() => { void handleOpenProject() }}
            />
          </div>
        )}
      />

      <div className={cn("mx-auto flex w-full flex-1 flex-col gap-5 pb-8", CREATE_SURFACE_MAX_WIDTH)}>
        <div ref={composerRef} className="mx-auto w-full space-y-4">
          <WorkflowCreateModeTabs
            selectedModeId={selectedResultMode.id}
            onSelectMode={setSelectedResultModeId}
          />

          <PromptComposer
            ref={textareaRef}
            aria-label="Flow request"
            value={draftPrompt}
            onChange={(event) => {
              setRouteClarification(null)
              setDraftPrompt(event.target.value)
            }}
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
                aria-label={selectedResultMode.startActionLabel || "Start flow"}
                title={selectedResultMode.startActionLabel || "Start flow"}
              >
                {submitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ArrowUp size={16} />
                )}
              </Button>
            )}
            footer={(
              <WorkflowCreateComposerFooter
                selectedResultMode={selectedResultMode}
                developmentHelpModeHint={developmentHelpModeHint}
                onToggleHelpMode={(helpMode) => {
                  setRouteClarification(null)
                  setDevelopmentHelpModeHint((previous) => (
                    previous === helpMode ? null : helpMode
                  ))
                }}
                promptHelperOpen={promptHelperOpen}
                onTogglePromptHelper={() => setPromptHelperOpen((prev) => !prev)}
                optionalDetailCount={optionalDetailCount}
                onBrowseStartingPoints={openTemplateLibrary}
                onCreateBlankFlow={() => { void createBlankWorkflow({ projectPath: targetProjectPath }) }}
                creatingBlankWorkflow={creatingBlankWorkflow}
                hasProjectTarget={Boolean(targetProjectPath)}
              />
            )}
          />

          <WorkflowCreateDetailsPanel
            open={promptHelperOpen}
            helperRef={promptHelperRef}
            scrollRef={promptHelperScrollRef}
            optionalDetailCount={optionalDetailCount}
            modeConfigFields={selectedModeConfigFields}
            modeConfig={selectedModeConfig}
            onModeConfigChange={handleModeConfigChange}
            promptScaffold={promptScaffold}
            scaffoldPlaceholders={selectedResultMode.scaffoldPlaceholders}
            onPromptScaffoldChange={setPromptScaffold}
            onClearOptionalDetails={clearOptionalDetails}
          />

          {submitError ? (
            <div className="rounded-lg ui-alert-danger text-status-danger">
              {submitError}
            </div>
          ) : null}
        </div>

        <WorkflowCreateSuggestionsSection
          loading={loadingTemplates}
          title={suggestedTemplatesTitle}
          suggestions={suggestedTemplates}
          onBrowseLibrary={openTemplateLibrary}
          onSelectTemplate={handleTemplateSelect}
        />
      </div>

      {unsavedChangesDialog}
      <RouteClarificationDialog
        clarification={routeClarification}
        onClose={() => setRouteClarification(null)}
        onSelect={handleClarificationSelect}
      />
      <PendingTemplateDialog
        pendingTemplate={pendingTemplate}
        pendingQuickStartLabel={pendingQuickStart?.label || null}
        targetProjectPath={targetProjectPath}
        targetProjectName={targetProjectName}
        pendingTemplateIntentLabel={pendingQuickStart?.intentLabel || pendingTemplateCategoryLabel}
        pendingTemplateExecutionSummary={pendingTemplateExecutionSummary}
        openingProject={openingProject}
        templateAction={templateAction}
        pendingPrimaryActionLabel={pendingPrimaryActionLabel}
        onClose={() => setPendingTemplate(null)}
        onOpenProject={() => void handleOpenProject()}
        onCustomize={(template) => { void handleCustomizeTemplate(template) }}
        onCreate={(template) => { void handleCreateFromTemplate(template) }}
      />
    </PageShell>
  )
}
