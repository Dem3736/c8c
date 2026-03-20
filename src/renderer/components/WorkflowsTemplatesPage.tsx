import { useCallback, useEffect, useMemo, useState } from "react"
import { useAtom, useSetAtom } from "jotai"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import {
  Dialog,
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  DialogClose,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  currentWorkflowAtom,
  inputAttachmentsAtom,
  inputValueAtom,
  mainViewAtom,
  projectsAtom,
  selectedResultModeIdAtom,
  selectedInboxTaskKeyAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  setWorkflowTemplateContextForKeyAtom,
  templateLibraryContextAtom,
  workflowCreateDraftPromptAtom,
  workflowCreateModeConfigsAtom,
  workflowCreatePromptScaffoldAtom,
  workflowEntryStateAtom,
  workflowSavedSnapshotAtom,
  webSearchBackendAtom,
  workflowsAtom,
  type WorkflowTemplate,
} from "@/lib/store"
import { runStatusAtom, selectedPastRunAtom } from "@/features/execution"
import { toast } from "sonner"
import { toastError, toastErrorFromCatch } from "@/lib/toast-error"
import {
  FilePlus2,
  Loader2,
  Sparkles,
  X,
} from "lucide-react"
import { PageHeader, PageShell } from "@/components/ui/page-shell"
import { CollectionToolbar } from "@/components/ui/collection-toolbar"
import { resolveTemplateWorkflow } from "@/lib/web-search-backend"
import { getTemplateSourceKind, getTemplateSourceLabel } from "@/lib/template-source"
import {
  getTemplateSearchScore,
  templateMatchesCategory,
  templateMatchesLibraryFilter,
  type TemplateCategoryKey,
  type TemplateLibraryFilterKey,
} from "@/lib/template-filters"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import { useBlankWorkflowCreation } from "@/hooks/useBlankWorkflowCreation"
import { STAGE_ORDER, STAGE_META } from "@/lib/template-stages"
import { useWorkflowCreateNavigation } from "@/hooks/useWorkflowCreateNavigation"
import {
  deriveTemplateCardCopy,
  deriveTemplateExecutionDisciplineLabels,
  deriveTemplateUseWhen,
} from "@/lib/workflow-entry"
import { getWorkflowTemplateDisplayName } from "@/lib/template-display"
import {
  buildResultModeSeedInput,
  countResultModeConfigFields,
  normalizeResultModeConfig,
} from "@/lib/result-mode-config"
import { getResultMode } from "@/lib/result-modes"
import { buildTemplateStartState } from "@/lib/template-start"
import { hasWorkflowCreatePromptContent } from "@/lib/workflow-create-prompt"
import {
  resolveTemplateLibraryProjectPath,
  templateLibraryRequiresProjectCreation,
} from "@/lib/template-library-context"
import { getReplaceCurrentWorkflowBlockedReason } from "@/lib/run-guards"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import type { ResultModeId } from "@shared/types"

function TemplateCard({
  template,
  isSelected,
  onSelect,
}: {
  template: WorkflowTemplate
  isSelected: boolean
  onSelect: (template: WorkflowTemplate) => void
}) {
  const sourceKind = getTemplateSourceKind(template)

  return (
    <Button
      type="button"
      variant="ghost"
      size="bare"
      onClick={() => onSelect(template)}
      className={`ui-interactive-card w-full !items-start !justify-start gap-3 rounded-lg surface-panel p-4 text-left !whitespace-normal ui-transition-colors ui-motion-fast ${
        isSelected ? "ring-2 ring-foreground/20 bg-surface-3" : ""
      }`}
    >
      <span className="text-xl flex-shrink-0 mt-0.5" aria-hidden>{template.emoji}</span>
      <div className="min-w-0 flex-1">
        <h3 className="text-body-md font-semibold">{template.headline}</h3>
        <p className="text-body-sm text-muted-foreground mt-1 line-clamp-2">
          {deriveTemplateCardCopy(template)}
        </p>
        {(sourceKind === "plugin" || sourceKind === "user" || sourceKind === "hub") && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="secondary" size="compact">
              {getTemplateSourceLabel(template)}
            </Badge>
          </div>
        )}
      </div>
    </Button>
  )
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

