import { useCallback, useEffect, useMemo, useState } from "react"
import { useAtom } from "jotai"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  currentWorkflowAtom,
  mainViewAtom,
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
  Code,
  FileText,
  Layers,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react"
import { PageHeader, PageShell, SectionHeading } from "@/components/ui/page-shell"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import { applyWebSearchBackendPreset } from "@/lib/web-search-backend"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"

const CATEGORY_ICONS: Record<string, typeof Layers> = {
  content: FileText,
  code: Code,
  research: Search,
  marketing: Megaphone,
  general: Layers,
}
const MAX_VISIBLE_TAG_FILTERS = 24

function formatFacetLabel(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ")
}

function workflowSummary(template: WorkflowTemplate) {
  const workflow = template.workflow
  const skills = workflow.nodes.filter((node) => node.type === "skill").length
  const evaluators = workflow.nodes.filter((node) => node.type === "evaluator").length
  const splitters = workflow.nodes.filter((node) => node.type === "splitter").length
  const parts: string[] = []
  if (skills > 0) parts.push(`${skills} skill${skills === 1 ? "" : "s"}`)
  if (evaluators > 0) parts.push(`${evaluators} evaluator${evaluators === 1 ? "" : "s"}`)
  if (splitters > 0) parts.push("fan-out")
  return parts.join(" · ")
}

function TemplateCard({
  template,
  onUse,
  disabled,
}: {
  template: WorkflowTemplate
  onUse: (template: WorkflowTemplate) => void
  disabled?: boolean
}) {
  const Icon = CATEGORY_ICONS[template.category] ?? Layers
  const extraTagCount = template.tags.length - 2

  return (
    <article className="ui-interactive-card rounded-lg surface-panel p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="h-control-lg w-control-lg rounded-lg border border-border bg-surface-2 flex items-center justify-center">
          <Icon size={17} className="text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-body-md font-semibold truncate">{template.name}</h3>
          <p className="text-body-sm text-muted-foreground line-clamp-2">
            {template.description}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="capitalize">
          {template.category}
        </Badge>
        {template.tags.slice(0, 2).map((tag) => (
          <Badge key={tag} variant="secondary">
            {tag}
          </Badge>
        ))}
        {extraTagCount > 0 && (
          <Badge variant="secondary">
            +{extraTagCount}
          </Badge>
        )}
      </div>

      <div className="ui-meta-text text-muted-foreground font-mono">
        {workflowSummary(template) || "input · output"}
      </div>

      <div className="mt-auto">
        <Button variant="outline" size="sm" onClick={() => onUse(template)} disabled={disabled}>
          Use template
        </Button>
      </div>
    </article>
  )
}

