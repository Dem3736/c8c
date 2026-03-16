import { useCallback, useEffect, useMemo, useState } from "react"
import { useAtom } from "jotai"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  workflowEntryStateAtom,
  workflowSavedSnapshotAtom,
  webSearchBackendAtom,
  workflowsAtom,
  type WorkflowTemplate,
} from "@/lib/store"
import { runStatusAtom } from "@/features/execution"
import { toast } from "sonner"
import {
  Sparkles,
  X,
} from "lucide-react"
import { PageHeader, PageShell } from "@/components/ui/page-shell"
import { CollectionToolbar } from "@/components/ui/collection-toolbar"
import { resolveTemplateWorkflow } from "@/lib/web-search-backend"
import { getTemplateSourceKind, getTemplateSourceLabel } from "@/lib/template-source"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import { STAGE_ORDER, STAGE_META } from "@/lib/template-stages"
import type { WorkflowTemplateStage } from "@shared/types"
import { useWorkflowCreateNavigation } from "@/hooks/useWorkflowCreateNavigation"
import {
  buildTemplateWorkflowEntryState,
  deriveTemplateCardCopy,
  deriveTemplateUseWhen,
} from "@/lib/workflow-entry"
import { getReplaceCurrentWorkflowBlockedReason } from "@/lib/run-guards"