function TemplateCategoryCard({
  label,
  summary,
  count,
  selected,
  onSelect,
}: {
  label: string
  summary: string
  count: number
  selected: boolean
  onSelect: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="bare"
      onClick={onSelect}
      className={`ui-interactive-card-subtle h-full w-full !flex-col !items-start !justify-start rounded-xl px-4 py-4 text-left !whitespace-normal ${
        selected ? "surface-inset-card ring-2 ring-foreground/15 shadow-inset-highlight" : "surface-panel"
      }`}
      aria-pressed={selected}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div>
          <h3 className="text-body-md font-semibold text-foreground">{label}</h3>
          <p className="mt-1 ui-meta-text text-muted-foreground">{count} shown</p>
        </div>
      </div>
      <p className="mt-3 text-body-sm text-muted-foreground">{summary}</p>
    </Button>
  )
}

const TEMPLATE_CATEGORY_ORDER: TemplateCategoryKey[] = [
  "all",
  "product",
  "marketing",
  "content",
]

const TEMPLATE_CATEGORY_META: Record<TemplateCategoryKey, {
  label: string
  summary: string
  detail?: string
}> = {
  all: {
    label: "All",
    summary: "See the whole library first, then narrow it only if that helps.",
  },
  product: {
    label: "Development",
    summary: "Repo work, specs, implementation planning, UI polish, and software audits.",
  },
  marketing: {
    label: "Marketing",
    summary: "Research, positioning, trend, SEO, funnel, and campaign work.",
  },
  content: {
    label: "Content",
    summary: "Texts, publishing systems, course work, and launch assets.",
  },
}

function deriveCreateModeId(
  activeCategory: TemplateCategoryKey,
  fallbackModeId: ResultModeId,
  selectedTemplate: WorkflowTemplate | null,
): ResultModeId {
  if (selectedTemplate?.pack?.id === "courses-factory-alpha") return "courses"
  if (activeCategory === "product") return "development"
  if (activeCategory === "marketing") return "content"
  if (activeCategory === "content") return "courses"
  return fallbackModeId
}

