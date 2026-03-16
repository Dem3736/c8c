import { useState, useEffect, useCallback } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  templateBrowserOpenAtom,
  currentWorkflowAtom,
  selectedWorkflowPathAtom,
  setWorkflowTemplateContextForKeyAtom,
  workflowEntryStateAtom,
  webSearchBackendAtom,
  type WorkflowTemplate,
} from "@/lib/store"
import { runStatusAtom } from "@/features/execution"
import {
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  Dialog,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/cn"
import { AlertTriangle, Layers, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { cloneWorkflow } from "@/lib/workflow-graph-utils"
import { resolveTemplateWorkflow } from "@/lib/web-search-backend"
import { getTemplateSourceKind, getTemplateSourceLabel } from "@/lib/template-source"
import {
  buildTemplateRunContext,
  buildTemplateWorkflowEntryState,
  deriveTemplateCardCopy,
  deriveTemplateExecutionDisciplineLabels,
  deriveTemplateJourneyStageLabel,
  deriveTemplatePackStagePath,
  deriveTemplateUseWhen,
  formatArtifactContractLabel,
} from "@/lib/workflow-entry"
import { getReplaceCurrentWorkflowBlockedReason } from "@/lib/run-guards"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"

interface TemplateBrowserProps {
  onApply?: (template: WorkflowTemplate, previousWorkflow: unknown) => void
  initialTemplates?: WorkflowTemplate[]
}

export function TemplateBrowser({ onApply, initialTemplates }: TemplateBrowserProps = {}) {
  const [open, setOpen] = useAtom(templateBrowserOpenAtom)
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setWorkflowEntryState] = useAtom(workflowEntryStateAtom)
  const setWorkflowTemplateContextForKey = useSetAtom(setWorkflowTemplateContextForKeyAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
  const [runStatus] = useAtom(runStatusAtom)
  const [templates, setTemplates] = useState<WorkflowTemplate[]>(initialTemplates ?? [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirmPending, setConfirmPending] = useState<WorkflowTemplate | null>(null)

  const loadTemplates = useCallback(async () => {
    if (initialTemplates) {
      setTemplates(initialTemplates)
      setLoadError(null)
      return
    }

    setIsLoading(true)
    setLoadError(null)
    try {
      setTemplates(await window.api.listTemplates())
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error("Failed to load templates:", err)
      setTemplates([])
      setLoadError(message || "Could not load templates.")
    } finally {
      setIsLoading(false)
    }
  }, [initialTemplates])

  useEffect(() => {
    if (!open) return
    void loadTemplates()
  }, [loadTemplates, open])

  const selected = templates.find((t) => t.id === selectedId)
  const selectedOptionId = selectedId ? `template-option-${selectedId}` : undefined
  const selectedPackStageLabel = selected ? deriveTemplateJourneyStageLabel(selected) : null
  const selectedDisciplineLabels = selected ? deriveTemplateExecutionDisciplineLabels(selected) : []
  const selectedPackStages = selected?.pack
    ? deriveTemplatePackStagePath(templates, selected.pack.id)
    : []
  const selectedRecommendedNext = selected
    ? (selected.pack?.recommendedNext || [])
      .map((id) => templates.find((candidate) => candidate.id === id)?.name)
      .filter((name): name is string => Boolean(name))
    : []

  const closeBrowser = useCallback(() => {
    setOpen(false)
    setConfirmPending(null)
    setSelectedId(null)
  }, [setOpen])
  const replaceCurrentBlockedReason = getReplaceCurrentWorkflowBlockedReason(runStatus)

  const doApply = (previousWorkflow: unknown, templateToApply: WorkflowTemplate) => {
    if (replaceCurrentBlockedReason) {
      toast.error("Cannot replace the current workflow while a run is active", {
        description: replaceCurrentBlockedReason,
      })
      return
    }

    const nextWorkflow = resolveTemplateWorkflow(templateToApply, webSearchBackend)
    const resolvedTemplate: WorkflowTemplate = {
      ...templateToApply,
      workflow: nextWorkflow,
    }
    if (onApply) {
      onApply(resolvedTemplate, previousWorkflow)
    } else {
      setWorkflow(nextWorkflow)
    }
    const workflowKey = toWorkflowExecutionKey(selectedWorkflowPath)
    setWorkflowEntryState(buildTemplateWorkflowEntryState({
      template: resolvedTemplate,
      workflowPath: selectedWorkflowPath,
    }))
    setWorkflowTemplateContextForKey({
      key: workflowKey,
      context: buildTemplateRunContext({
        template: resolvedTemplate,
        workflowPath: selectedWorkflowPath,
      }),
    })
    setOpen(false)
    setSelectedId(null)
    setConfirmPending(null)
    toast.success(`"${templateToApply.name}" is ready to run`, {
      action: {
        label: "Undo",
        onClick: () => {
          setWorkflow(previousWorkflow as typeof workflow)
          setWorkflowEntryState(null)
          setWorkflowTemplateContextForKey({ key: workflowKey, context: null })
        },
      },
    })
  }

  const applyTemplate = (templateToApply: WorkflowTemplate | null = selected ?? null) => {
    if (!templateToApply) return
    const previousWorkflow = cloneWorkflow(workflow)
    const nextWorkflow = resolveTemplateWorkflow(templateToApply, webSearchBackend)
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
        <CanvasDialogHeader className="surface-depth-header">
          <DialogTitle>Choose a starting point</DialogTitle>
          <DialogDescription className="sr-only">
            Browse ready-to-run flows, preview their fit, and apply one to the current workflow.
          </DialogDescription>
        </CanvasDialogHeader>

        <CanvasDialogBody className="grid grid-cols-1 lg:grid-cols-[1.4fr,1fr] gap-3 flex-1 pt-4 min-h-0 bg-surface-1/30">
          <div
            role="listbox"
            aria-label="Workflow templates"
            aria-activedescendant={selectedOptionId}
            tabIndex={0}
            className="overflow-y-auto ui-scroll-region space-y-2 pr-1 focus:outline-none"
            onKeyDown={handleListKeyDown}
          >
            {isLoading && (
              <p className="text-body-md text-muted-foreground px-1 py-4 text-center">Loading templates…</p>
            )}
            {!isLoading && loadError && (
              <div className="rounded-lg surface-danger-soft px-4 py-4 text-center">
                <div className="mx-auto flex h-control-lg w-control-lg items-center justify-center rounded-full bg-status-danger/10 text-status-danger">
                  <AlertTriangle size={18} />
                </div>
                <p className="mt-3 text-body-md font-medium text-foreground">Could not load templates</p>
                <p className="mt-1 text-body-sm text-status-danger">{loadError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void loadTemplates()}
                >
                  <RefreshCw size={14} />
                  Retry
                </Button>
              </div>
            )}
            {!isLoading && !loadError && templates.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <Layers size={24} className="opacity-40" />
                <p className="text-body-md">No templates available</p>
              </div>
            )}
            {templates.map((template) => {
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
                    "h-auto w-full justify-start rounded-md border border-hairline bg-surface-1 p-3 text-left whitespace-normal hover:bg-surface-3 ui-transition-colors ui-motion-fast ui-elevation-inset",
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
                    <span className="text-lg mt-0.5 flex-shrink-0" aria-hidden>{template.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-body-md font-medium truncate block">{template.headline}</span>
                      <p className="ui-meta-text mt-1">
                        {deriveTemplateCardCopy(template)}
                      </p>
                      {(template.pack || template.executionPolicy?.tags?.length) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {template.pack && (
                            <Badge variant="outline" size="compact">
                              {template.pack.label}
                            </Badge>
                          )}
                          {template.pack?.entrypoint && (
                            <Badge variant="info" size="compact">
                              Start here
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Button>
              )
            })}
          </div>

          <div className="rounded-lg surface-soft p-3 overflow-y-auto ui-scroll-region min-h-[180px]">
            {!selected ? (
              <p className="text-body-md text-muted-foreground">
                {loadError
                  ? "Retry loading templates to preview details before applying."
                  : "Select a template to preview details before applying."}
              </p>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-body-md font-medium">{selected.name}</h4>
                    <Badge size="compact" variant="secondary">
                      {getTemplateSourceLabel(selected)}
                    </Badge>
                  </div>
                  <p className="ui-meta-text mt-1">
                    {selected.description}
                  </p>
                </div>

                <div className="space-y-2">
                  <div>
                    <span className="ui-meta-label text-muted-foreground">Use this when</span>
                    <p className="text-body-sm">{deriveTemplateUseWhen(selected)}</p>
                  </div>
                  <div>
                    <span className="ui-meta-label text-muted-foreground">You provide</span>
                    <p className="text-body-sm">{selected.input}</p>
                  </div>
                  <div>
                    <span className="ui-meta-label text-muted-foreground">You get</span>
                    <p className="text-body-sm">{selected.output}</p>
                  </div>
                  {selected.pack && (
                    <div>
                      <span className="ui-meta-label text-muted-foreground">Factory pack</span>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="outline" size="compact">{selected.pack.label}</Badge>
                        {selectedPackStageLabel ? <Badge variant="secondary" size="compact">{selectedPackStageLabel}</Badge> : null}
                        {selected.pack.entrypoint ? <Badge variant="info" size="compact">Start here</Badge> : null}
                      </div>
                    </div>
                  )}
                </div>

                {selectedPackStages.length > 0 && (
                  <div>
                    <span className="ui-meta-label text-muted-foreground">Stages included</span>
                    <p className="text-body-sm text-foreground">{selectedPackStages.join(" -> ")}</p>
                  </div>
                )}

                {selected.contractIn?.length ? (
                  <div>
                    <span className="ui-meta-label text-muted-foreground">Requires</span>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selected.contractIn.map((contract) => (
                        <Badge key={`${selected.id}-in-${contract.kind}-${contract.title || ""}`} variant="outline" size="compact">
                          {formatArtifactContractLabel(contract)}
                          {contract.required === false ? " (optional)" : ""}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}

                {selected.contractOut?.length ? (
                  <div>
                    <span className="ui-meta-label text-muted-foreground">Produces</span>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selected.contractOut.map((contract) => (
                        <Badge key={`${selected.id}-out-${contract.kind}-${contract.title || ""}`} variant="secondary" size="compact">
                          {formatArtifactContractLabel(contract)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}

                {selectedDisciplineLabels.length > 0 && (
                  <div>
                    <span className="ui-meta-label text-muted-foreground">Execution discipline</span>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedDisciplineLabels.map((label) => (
                        <Badge key={`${selected.id}-discipline-${label}`} variant="info" size="compact">
                          {label}
                        </Badge>
                      ))}
                    </div>
                    {selected.executionPolicy?.description ? (
                      <p className="mt-2 text-body-sm text-muted-foreground">{selected.executionPolicy.description}</p>
                    ) : null}
                  </div>
                )}

                {selectedRecommendedNext.length > 0 && (
                  <div>
                    <span className="ui-meta-label text-muted-foreground">Next</span>
                    <p className="text-body-sm text-foreground">{selectedRecommendedNext.join(" -> ")}</p>
                  </div>
                )}

                <details className="rounded-lg border border-hairline bg-surface-1/70 px-3 py-3">
                  <summary className="cursor-pointer list-none text-body-sm font-medium text-foreground">
                    See the flow structure
                  </summary>
                  <ol className="list-decimal list-inside space-y-1 mt-3 text-muted-foreground">
                    {selected.steps.map((step, i) => (
                      <li key={i} className="text-body-sm">{step}</li>
                    ))}
                  </ol>
                </details>
                {getTemplateSourceKind(selected) === "plugin" && (
                  <div>
                    <span className="ui-meta-label text-muted-foreground">Marketplace</span>
                    <p className="text-body-sm">{selected.marketplaceName || "plugin marketplace"}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </CanvasDialogBody>

        {confirmPending ? (
          <div className="mx-6 mt-2 rounded-lg surface-warning-soft p-3">
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
              onClick={() => applyTemplate()}
              disabled={!selected || Boolean(loadError)}
            >
              Use Template
            </Button>
          </CanvasDialogFooter>
        )}
      </CanvasDialogContent>
    </Dialog>
  )
}