export function WorkflowsTemplatesPage() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState<string>("all")
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [pendingTemplate, setPendingTemplate] = useState<WorkflowTemplate | null>(null)
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
  const [workflowDirty] = useAtom(workflowDirtyAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [workflows, setWorkflows] = useAtom(workflowsAtom)
  const [, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [, setGenerateDialogOpen] = useAtom(generateDialogOpenAtom)
  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()

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
      `${template.name} ${template.description} ${template.category} ${template.tags.join(" ")}`
        .toLowerCase()
        .includes(q),
    )
  }, [query, templates])

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const template of searchFilteredTemplates) {
      counts.set(template.category, (counts.get(template.category) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [searchFilteredTemplates])

  useEffect(() => {
    if (activeCategory === "all") return
    const stillAvailable = categoryCounts.some(([category]) => category === activeCategory)
    if (!stillAvailable) {
      setActiveCategory("all")
    }
  }, [activeCategory, categoryCounts])

  const categoryFilteredTemplates = useMemo(() => {
    if (activeCategory === "all") return searchFilteredTemplates
    return searchFilteredTemplates.filter((template) => template.category === activeCategory)
  }, [activeCategory, searchFilteredTemplates])

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const template of categoryFilteredTemplates) {
      for (const tag of template.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [categoryFilteredTemplates])

  useEffect(() => {
    const availableTags = new Set(tagCounts.map(([tag]) => tag))
    setActiveTags((prev) => prev.filter((tag) => availableTags.has(tag)))
  }, [tagCounts])

  const visibleTagFilters = useMemo(
    () => tagCounts.slice(0, MAX_VISIBLE_TAG_FILTERS),
    [tagCounts],
  )

  const filteredTemplates = useMemo(() => {
    if (activeTags.length === 0) return categoryFilteredTemplates
    return categoryFilteredTemplates.filter((template) => activeTags.every((tag) => template.tags.includes(tag)))
  }, [activeTags, categoryFilteredTemplates])

  const hasActiveFilters = activeCategory !== "all" || activeTags.length > 0 || query.trim().length > 0

  const toggleTagFilter = (tag: string) => {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]))
  }

  const clearFilters = () => {
    setQuery("")
    setActiveCategory("all")
    setActiveTags([])
  }

  const confirmApplyTemplate = (template: WorkflowTemplate) => {
    const nextWorkflow = applyWebSearchBackendPreset(
      template.workflow,
      template.category,
      webSearchBackend,
    )
    const replacingCurrent = JSON.stringify(workflow) !== JSON.stringify(nextWorkflow)
    if (replacingCurrent) {
      setPendingTemplate(template)
      return
    }
    doApplyTemplate(template)
  }

  const doApplyTemplate = (template: WorkflowTemplate) => {
    const previousWorkflow = structuredClone(workflow)
    const nextWorkflow = applyWebSearchBackendPreset(
      template.workflow,
      template.category,
      webSearchBackend,
    )
    setWorkflow(nextWorkflow)
    setSelectedWorkflowPath(null)
    setMainView("thread")
    setPendingTemplate(null)
    toast.success(`Template "${template.name}" applied`, {
      action: {
        label: "Undo",
        onClick: () => setWorkflow(previousWorkflow),
      },
    })
  }

  const doCreateFromTemplate = async (template: WorkflowTemplate) => {
    if (!selectedProject) return
    const nextWorkflow = applyWebSearchBackendPreset(
      template.workflow,
      template.category,
      webSearchBackend,
    )
    const existingNames = new Set(workflows.map((item) => item.name.toLowerCase()))
    let name = template.name.toLowerCase().replace(/\s+/g, "-")
    if (existingNames.has(name)) {
      let index = 2
      while (existingNames.has(`${name}-${index}`)) index += 1
      name = `${name}-${index}`
    }
    try {
      const filePath = await window.api.createWorkflow(selectedProject, name, nextWorkflow)
      setWorkflows((prev) => [{ name, path: filePath, updatedAt: Date.now() }, ...prev])
      setSelectedWorkflowPath(filePath)
      setWorkflow(nextWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(nextWorkflow))
      setMainView("thread")
      setPendingTemplate(null)
      toast.success(`Created "${name}" from template`)
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

      <section className="space-y-3" aria-busy={loading} aria-live="polite">
        <SectionHeading
          title="Template Catalog"
          meta={<Badge variant="outline">{filteredTemplates.length}</Badge>}
        />
        <div className="rounded-lg surface-panel p-3 space-y-3">
          <div className="space-y-2">
            <div className="ui-meta-text text-muted-foreground">Category</div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={activeCategory === "all" ? "secondary" : "outline"}
                size="xs"
                onClick={() => setActiveCategory("all")}
                aria-pressed={activeCategory === "all"}
              >
                All ({searchFilteredTemplates.length})
              </Button>
              {categoryCounts.map(([category, count]) => (
                <Button
                  key={category}
                  variant={activeCategory === category ? "secondary" : "outline"}
                  size="xs"
                  onClick={() => setActiveCategory(category)}
                  aria-pressed={activeCategory === category}
                  className="capitalize"
                >
                  {formatFacetLabel(category)} ({count})
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="ui-meta-text text-muted-foreground">Tags</div>
            {visibleTagFilters.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">No tags available for this category filter.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {visibleTagFilters.map(([tag, count]) => (
                  <Button
                    key={tag}
                    variant={activeTags.includes(tag) ? "secondary" : "outline"}
                    size="xs"
                    onClick={() => toggleTagFilter(tag)}
                    aria-pressed={activeTags.includes(tag)}
                  >
                    {tag} ({count})
                  </Button>
                ))}
              </div>
            )}
            {tagCounts.length > visibleTagFilters.length && (
              <p className="text-body-sm text-muted-foreground">
                Showing top {visibleTagFilters.length} tags by template count.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="ui-meta-text text-muted-foreground">
              {filteredTemplates.length} result{filteredTemplates.length === 1 ? "" : "s"}
            </div>
            <Button variant="ghost" size="xs" onClick={clearFilters} disabled={!hasActiveFilters}>
              Clear filters
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <article
                key={`skeleton-${idx}`}
                className="rounded-lg surface-panel p-4 flex flex-col gap-3 animate-pulse"
                aria-hidden="true"
              >
                <div className="flex items-start gap-3">
                  <div className="h-control-lg w-control-lg rounded-lg bg-surface-2" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-2/3 rounded bg-surface-2" />
                    <div className="h-3 w-full rounded bg-surface-2" />
                  </div>
                </div>
                <div className="h-4 w-1/2 rounded bg-surface-2" />
                <div className="h-3 w-3/4 rounded bg-surface-2" />
                <div className="h-8 w-28 rounded bg-surface-2 mt-auto" />
              </article>
            ))}
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="rounded-lg surface-panel px-4 py-8 text-body-sm text-muted-foreground">
            No templates match this filter. Clear search or pick another category.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onUse={confirmApplyTemplate}
                disabled={!selectedProject}
              />
            ))}
          </div>
        )}
      </section>

      <Dialog open={pendingTemplate !== null} onOpenChange={(open) => !open && setPendingTemplate(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Apply template</DialogTitle>
            <DialogDescription>
              How would you like to use &ldquo;{pendingTemplate?.name}&rdquo;?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingTemplate(null)}>
              Cancel
            </Button>
            {selectedProject && (
              <Button variant="outline" onClick={() => pendingTemplate && void doCreateFromTemplate(pendingTemplate)}>
                Create new
              </Button>
            )}
            <Button onClick={() => pendingTemplate && doApplyTemplate(pendingTemplate)}>
              Replace current
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {unsavedChangesDialog}
    </PageShell>
  )
}