function TemplateCard({
  template,
  isSelected,
  onSelect,
}: {
  template: WorkflowTemplate
  isSelected: boolean
  onSelect: (template: WorkflowTemplate) => void
}) {
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
        <div className="mt-1 flex flex-wrap gap-1">
          <Badge variant="outline" size="compact">
            {STAGE_META[template.stage].label}
          </Badge>
        </div>
        <p className="text-body-sm text-muted-foreground mt-0.5 line-clamp-2">
          {deriveTemplateCardCopy(template)}
        </p>
      </div>
    </Button>
  )
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
  const stageMeta = STAGE_META[template.stage]
  const sourceKind = getTemplateSourceKind(template)
  const sourceLabel = getTemplateSourceLabel(template)

  return (
    <aside className="w-full lg:w-[22rem] lg:max-h-[calc(100vh-var(--titlebar-height)-6rem)] lg:self-start lg:sticky lg:top-0 flex-shrink-0 overflow-hidden rounded-xl surface-panel flex flex-col">
      <header className="border-b border-border px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-control-lg w-control-lg shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-lg">
            <span aria-hidden>{template.emoji}</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-body-md font-semibold text-foreground">{template.name}</h3>
              <Badge variant="outline" size="compact">
                {stageMeta.label}
              </Badge>
            </div>
            <p className="ui-meta-text mt-1 text-muted-foreground">{template.headline}</p>
            {template.description && (
              <p className="mt-2 text-body-sm text-muted-foreground">
                {template.description}
              </p>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="shrink-0"
            aria-label="Close template details"
          >
            <X size={16} />
          </Button>
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
          <div>
            <span className="ui-meta-label text-muted-foreground">Why this flow fits</span>
            <p className="mt-1 text-body-sm text-muted-foreground">{template.how}</p>
          </div>

          <details className="rounded-lg border border-hairline bg-surface-2/50 px-3 py-3">
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
          Open starting point
        </Button>
      </div>
    </aside>
  )
}

export function WorkflowsTemplatesPage() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")
  const [activeStage, setActiveStage] = useState<WorkflowTemplateStage | "all">("all")
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [pendingTemplate, setPendingTemplate] = useState<WorkflowTemplate | null>(null)
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
  const [projects] = useAtom(projectsAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setWorkflowEntryState] = useAtom(workflowEntryStateAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [runStatus] = useAtom(runStatusAtom)
  const [targetProjectPath, setTargetProjectPath] = useState<string | null>(selectedProject)
  const { unsavedChangesDialog } = useUnsavedChangesDialog()
  const { openWorkflowCreate } = useWorkflowCreateNavigation()
  const replaceCurrentBlockedReason = getReplaceCurrentWorkflowBlockedReason(runStatus)

  useEffect(() => {
    if (!pendingTemplate) return
    if (selectedProject && projects.includes(selectedProject)) {
      setTargetProjectPath(selectedProject)
      return
    }
    setTargetProjectPath(projects[0] ?? null)
  }, [pendingTemplate, projects, selectedProject])

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
    return templates.filter((template) =>
      `${template.name} ${template.description} ${template.headline} ${template.how} ${template.stage} ${getTemplateSourceLabel(template)} ${template.marketplaceName || ""}`
        .toLowerCase()
        .includes(q),
    )
  }, [query, templates])

  const filteredTemplates = useMemo(() => {
    if (activeStage === "all") return searchFilteredTemplates
    return searchFilteredTemplates.filter((template) => template.stage === activeStage)
  }, [activeStage, searchFilteredTemplates])

  const selectedTemplate = useMemo(
    () => filteredTemplates.find((t) => t.id === selectedTemplateId) ?? null,
    [filteredTemplates, selectedTemplateId],
  )

  // Group templates by stage for the "all" view
  const groupedTemplates = useMemo(() => {
    if (activeStage !== "all") return null
    const groups: { stage: WorkflowTemplateStage; templates: WorkflowTemplate[] }[] = []
    for (const stage of STAGE_ORDER) {
      const stageTemplates = filteredTemplates.filter((t) => t.stage === stage)
      if (stageTemplates.length > 0) {
        groups.push({ stage, templates: stageTemplates })
      }
    }
    return groups
  }, [activeStage, filteredTemplates])

  const hasActiveFilters = activeStage !== "all" || query.trim().length > 0

  const clearFilters = () => {
    setQuery("")
    setActiveStage("all")
  }

  const confirmApplyTemplate = (template: WorkflowTemplate) => {
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
    const nextWorkflow = resolveTemplateWorkflow(template, webSearchBackend)
    setWorkflow(nextWorkflow)
    setWorkflowEntryState(buildTemplateWorkflowEntryState({
      template: {
        ...template,
        workflow: nextWorkflow,
      },
      workflowPath: selectedWorkflowPath,
    }))
    setMainView("thread")
    setPendingTemplate(null)
    toast.success(`"${template.name}" is ready to run`, {
      action: {
        label: "Undo",
        onClick: () => {
          setWorkflow(previousWorkflow)
          setWorkflowEntryState(null)
        },
      },
    })
  }

  const doCreateFromTemplate = async (template: WorkflowTemplate, projectPath: string) => {
    const nextWorkflow = resolveTemplateWorkflow(template, webSearchBackend)
    try {
      const filePath = await window.api.createWorkflow(projectPath, template.name, nextWorkflow)
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
          ...template,
          workflow: loadedWorkflow,
        },
        workflowPath: filePath,
      }))
      setMainView("thread")
      setPendingTemplate(null)
      toast.success(`"${loadedWorkflow.name || template.name}" is ready in ${projectPath.split(/[\\/]/).pop() || "project"}`)
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
          onSelect={(t) => setSelectedTemplateId(t.id)}
        />
      ))}
    </div>
  )

  return (
    <PageShell>
      <PageHeader
        title="Choose a starting point"
        subtitle="Pick a ready-to-run flow based on the job you need done, then refine it only if you want to."
      />

      <CollectionToolbar
        ariaLabel="Template controls"
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search templates"
        searchAriaLabel="Search templates"
        summary={`${filteredTemplates.length} starting point${filteredTemplates.length === 1 ? "" : "s"}`}
        action={(
          <Button
            size="sm"
            variant="outline"
            onClick={() => openWorkflowCreate()}
            className="shrink-0"
          >
            <Sparkles size={14} />
            Create with Agent
          </Button>
        )}
        filters={(
          <>
          <Button
            variant={activeStage === "all" ? "secondary" : "outline"}
            size="xs"
            onClick={() => setActiveStage("all")}
            aria-pressed={activeStage === "all"}
          >
            All
          </Button>
          {STAGE_ORDER.map((stage) => (
            <Button
              key={stage}
              variant={activeStage === stage ? "secondary" : "outline"}
              size="xs"
              onClick={() => setActiveStage(stage)}
              aria-pressed={activeStage === stage}
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
                No templates match this filter.
              </div>
            ) : groupedTemplates ? (
              <div className="space-y-6">
                {groupedTemplates.map(({ stage, templates: stageTemplates }) => (
                  <div key={stage}>
                    <div className="mb-2">
                      <h3 className="text-body-md font-semibold">{STAGE_META[stage].label}</h3>
                      <p className="ui-meta-text text-muted-foreground">{STAGE_META[stage].description}</p>
                    </div>
                    {renderTemplateGrid(stageTemplates)}
                  </div>
                ))}
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
            <DialogTitle>Open this starting point</DialogTitle>
            <DialogDescription>
              Create a new workflow file, or replace the current draft with &ldquo;{pendingTemplate?.name}&rdquo;.
            </DialogDescription>
          </CanvasDialogHeader>
          <CanvasDialogBody className="space-y-2">
            {projects.length > 0 ? (
              <div className="space-y-1">
                <p className="ui-meta-text text-muted-foreground">Create in project</p>
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
                Add a project in sidebar to create a workflow file from this template.
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
              Create in project
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={Boolean(replaceCurrentBlockedReason)}
              title={replaceCurrentBlockedReason || undefined}
              onClick={() => pendingTemplate && doApplyTemplate(pendingTemplate)}
            >
              Replace current
            </Button>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>
      {unsavedChangesDialog}
    </PageShell>
  )
}
