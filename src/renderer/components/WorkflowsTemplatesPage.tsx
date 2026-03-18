import { useCallback, useEffect, useMemo, useState } from "react"
import { useAtom, useSetAtom } from "jotai"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
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
  mainViewAtom,
  projectsAtom,
  selectedResultModeIdAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  setWorkflowTemplateContextForKeyAtom,
  templateLibraryContextAtom,
  workflowEntryStateAtom,
  workflowSavedSnapshotAtom,
  webSearchBackendAtom,
  workflowsAtom,
  type WorkflowTemplate,
} from "@/lib/store"
import { runStatusAtom } from "@/features/execution"
import { toast } from "sonner"
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
  buildTemplateSearchText,
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
  buildTemplateRunContext,
  buildTemplateWorkflowEntryState,
  deriveTemplateCardCopy,
  deriveTemplateExecutionDisciplineLabels,
  deriveTemplateUseWhen,
} from "@/lib/workflow-entry"
import { getWorkflowTemplateDisplayName } from "@/lib/template-display"
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
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="outline" size="compact">
            {STAGE_META[template.stage].shortLabel}
          </Badge>
          {(sourceKind === "plugin" || sourceKind === "user") && (
            <Badge variant="secondary" size="compact">
              {getTemplateSourceLabel(template)}
            </Badge>
          )}
        </div>
      </div>
    </Button>
  )
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
        {selected ? (
          <Badge variant="secondary" size="compact">
            Selected
          </Badge>
        ) : null}
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
  detail: string
}> = {
  all: {
    label: "All templates",
    summary: "See the whole library first, then narrow it only if that helps.",
    detail: "Product, Marketing, and Content overlap on purpose, so edge-case workflows stay discoverable.",
  },
  product: {
    label: "Product",
    summary: "Development, research, design, QA, and ship work.",
    detail: "Use this for repo mapping, specs, implementation planning, UI polish, and software audits.",
  },
  marketing: {
    label: "Marketing",
    summary: "Research, positioning, trend, SEO, funnel, and audit workflows.",
    detail: "This includes segment work, messaging, GTM research, landing-page work, and other growth loops.",
  },
  content: {
    label: "Content",
    summary: "Texts, publishing systems, course-shaped flows, and launch assets.",
    detail: "Use this for post pipelines, copy cleanup, editorial systems, curriculum work, and other publish-ready outputs.",
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
  const stageLabel = STAGE_META[template.stage].label
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
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="outline" size="compact">{stageLabel}</Badge>
              {(sourceKind === "plugin" || sourceKind === "user") && (
                <Badge variant="secondary" size="compact">{sourceLabel}</Badge>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="ui-icon-button shrink-0"
            aria-label="Close template details"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="border-b border-border px-4 py-3 space-y-3">
        <div>
          <span className="ui-meta-label text-muted-foreground">Use this when</span>
          <p className="mt-1 text-body-sm">{deriveTemplateUseWhen(template)}</p>
        </div>
        <div>
          <span className="ui-meta-label text-muted-foreground">You provide</span>
          <p className="mt-1 text-body-sm">{template.input}</p>
        </div>
        <div>
          <span className="ui-meta-label text-muted-foreground">You get</span>
          <p className="mt-1 text-body-sm">{template.output}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto ui-scroll-region px-4 py-4">
        <div className="space-y-4">
          {(executionSummary || executionDescription) && (
            <div>
              <span className="ui-meta-label text-muted-foreground">Working style</span>
              {executionSummary ? (
                <p className="mt-1 text-body-sm text-foreground">{executionSummary}</p>
              ) : null}
              {executionDescription && executionDescription !== executionSummary ? (
                <p className="mt-2 text-body-sm text-muted-foreground">{executionDescription}</p>
              ) : null}
            </div>
          )}

          <div>
            <span className="ui-meta-label text-muted-foreground">Why this flow fits</span>
            <p className="mt-1 text-body-sm text-muted-foreground">{template.how}</p>
          </div>

          <details className="rounded-lg surface-soft px-3 py-3">
            <summary className="cursor-pointer list-none text-body-sm font-medium text-foreground">
              See the flow structure
            </summary>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-body-sm text-muted-foreground">
              {template.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </details>

          {(sourceKind === "plugin" || sourceKind === "user") && (
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
          Use template
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
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [pendingTemplate, setPendingTemplate] = useState<WorkflowTemplate | null>(null)
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
  const [projects] = useAtom(projectsAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [templateLibraryContext, setTemplateLibraryContext] = useAtom(templateLibraryContextAtom)
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
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
      const loaded = await window.api.listTemplates()
      setTemplates(loaded)
    } catch (error) {
      toast.error(`Failed to load templates: ${String(error)}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  const searchFilteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return templates
    return templates.filter((template) => buildTemplateSearchText(template, getTemplateSourceLabel(template)).includes(q))
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
        toast.error("Open or select a project before using a template")
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

  const doApplyTemplate = (template: WorkflowTemplate) => {
    if (replaceCurrentBlockedReason) {
      toast.error("Cannot replace the current workflow while a run is active", {
        description: replaceCurrentBlockedReason,
      })
      return
    }

    const previousWorkflow = structuredClone(workflow)
    const templateForWorkflowUse = normalizeTemplateForWorkflowUse(template)
    const nextWorkflow = resolveTemplateWorkflow(templateForWorkflowUse, webSearchBackend)
    const workflowKey = toWorkflowExecutionKey(selectedWorkflowPath)
    setWorkflow(nextWorkflow)
    setWorkflowEntryState(buildTemplateWorkflowEntryState({
      template: {
        ...templateForWorkflowUse,
        workflow: nextWorkflow,
      },
      workflowPath: selectedWorkflowPath,
    }))
    setWorkflowTemplateContextForKey({
      key: workflowKey,
      context: buildTemplateRunContext({
        template: {
          ...templateForWorkflowUse,
          workflow: nextWorkflow,
        },
        workflowPath: selectedWorkflowPath,
      }),
    })
    setMainView("thread")
    setPendingTemplate(null)
    toast.success(`"${templateForWorkflowUse.name}" is ready to run`, {
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
    const templateForWorkflowUse = normalizeTemplateForWorkflowUse(template)
    const nextWorkflow = resolveTemplateWorkflow(templateForWorkflowUse, webSearchBackend)
    try {
      const filePath = await window.api.createWorkflow(projectPath, templateForWorkflowUse.name, nextWorkflow)
      const loadedWorkflow = await window.api.loadWorkflow(filePath)
      const refreshed = await window.api.listProjectWorkflows(projectPath)
      await window.api.recordProjectTemplateUsage(projectPath, template.id).catch(() => undefined)
      setWorkflows(refreshed)
      setSelectedProject(projectPath)
      setSelectedWorkflowPath(filePath)
      setWorkflow(loadedWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
      setWorkflowEntryState(buildTemplateWorkflowEntryState({
        template: {
          ...templateForWorkflowUse,
          workflow: loadedWorkflow,
        },
        workflowPath: filePath,
      }))
      setWorkflowTemplateContextForKey({
        key: toWorkflowExecutionKey(filePath),
        context: buildTemplateRunContext({
          template: {
            ...templateForWorkflowUse,
            workflow: loadedWorkflow,
          },
          workflowPath: filePath,
        }),
      })
      setMainView("thread")
      setPendingTemplate(null)
      toast.success(`"${loadedWorkflow.name || templateForWorkflowUse.name}" is ready in ${projectPath.split(/[\\/]/).pop() || "project"}`)
    } catch (error) {
      toast.error(`Failed to create workflow: ${String(error)}`)
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
        Blank workflow
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => openWorkflowCreate({
          modeId: createModeId,
          projectPath: preferredProjectPath,
          locked: createInProjectOnly,
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
        title="Templates"
        subtitle="Browse workflow templates for a concrete starting point, or start from blank if you want to build the flow yourself."
        actions={headerActions}
      />

      <section aria-label="Template categories" className="overflow-hidden rounded-xl surface-elevated">
        <div className="border-b border-hairline/70 px-4 py-4 sm:px-5">
          <p className="section-kicker">Template categories</p>
          <h2 className="mt-1 ui-title-text text-foreground">Browse by category</h2>
          <p className="mt-2 text-body-sm text-muted-foreground">
            Categories overlap on purpose. Start broad, then refine by workflow stage only if it helps.
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
              <p className="text-body-sm text-muted-foreground">{selectedCategoryMeta.detail}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableStageFilters.map((entry) => (
                <Badge key={entry.stage} variant="outline" size="compact">
                  {STAGE_META[entry.stage].shortLabel}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </section>

      <CollectionToolbar
        ariaLabel="Template controls"
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search templates"
        searchAriaLabel="Search templates"
        summary={`${filteredTemplates.length} template${filteredTemplates.length === 1 ? "" : "s"}`}
        filters={(
          <>
            <span className="ui-meta-text hidden text-muted-foreground lg:inline-flex">
              {activeCategory === "all"
                ? "Refine by workflow stage"
                : `Refine ${selectedCategoryMeta.label.toLowerCase()} templates`}
            </span>
            <Button
              variant={activeFilter === "all" ? "secondary" : "outline"}
              size="xs"
              onClick={() => setActiveFilter("all")}
              aria-pressed={activeFilter === "all"}
            >
              All stages
            </Button>
            {availableStageFilters.map(({ stage }) => (
              <Button
                key={stage}
                variant={activeFilter === stage ? "secondary" : "outline"}
                size="xs"
                onClick={() => setActiveFilter(stage)}
                aria-pressed={activeFilter === stage}
              >
                {STAGE_META[stage].shortLabel}
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
                  ? "No templates match these filters."
                  : `No ${selectedCategoryMeta.label.toLowerCase()} templates match these filters.`}
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
        <CanvasDialogContent showCloseButton={false}>
          <CanvasDialogHeader>
            <DialogTitle>Use this template</DialogTitle>
            <DialogDescription>
              &ldquo;{pendingTemplate ? getWorkflowTemplateDisplayName(pendingTemplate) : ""}&rdquo; is ready to use. Pick whether to open it in the selected project or reuse the current draft.
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
                Add a project in the sidebar to use this template there.
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
              Use in selected project
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={Boolean(replaceCurrentBlockedReason)}
              title={replaceCurrentBlockedReason || undefined}
              onClick={() => pendingTemplate && doApplyTemplate(pendingTemplate)}
            >
              Use current draft
            </Button>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>
      {unsavedChangesDialog}
    </PageShell>
  )
}
