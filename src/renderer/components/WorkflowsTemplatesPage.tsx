import { useCallback, useEffect, useMemo, useState } from "react"
import { useAtom } from "jotai"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  workflowDirtyAtom,
  workflowSavedSnapshotAtom,
  webSearchBackendAtom,
  workflowsAtom,
  generateDialogOpenAtom,
  type WorkflowTemplate,
} from "@/lib/store"
import { toast } from "sonner"
import {
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react"
import { PageHeader, PageShell } from "@/components/ui/page-shell"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import { resolveTemplateWorkflow } from "@/lib/web-search-backend"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import { STAGE_ORDER, STAGE_META } from "@/lib/template-stages"
import type { WorkflowTemplateStage } from "@shared/types"

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
    <button
      type="button"
      onClick={() => onSelect(template)}
      className={`ui-interactive-card rounded-lg surface-panel p-4 flex items-start gap-3 text-left ui-transition-colors ui-motion-fast ${
        isSelected ? "ring-2 ring-foreground/20 bg-surface-3" : ""
      }`}
    >
      <span className="text-xl flex-shrink-0 mt-0.5" aria-hidden>{template.emoji}</span>
      <div className="min-w-0 flex-1">
        <h3 className="text-body-md font-semibold">{template.headline}</h3>
        <p className="text-body-sm text-muted-foreground mt-0.5 line-clamp-2">
          {template.how}
        </p>
      </div>
    </button>
  )
}

function TemplateDetailPanel({
  template,
  onUse,
  disabled,
}: {
  template: WorkflowTemplate
  onUse: (template: WorkflowTemplate) => void
  disabled?: boolean
}) {
  return (
    <aside className="w-[320px] flex-shrink-0 rounded-lg surface-panel p-4 overflow-y-auto ui-scroll-region space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden>{template.emoji}</span>
          <h3 className="text-body-md font-semibold">{template.name}</h3>
        </div>
        <Badge variant="outline" className="mt-2">
          {STAGE_META[template.stage].label}
        </Badge>
        {template.description && (
          <p className="text-body-sm text-muted-foreground mt-2">
            {template.description}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <span className="ui-meta-label text-muted-foreground">You provide</span>
          <p className="text-body-sm mt-0.5">{template.input}</p>
        </div>
        <div>
          <span className="ui-meta-label text-muted-foreground">You get</span>
          <p className="text-body-sm mt-0.5">{template.output}</p>
        </div>
      </div>

      <div>
        <span className="ui-meta-label text-muted-foreground">How it works</span>
        <ol className="list-decimal list-inside space-y-1 mt-1">
          {template.steps.map((step, i) => (
            <li key={i} className="text-body-sm">{step}</li>
          ))}
        </ol>
      </div>

      <Button size="sm" onClick={() => onUse(template)} disabled={disabled} className="w-full">
        Use template
      </Button>
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
  const [workflowDirty] = useAtom(workflowDirtyAtom)
  const [projects] = useAtom(projectsAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [workflows, setWorkflows] = useAtom(workflowsAtom)
  const [, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [, setGenerateDialogOpen] = useAtom(generateDialogOpenAtom)
  const [targetProjectPath, setTargetProjectPath] = useState<string | null>(selectedProject)
  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()

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
      `${template.name} ${template.description} ${template.headline} ${template.how} ${template.stage}`
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
    const previousWorkflow = structuredClone(workflow)
    const nextWorkflow = resolveTemplateWorkflow(template, webSearchBackend)
    setWorkflow(nextWorkflow)
    setMainView("thread")
    setPendingTemplate(null)
    toast.success(`Template "${template.name}" applied`, {
      action: {
        label: "Undo",
        onClick: () => setWorkflow(previousWorkflow),
      },
    })
  }

  const doCreateFromTemplate = async (template: WorkflowTemplate, projectPath: string) => {
    const nextWorkflow = resolveTemplateWorkflow(template, webSearchBackend)
    try {
      const filePath = await window.api.createWorkflow(projectPath, template.name, nextWorkflow)
      const loadedWorkflow = await window.api.loadWorkflow(filePath)
      const refreshed = await window.api.listProjectWorkflows(projectPath)
      setWorkflows(refreshed)
      setSelectedProject(projectPath)
      setSelectedWorkflowPath(filePath)
      setWorkflow(loadedWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
      setMainView("thread")
      setPendingTemplate(null)
      toast.success(`Created "${loadedWorkflow.name || template.name}" from template`)
    } catch (error) {
      toast.error(`Failed to create workflow: ${String(error)}`)
    }
  }

  const createWorkflow = async () => {
    if (!selectedProject) {
      toast("Select a project in Projects first")
      return
    }

    if (!(await confirmDiscard("create a new workflow", workflowDirty))) {
      return
    }

    const existingNames = new Set(workflows.map((item) => item.name.toLowerCase()))
    let index = 1
    let name = "new-workflow"
    while (existingNames.has(name.toLowerCase())) {
      index += 1
      name = `new-workflow-${index}`
    }
    const chain = createEmptyWorkflow()

    try {
      const filePath = await window.api.createWorkflow(selectedProject, name, chain)
      setWorkflows((prev) => [{ name, path: filePath, updatedAt: Date.now() }, ...prev])
      setSelectedWorkflowPath(filePath)
      setWorkflow(chain)
      setWorkflowSavedSnapshot(workflowSnapshot(chain))
      setMainView("thread")
    } catch (error) {
      toast.error(`Failed to create workflow: ${String(error)}`)
    }
  }

  const renderTemplateGrid = (items: WorkflowTemplate[]) => (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
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
        title="Templates"
        subtitle="Start from a template, then tailor the workflow to your project."
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadTemplates()}
              disabled={loading}
              aria-label={loading ? "Refreshing templates" : "Refresh templates"}
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <RefreshCw size={14} aria-hidden />
              )}
              Refresh
            </Button>

            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search templates"
                aria-label="Search templates"
                className="w-56 pl-8 bg-surface-2"
              />
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setGenerateDialogOpen(true)}
              disabled={!selectedProject}
            >
              <Sparkles size={14} />
              Generate with AI
            </Button>
            <Button
              size="sm"
              onClick={() => void createWorkflow()}
              disabled={!selectedProject}
            >
              <Plus size={14} />
              New workflow
            </Button>
          </>
        }
      />

      <section aria-busy={loading} aria-live="polite">
        {/* Stage tabs */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
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
        </div>

        <div className="flex gap-4">
          {/* Main grid */}
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={`skeleton-${idx}`}
                    className="rounded-lg surface-panel p-4 flex items-start gap-3 animate-pulse"
                    aria-hidden="true"
                  >
                    <div className="h-6 w-6 rounded bg-surface-2 flex-shrink-0" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-2/3 rounded bg-surface-2" />
                      <div className="h-3 w-full rounded bg-surface-2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="rounded-lg surface-panel px-4 py-8 text-body-sm text-muted-foreground text-center">
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
            />
          )}
        </div>
      </section>

      <Dialog open={pendingTemplate !== null} onOpenChange={(open) => !open && setPendingTemplate(null)}>
        <CanvasDialogContent showCloseButton={false}>
          <CanvasDialogHeader>
            <DialogTitle>Apply template</DialogTitle>
            <DialogDescription>
              How would you like to use &ldquo;{pendingTemplate?.name}&rdquo;?
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
            <Button variant="outline" size="sm" onClick={() => pendingTemplate && doApplyTemplate(pendingTemplate)}>
              Replace current
            </Button>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>
      {unsavedChangesDialog}
    </PageShell>
  )
}
