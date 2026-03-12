import { useState, useEffect, useCallback } from "react"
import { useAtom } from "jotai"
import {
  templateBrowserOpenAtom,
  currentWorkflowAtom,
  webSearchBackendAtom,
  type WorkflowTemplate,
} from "@/lib/store"
import {
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  Dialog,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/cn"
import {
  FileText,
  Code,
  Search,
  Megaphone,
  Layers,
} from "lucide-react"
import { toast } from "sonner"
import { cloneWorkflow } from "@/lib/workflow-graph-utils"
import { applyWebSearchBackendPreset } from "@/lib/web-search-backend"

const CATEGORY_ICONS: Record<string, typeof FileText> = {
  content: FileText,
  code: Code,
  research: Search,
  marketing: Megaphone,
  general: Layers,
}

const CATEGORY_COLORS: Record<string, string> = {
  content: "text-status-info",
  code: "text-status-success",
  research: "text-foreground/80",
  marketing: "text-status-warning",
  general: "text-muted-foreground",
}

interface TemplateBrowserProps {
  onApply?: (template: WorkflowTemplate, previousWorkflow: unknown) => void
  initialTemplates?: WorkflowTemplate[]
}

function workflowSummary(template: WorkflowTemplate) {
  const w = template.workflow
  const skills = w.nodes.filter((n) => n.type === "skill").length
  const evaluators = w.nodes.filter((n) => n.type === "evaluator").length
  const splitters = w.nodes.filter((n) => n.type === "splitter").length
  const parts: string[] = []
  if (skills) parts.push(`${skills} skill${skills > 1 ? "s" : ""}`)
  if (evaluators) parts.push(`${evaluators} evaluator${evaluators > 1 ? "s" : ""}`)
  if (splitters) parts.push("fan-out")
  return parts.join(" · ")
}

export function TemplateBrowser({ onApply, initialTemplates }: TemplateBrowserProps = {}) {
  const [open, setOpen] = useAtom(templateBrowserOpenAtom)
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
  const [templates, setTemplates] = useState<WorkflowTemplate[]>(initialTemplates ?? [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [confirmPending, setConfirmPending] = useState<WorkflowTemplate | null>(null)

  useEffect(() => {
    if (open && !initialTemplates) {
      setIsLoading(true)
      window.api.listTemplates().then(setTemplates).catch((err) => {
        console.error("Failed to load templates:", err)
      }).finally(() => setIsLoading(false))
    }
  }, [open, initialTemplates])

  const selected = templates.find((t) => t.id === selectedId)
  const selectedOptionId = selectedId ? `template-option-${selectedId}` : undefined

  const closeBrowser = useCallback(() => {
    setOpen(false)
    setConfirmPending(null)
    setSelectedId(null)
  }, [setOpen])

  const doApply = (previousWorkflow: unknown, templateToApply: WorkflowTemplate) => {
    const nextWorkflow = applyWebSearchBackendPreset(
      templateToApply.workflow,
      templateToApply.category,
      webSearchBackend,
    )
    const resolvedTemplate: WorkflowTemplate = {
      ...templateToApply,
      workflow: nextWorkflow,
    }
    if (onApply) {
      onApply(resolvedTemplate, previousWorkflow)
    } else {
      setWorkflow(nextWorkflow)
    }
    setOpen(false)
    setSelectedId(null)
    setConfirmPending(null)
    toast.success(`Template "${templateToApply.name}" applied`, {
      action: {
        label: "Undo",
        onClick: () => { setWorkflow(previousWorkflow as typeof workflow) },
      },
    })
  }

  const applyTemplate = (templateToApply: WorkflowTemplate | null = selected ?? null) => {
    if (!templateToApply) return
    const previousWorkflow = cloneWorkflow(workflow)
    const nextWorkflow = applyWebSearchBackendPreset(
      templateToApply.workflow,
      templateToApply.category,
      webSearchBackend,
    )
    const replacingCurrentWorkflow =
      JSON.stringify(previousWorkflow) !== JSON.stringify(nextWorkflow)
    if (replacingCurrentWorkflow) {
      setConfirmPending(templateToApply)
      return
    }
    doApply(previousWorkflow, templateToApply)
  }

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    const idx = templates.findIndex((t) => t.id === selectedId)
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedId(templates[Math.min(idx + 1, templates.length - 1)]?.id ?? null)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedId(templates[Math.max(idx - 1, 0)]?.id ?? null)
    } else if (e.key === "Enter" && selectedId) {
      e.preventDefault()
      applyTemplate(templates[idx])
    } else if (e.key === "Escape") {
      e.preventDefault()
      closeBrowser()
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setOpen(true)
          return
        }
        closeBrowser()
      }}
    >
      <CanvasDialogContent size="xl" className="max-h-[80vh] flex flex-col p-0 gap-0" showCloseButton={false}>
        <CanvasDialogHeader className="border-b border-hairline bg-gradient-to-b from-surface-1 to-surface-2/70">
          <DialogTitle>Workflow Templates</DialogTitle>
        </CanvasDialogHeader>

        <CanvasDialogBody className="grid grid-cols-1 lg:grid-cols-[1.4fr,1fr] gap-3 flex-1 pt-4 min-h-0 bg-surface-1/30">
          <div
            role="listbox"
            aria-label="Workflow templates"
            aria-activedescendant={selectedOptionId}
            tabIndex={0}
            className="overflow-y-auto space-y-2 pr-1 focus:outline-none"
            onKeyDown={handleListKeyDown}
          >
            {isLoading && (
              <p className="text-body-md text-muted-foreground px-1 py-4 text-center">Loading templates…</p>
            )}
            {!isLoading && templates.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <Layers size={24} className="opacity-40" />
                <p className="text-body-md">No templates available</p>
              </div>
            )}
            {templates.map((template) => {
              const Icon = CATEGORY_ICONS[template.category] || Layers
              const isSelected = selectedId === template.id
              return (
                <Button
                  type="button"
                  role="option"
                  key={template.id}
                  id={`template-option-${template.id}`}
                  aria-selected={isSelected}
                  variant="ghost"
                  size="auto"
                  className={cn(
                    "h-auto w-full justify-start rounded-md border border-hairline bg-surface-1 p-3 text-left whitespace-normal hover:bg-surface-3 transition-colors ui-motion-fast ui-elevation-inset",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                    isSelected && "ring-2 ring-foreground/20 bg-surface-3",
                  )}
                  onClick={() => setSelectedId(template.id)}
                  onDoubleClick={() => {
                    setSelectedId(template.id)
                    applyTemplate(template)
                  }}
                >
                  <div className="flex items-start gap-3">
                    <Icon size={18} className={cn("mt-0.5 flex-shrink-0", CATEGORY_COLORS[template.category] ?? "text-muted-foreground")} />
                    <div className="flex-1 min-w-0">
                      <div className="ui-badge-row">
                        <span className="text-body-md font-medium truncate">{template.name}</span>
                        <Badge
                          className="px-2 py-0"
                          variant="outline"
                        >
                          {template.category}
                        </Badge>
                      </div>
                      <p className="ui-meta-text mt-1">
                        {template.description}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="ui-meta-text font-mono">
                          {workflowSummary(template)}
                        </span>
                        {(template.tags ?? []).map((tag) => (
                          <Badge key={tag} variant="outline" className="px-2 py-0">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </Button>
              )
            })}
          </div>

          <div className="rounded-lg surface-soft p-3 overflow-y-auto min-h-[180px]">
            {!selected ? (
              <p className="text-body-md text-muted-foreground">
                Select a template to preview nodes and structure before applying.
              </p>
            ) : (
              <div className="space-y-3">
                <div>
                  <h4 className="text-body-md font-medium">{selected.name}</h4>
                  <p className="ui-meta-text mt-1">
                    {selected.description}
                  </p>
                </div>

                <div className="ui-meta-text font-mono">
                  {workflowSummary(selected) || "input · output"}
                </div>

                <div className="space-y-2">
                  {selected.workflow.nodes.map((node) => {
                    const label =
                      node.type === "skill"
                        ? node.config.skillRef
                        : node.type

                    return (
                      <div key={node.id} className="flex items-center gap-2 rounded-md border border-hairline bg-surface-1/80 px-2 py-1 text-body-sm">
                        <span className="font-medium capitalize">{node.type}</span>
                        <span className="text-muted-foreground truncate">{label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </CanvasDialogBody>

        {confirmPending ? (
          <div className="rounded-lg border border-status-warning/30 bg-status-warning/10 p-3 mt-2 mx-6">
            <p className="text-body-md">
              Replace the current workflow with <strong>{confirmPending.name}</strong>?
            </p>
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                onClick={() => doApply(cloneWorkflow(workflow), confirmPending)}
              >
                Replace
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmPending(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <CanvasDialogFooter className="bg-surface-1/60">
            <Button variant="outline" onClick={closeBrowser}>
              Cancel
            </Button>
            <Button
              variant="default"
              className="!text-primary-foreground [-webkit-text-fill-color:hsl(var(--primary-foreground))]"
              onClick={() => applyTemplate()}
              disabled={!selected}
            >
              Use Template
            </Button>
          </CanvasDialogFooter>
        )}
      </CanvasDialogContent>
    </Dialog>
  )
}