function TemplateDetailPanel({
  template,
  onUse,
  disabled,
  onClose,
}: {
  template: WorkflowTemplate
  onUse: (template: WorkflowTemplate) => void
  disabled?: boolean
  onClose: () => void
}) {
  const sourceKind = getTemplateSourceKind(template)
  const sourceLabel = getTemplateSourceLabel(template)
  const disciplineLabels = deriveTemplateExecutionDisciplineLabels(template)
  const executionSummary = template.executionPolicy?.summary?.trim()
    || (disciplineLabels.length > 0 ? disciplineLabels.join(", ") : null)
  const executionDescription = template.executionPolicy?.description?.trim() || null

  return (
    <aside className="w-full lg:w-[22rem] lg:max-h-[calc(100vh-var(--titlebar-height)-6rem)] lg:self-start lg:sticky lg:top-0 flex-shrink-0 overflow-hidden rounded-xl surface-panel flex flex-col">
      <header className="border-b border-border px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="surface-inset-card flex h-control-lg w-control-lg shrink-0 items-center justify-center p-0 text-lg">
            <span aria-hidden>{template.emoji}</span>
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-body-md font-semibold text-foreground">{getWorkflowTemplateDisplayName(template)}</h3>
            <p className="ui-meta-text mt-1 text-muted-foreground">{template.headline}</p>
            {template.description && (
              <p className="mt-2 text-body-sm text-muted-foreground">
                {template.description}
              </p>
            )}
            {(sourceKind === "plugin" || sourceKind === "user" || sourceKind === "hub") && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="secondary" size="compact">{sourceLabel}</Badge>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="ui-icon-button shrink-0"
            aria-label="Close details"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="border-b border-border px-4 py-3 space-y-3">
        <div>
          <span className="ui-meta-label text-muted-foreground">Best when</span>
          <p className="mt-1 text-body-sm">{deriveTemplateUseWhen(template)}</p>
        </div>
        <div>
          <span className="ui-meta-label text-muted-foreground">You'll give</span>
          <p className="mt-1 text-body-sm">{template.input}</p>
        </div>
        <div>
          <span className="ui-meta-label text-muted-foreground">You'll get</span>
          <p className="mt-1 text-body-sm">{template.output}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto ui-scroll-region px-4 py-4">
        <div className="space-y-4">
          {(executionSummary || executionDescription) && (
            <div>
              <span className="ui-meta-label text-muted-foreground">Flow rules</span>
              {executionSummary ? (
                <p className="mt-1 text-body-sm text-foreground">{executionSummary}</p>
              ) : null}
              {executionDescription && executionDescription !== executionSummary ? (
                <p className="mt-2 text-body-sm text-muted-foreground">{executionDescription}</p>
              ) : null}
            </div>
          )}

          {template.how ? (
            <DisclosurePanel summary="Why this start works">
              <p className="mt-3 text-body-sm text-muted-foreground">{template.how}</p>
            </DisclosurePanel>
          ) : null}

          <DisclosurePanel summary="Inside this flow">
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-body-sm text-muted-foreground">
              {template.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </DisclosurePanel>

          {(sourceKind === "plugin" || sourceKind === "user" || sourceKind === "hub") && (
            <div>
              <span className="ui-meta-label text-muted-foreground">Source</span>
              <p className="mt-1 text-body-sm">
                {sourceLabel}
                {template.marketplaceName ? ` via ${template.marketplaceName}` : ""}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border px-4 py-3">
        <Button size="sm" onClick={() => onUse(template)} disabled={disabled} className="w-full">
          Start with this
        </Button>
      </div>
    </aside>
  )
}

export function WorkflowsTemplatesPage() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState<TemplateCategoryKey>("all")
  const [activeFilter, setActiveFilter] = useState<TemplateLibraryFilterKey>("all")
  const [selectedResultModeId] = useAtom(selectedResultModeIdAtom)
  const [draftPrompt] = useAtom(workflowCreateDraftPromptAtom)
  const [modeConfigs] = useAtom(workflowCreateModeConfigsAtom)
  const [promptScaffold] = useAtom(workflowCreatePromptScaffoldAtom)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [pendingTemplate, setPendingTemplate] = useState<WorkflowTemplate | null>(null)
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const [, setInputAttachments] = useAtom(inputAttachmentsAtom)
  const [, setInputValue] = useAtom(inputValueAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
  const [projects] = useAtom(projectsAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setSelectedInboxTaskKey] = useAtom(selectedInboxTaskKeyAtom)
  const [templateLibraryContext, setTemplateLibraryContext] = useAtom(templateLibraryContextAtom)
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const [, setWorkflowEntryState] = useAtom(workflowEntryStateAtom)
  const setWorkflowTemplateContextForKey = useSetAtom(setWorkflowTemplateContextForKeyAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [runStatus] = useAtom(runStatusAtom)
  const [targetProjectPath, setTargetProjectPath] = useState<string | null>(selectedProject)
  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()
  const { openWorkflowCreate } = useWorkflowCreateNavigation()
  const { createBlankWorkflow, creatingBlankWorkflow } = useBlankWorkflowCreation({ confirmDiscard })
  const replaceCurrentBlockedReason = getReplaceCurrentWorkflowBlockedReason(runStatus)
  const preferredProjectPath = useMemo(
    () => resolveTemplateLibraryProjectPath(projects, selectedProject, templateLibraryContext),
    [projects, selectedProject, templateLibraryContext],
  )
  const createInProjectOnly = templateLibraryRequiresProjectCreation(templateLibraryContext)

  useEffect(() => {
    return () => {
      setTemplateLibraryContext(null)
    }
  }, [setTemplateLibraryContext])

  useEffect(() => {
    if (!pendingTemplate) return
    setTargetProjectPath(preferredProjectPath)
  }, [pendingTemplate, preferredProjectPath])

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    try {
      // Trigger background catalog refresh, then load templates
      void window.api.refreshCatalog().catch(() => undefined)
      const loaded = await window.api.listTemplates()
      setTemplates(loaded)
    } catch (error) {
      toastErrorFromCatch("Could not load library", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  const searchFilteredTemplates = useMemo(() => {
    const q = query.trim()
    if (!q) return templates

    return templates
      .map((template, index) => ({
        template,
        index,
        score: getTemplateSearchScore(template, q, getTemplateSourceLabel(template)),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((entry) => entry.template)
  }, [query, templates])

  const categoryFilteredTemplates = useMemo(() => (
    searchFilteredTemplates.filter((template) => templateMatchesCategory(template, activeCategory))
  ), [activeCategory, searchFilteredTemplates])

  const availableStageFilters = useMemo(() => (
    STAGE_ORDER
      .map((stage) => ({
        stage,
        count: categoryFilteredTemplates.filter((template) => template.stage === stage).length,
      }))
      .filter((entry) => entry.count > 0)
  ), [categoryFilteredTemplates])

  const filteredTemplates = useMemo(() => {
    return categoryFilteredTemplates.filter((template) => templateMatchesLibraryFilter(template, activeFilter))
  }, [activeFilter, categoryFilteredTemplates])

  const selectedTemplate = useMemo(
    () => filteredTemplates.find((t) => t.id === selectedTemplateId) ?? null,
    [filteredTemplates, selectedTemplateId],
  )

  const categoryCounts = useMemo(() => (
    Object.fromEntries(
      TEMPLATE_CATEGORY_ORDER.map((category) => [
        category,
        searchFilteredTemplates.filter((template) => templateMatchesCategory(template, category)).length,
      ]),
    ) as Record<TemplateCategoryKey, number>
  ), [searchFilteredTemplates])

  const selectedCategoryMeta = TEMPLATE_CATEGORY_META[activeCategory]
  const createModeId = useMemo(
    () => deriveCreateModeId(activeCategory, selectedResultModeId, selectedTemplate),
    [activeCategory, selectedResultModeId, selectedTemplate],
  )
  const selectedResultMode = useMemo(
    () => getResultMode(selectedResultModeId),
    [selectedResultModeId],
  )
  const selectedModeConfig = useMemo(
    () => normalizeResultModeConfig(selectedResultModeId, modeConfigs[selectedResultModeId]),
    [modeConfigs, selectedResultModeId],
  )
  const selectedModeConfigFieldCount = useMemo(
    () => countResultModeConfigFields(selectedResultModeId, selectedModeConfig),
    [selectedModeConfig, selectedResultModeId],
  )
  const requestedResult = useMemo(() => {
    if (!templateLibraryContext) return ""
    const canSeedIntent = hasWorkflowCreatePromptContent(draftPrompt, promptScaffold)
      || selectedModeConfigFieldCount > 0
    if (!canSeedIntent) return ""
    return buildResultModeSeedInput(
      selectedResultMode,
      selectedModeConfig,
      draftPrompt,
      promptScaffold,
    )
  }, [
    draftPrompt,
    promptScaffold,
    selectedModeConfig,
    selectedModeConfigFieldCount,
    selectedResultMode,
    templateLibraryContext,
  ])
  const hasActiveFilters = activeCategory !== "all" || activeFilter !== "all" || query.trim().length > 0

  useEffect(() => {
    if (selectedTemplateId === null) return
    if (filteredTemplates.some((template) => template.id === selectedTemplateId)) return
    setSelectedTemplateId(null)
  }, [filteredTemplates, selectedTemplateId])

  useEffect(() => {
    if (activeFilter === "all") return
    if (availableStageFilters.some((entry) => entry.stage === activeFilter)) return
    setActiveFilter("all")
  }, [activeFilter, availableStageFilters])

  const clearFilters = () => {
    setQuery("")
    setActiveCategory("all")
    setActiveFilter("all")
  }

  const confirmApplyTemplate = (template: WorkflowTemplate) => {
    if (createInProjectOnly) {
      if (!preferredProjectPath) {
        toastError("Open or select a project before starting here")
        return
      }
      void doCreateFromTemplate(template, preferredProjectPath)
      return
    }

    const nextWorkflow = resolveTemplateWorkflow(template, webSearchBackend)
    const replacingCurrent = JSON.stringify(workflow) !== JSON.stringify(nextWorkflow)
    if (replacingCurrent) {
      setPendingTemplate(template)
      return
    }
    doApplyTemplate(template)
  }

  const doApplyTemplate = async (template: WorkflowTemplate) => {
    if (replaceCurrentBlockedReason) {
      toastError("Cannot replace the current flow while a run is active", {
        description: replaceCurrentBlockedReason,
      })
      return
    }

    const resolved = await resolveHubTemplate(template)
    const previousWorkflow = structuredClone(workflow)
    const templateForWorkflowUse = normalizeTemplateForWorkflowUse(resolved)
    const nextWorkflow = resolveTemplateWorkflow(templateForWorkflowUse, webSearchBackend)
    const templateStartState = buildTemplateStartState({
      template: {
        ...templateForWorkflowUse,
        workflow: nextWorkflow,
      },
      workflowPath: selectedWorkflowPath,
      projectPath: preferredProjectPath,
      requestedResult,
    })
    const workflowKey = toWorkflowExecutionKey(selectedWorkflowPath)
    setWorkflow(nextWorkflow)
    setInputValue(templateStartState.initialInputValue)
    setInputAttachments(templateStartState.initialAttachments)
    setWorkflowEntryState(templateStartState.entryState)
    setWorkflowTemplateContextForKey({
      key: workflowKey,
      context: templateStartState.templateContext,
    })
    setMainView("thread")
    setPendingTemplate(null)
    toast.success(`"${templateForWorkflowUse.name}" is ready in the current flow`, {
      action: {
        label: "Undo",
        onClick: () => {
          setWorkflow(previousWorkflow)
          setWorkflowEntryState(null)
          setWorkflowTemplateContextForKey({ key: workflowKey, context: null })
        },
      },
    })
  }

  const doCreateFromTemplate = async (template: WorkflowTemplate, projectPath: string) => {
    const resolved = await resolveHubTemplate(template)
    const templateForWorkflowUse = normalizeTemplateForWorkflowUse(resolved)
    const nextWorkflow = resolveTemplateWorkflow(templateForWorkflowUse, webSearchBackend)
    try {
      const filePath = await window.api.createWorkflow(projectPath, templateForWorkflowUse.name, nextWorkflow)
      const loadedWorkflow = await window.api.loadWorkflow(filePath)
      const templateStartState = buildTemplateStartState({
        template: {
          ...templateForWorkflowUse,
          workflow: loadedWorkflow,
        },
        workflowPath: filePath,
        projectPath,
        requestedResult,
      })
      const refreshed = await window.api.listProjectWorkflows(projectPath)
      await window.api.recordProjectTemplateUsage(projectPath, template.id).catch(() => undefined)
      setWorkflows(refreshed)
      setSelectedProject(projectPath)
      setSelectedWorkflowPath(filePath)
      setSelectedInboxTaskKey(null)
      setWorkflow(loadedWorkflow)
      setInputValue(templateStartState.initialInputValue)
      setInputAttachments(templateStartState.initialAttachments)
      setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
      setSelectedPastRun(null)
      setWorkflowEntryState(templateStartState.entryState)
      setWorkflowTemplateContextForKey({
        key: toWorkflowExecutionKey(filePath),
        context: templateStartState.templateContext,
      })
      setMainView("thread")
      setPendingTemplate(null)
      toast.success(`"${loadedWorkflow.name || templateForWorkflowUse.name}" is ready in ${projectPath.split(/[\\/]/).pop() || "project"}`)
    } catch (error) {
      toastErrorFromCatch("Could not create flow", error)
    }
  }

  const renderTemplateGrid = (items: WorkflowTemplate[]) => (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {items.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          isSelected={selectedTemplateId === template.id}
          onSelect={(t) => setSelectedTemplateId((current) => (current === t.id ? null : t.id))}
        />
      ))}
    </div>
  )

  const headerActions = (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => void createBlankWorkflow({ projectPath: preferredProjectPath })}
        disabled={creatingBlankWorkflow}
      >
        {creatingBlankWorkflow ? <Loader2 size={14} className="animate-spin" /> : <FilePlus2 size={14} />}
        Blank flow
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => openWorkflowCreate({
          modeId: templateLibraryContext ? selectedResultModeId : createModeId,
          projectPath: preferredProjectPath,
          locked: createInProjectOnly,
          prompt: templateLibraryContext ? draftPrompt : "",
        })}
      >
        <Sparkles size={14} />
        Create with agent
      </Button>
    </>
  )

  return (
    <PageShell>
      <PageHeader
        title="Library"
        subtitle="Choose how to begin, or open a blank flow only if you need full control."
        actions={headerActions}
      />

      <section aria-label="Library categories" className="overflow-hidden rounded-xl surface-elevated">
        <div className="border-b border-hairline/70 px-4 py-4 sm:px-5">
          <p className="section-kicker">Library</p>
          <h2 className="mt-1 ui-title-text text-foreground">Browse the library</h2>
          <p className="mt-2 text-body-sm text-muted-foreground">
            Start broad, then narrow the list only if it helps.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {TEMPLATE_CATEGORY_ORDER.map((category) => {
              const meta = TEMPLATE_CATEGORY_META[category]
              return (
                <TemplateCategoryCard
                  key={category}
                  label={meta.label}
                  summary={meta.summary}
                  count={categoryCounts[category]}
                  selected={activeCategory === category}
                  onSelect={() => setActiveCategory(category)}
                />
              )
            })}
          </div>
        </div>
        <div className="px-4 py-4 sm:px-5">
          <div className="surface-inset-card flex flex-col gap-3 px-3 py-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <p className="ui-meta-label text-muted-foreground">{selectedCategoryMeta.label}</p>
              <p className="text-body-sm text-foreground">{selectedCategoryMeta.summary}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableStageFilters.map((entry) => (
                <Badge key={entry.stage} variant="outline" size="compact">
                  {STAGE_META[entry.stage].label}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </section>

      <CollectionToolbar
        ariaLabel="Library controls"
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search templates"
        searchAriaLabel="Search templates"
        summary={`${filteredTemplates.length} flow${filteredTemplates.length === 1 ? "" : "s"}`}
        filters={(
          <>
            <span className="ui-meta-text hidden text-muted-foreground lg:inline-flex">
              {activeCategory === "all"
                ? "Narrow by work type"
                : `Narrow ${selectedCategoryMeta.label.toLowerCase()} flows`}
            </span>
            <Button
              variant={activeFilter === "all" ? "secondary" : "outline"}
              size="xs"
              onClick={() => setActiveFilter("all")}
              aria-pressed={activeFilter === "all"}
            >
              All kinds
            </Button>
            {availableStageFilters.map(({ stage }) => (
              <Button
                key={stage}
                variant={activeFilter === stage ? "secondary" : "outline"}
                size="xs"
                onClick={() => setActiveFilter(stage)}
                aria-pressed={activeFilter === stage}
              >
                {STAGE_META[stage].label}
              </Button>
            ))}
            {hasActiveFilters && (
              <Button variant="ghost" size="xs" onClick={clearFilters}>
                <X size={12} />
                Clear
              </Button>
            )}
          </>
        )}
      />

      <section aria-busy={loading} aria-live="polite">
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* Main grid */}
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div key={`skeleton-${idx}`} className="rounded-lg surface-panel p-4 flex items-start gap-3" aria-hidden="true">
                    <Skeleton className="h-6 w-6 flex-shrink-0" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="rounded-lg surface-panel ui-empty-state px-4 text-body-sm text-muted-foreground">
                {activeCategory === "all"
                  ? "No library flows match these filters."
                  : `No ${selectedCategoryMeta.label.toLowerCase()} flows match these filters.`}
              </div>
            ) : (
              renderTemplateGrid(filteredTemplates)
            )}
          </div>

          {/* Side panel */}
          {selectedTemplate && (
            <TemplateDetailPanel
              template={selectedTemplate}
              onUse={confirmApplyTemplate}
              disabled={projects.length === 0}
              onClose={() => setSelectedTemplateId(null)}
            />
          )}
        </div>
      </section>

      <Dialog open={pendingTemplate !== null} onOpenChange={(open) => !open && setPendingTemplate(null)}>
        <CanvasDialogContent showCloseButton={false} size="lg">
          <CanvasDialogHeader>
            <DialogTitle>Start with this</DialogTitle>
            <DialogDescription>
              &ldquo;{pendingTemplate ? getWorkflowTemplateDisplayName(pendingTemplate) : ""}&rdquo; is ready. Pick whether to create it in the selected project or replace the current draft.
            </DialogDescription>
          </CanvasDialogHeader>
          <CanvasDialogBody className="space-y-2">
            {projects.length > 0 ? (
              <div className="space-y-1">
                <p className="ui-meta-text text-muted-foreground">Selected project</p>
                <Select
                  value={targetProjectPath ?? ""}
                  onValueChange={(value) => setTargetProjectPath(value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((projectPath) => {
                      const projectName = projectPath.split(/[\\/]/).pop() || projectPath
                      return (
                        <SelectItem key={projectPath} value={projectPath}>
                          {projectName}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-body-sm text-muted-foreground">
                Add a project in the sidebar to create this flow there.
              </p>
            )}
          </CanvasDialogBody>
          <CanvasDialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              disabled={!targetProjectPath}
              onClick={() => pendingTemplate && targetProjectPath && void doCreateFromTemplate(pendingTemplate, targetProjectPath)}
            >
              Create in selected project
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={Boolean(replaceCurrentBlockedReason)}
              title={replaceCurrentBlockedReason || undefined}
              onClick={() => pendingTemplate && doApplyTemplate(pendingTemplate)}
            >
              Replace current draft
            </Button>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>
      {unsavedChangesDialog}
    </PageShell>
  )
}
