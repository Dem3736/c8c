import { ArrowUpRight, FileStack, Inbox, Loader2, Rocket } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SectionHeading } from "@/components/ui/page-shell"
import { SummaryRail } from "@/components/ui/summary-rail"
import { formatRelativeTime } from "@/components/sidebar/projectSidebarUtils"
import { cn } from "@/lib/cn"
import { formatElapsedTime } from "@/lib/run-progress"
import {
  deriveTemplateExecutionDisciplineLabels,
  deriveTemplateJourneyStageLabel,
  formatArtifactContractLabel,
} from "@/lib/workflow-entry"
import type { ArtifactRecord, HumanTaskSummary, WorkflowTemplate } from "@shared/types"
import {
  cardToneClass,
  factoryCaseStatusLabel,
  factoryCaseStatusTone,
  type FactoryCase,
  type FactoryCaseSummary,
} from "@/components/factory/factory-page-helpers"

interface CaseDetailProps {
  selectedCase: FactoryCase
  selectedCaseSummary: FactoryCaseSummary | null
  launchingTemplateId: string | null
  onLaunchTemplate: (template: WorkflowTemplate, artifacts: ArtifactRecord[]) => Promise<void> | void
  onOpenArtifact: (artifact: ArtifactRecord) => Promise<void> | void
  onOpenCaseArtifacts: (caseId: string) => void
  onOpenInboxTask: (task: HumanTaskSummary, caseId?: string) => void
  onOpenReport: (reportPath: string | null) => Promise<void> | void
  onOpenWorkflow: (workflowPath: string | null) => Promise<void> | void
}

export function CaseDetail({
  selectedCase,
  selectedCaseSummary,
  launchingTemplateId,
  onLaunchTemplate,
  onOpenArtifact,
  onOpenCaseArtifacts,
  onOpenInboxTask,
  onOpenReport,
  onOpenWorkflow,
}: CaseDetailProps) {
  const primaryAction = selectedCaseSummary?.primaryAction || null

  return (
    <section className="grid grid-cols-1 gap-4 2xl:grid-cols-[1.25fr,0.75fr]">
      <article className="rounded-xl surface-panel p-5 space-y-4">
        <SectionHeading
          title={selectedCase.label}
          meta={(
            <span className={cn("ui-status-badge ui-meta-text", cardToneClass(factoryCaseStatusTone(selectedCase.status)))}>
              {factoryCaseStatusLabel(selectedCase.status)}
            </span>
          )}
        />

        <div className="flex flex-wrap gap-1.5">
          {selectedCase.lineageLabels.map((label) => (
            <Badge key={`${selectedCase.id}-${label}`} variant="secondary" className="ui-meta-text px-2 py-0">
              {label}
            </Badge>
          ))}
        </div>

        <div className="space-y-3">
          <div className="ui-meta-label text-muted-foreground">Result lineage</div>
          {selectedCase.artifacts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-6 text-body-sm text-muted-foreground">
              No saved results for this case yet.
            </div>
          ) : (
            <div className="space-y-2">
              {[...selectedCase.artifacts].sort((left, right) => left.updatedAt - right.updatedAt).map((artifact) => {
                const sourceLabels = (artifact.sourceArtifactIds || [])
                  .map((id) => selectedCase.artifacts.find((candidate) => candidate.id === id)?.title)
                  .filter((value): value is string => Boolean(value))
                return (
                  <div
                    key={artifact.id}
                    className="rounded-lg border border-hairline bg-surface-2/35 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-body-sm font-medium text-foreground">{artifact.title}</div>
                          <Badge variant="outline" className="ui-meta-text px-2 py-0">
                            {formatArtifactContractLabel(artifact.kind)}
                          </Badge>
                        </div>
                        <div className="mt-1 text-body-sm text-muted-foreground">
                          {artifact.templateName || artifact.workflowName || "Saved from run"} · {formatRelativeTime(artifact.updatedAt)}
                        </div>
                        {sourceLabels.length > 0 ? (
                          <div className="mt-2 text-body-sm text-muted-foreground">
                            Built from: {sourceLabels.join(", ")}
                          </div>
                        ) : null}
                      </div>
                      <Button variant="outline" size="sm" onClick={() => { void onOpenArtifact(artifact) }}>
                        <FileStack size={14} />
                        Open
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="ui-meta-label text-muted-foreground">Related runs</div>
          {selectedCase.activeRun ? (
            <div className="rounded-lg surface-info-soft px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-medium text-foreground">{selectedCase.activeRun.workflowName}</div>
                  <div className="mt-1 text-body-sm text-muted-foreground">
                    {selectedCase.activeRun.summary.activeStepLabel || "Run in progress"}{selectedCase.activeRun.runStartedAt ? ` · ${formatElapsedTime(selectedCase.activeRun.runStartedAt)}` : ""}
                  </div>
                </div>
                {selectedCase.activeRun.workflowPath ? (
                  <Button variant="outline" size="sm" onClick={() => { void onOpenWorkflow(selectedCase.activeRun?.workflowPath || null) }}>
                    <ArrowUpRight size={14} />
                    Open live run
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {selectedCase.relatedRuns.length === 0 ? (
            <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-6 text-body-sm text-muted-foreground">
              No persisted run history is linked to this case yet.
            </div>
          ) : (
            <div className="space-y-2">
              {selectedCase.relatedRuns.slice(0, 5).map((run) => (
                <div key={run.runId} className="rounded-lg border border-hairline bg-surface-2/35 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-body-sm font-medium text-foreground">{run.workflowName}</div>
                        <Badge
                          variant={run.status === "completed" ? "success" : run.status === "failed" ? "destructive" : "outline"}
                          className="ui-meta-text px-2 py-0"
                        >
                          {run.status}
                        </Badge>
                      </div>
                      <div className="mt-1 text-body-sm text-muted-foreground">
                        Finished {formatRelativeTime(run.completedAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => { void onOpenReport(run.reportPath) }}>
                        <FileStack size={14} />
                        Report
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { void onOpenWorkflow(run.workflowPath || null) }} disabled={!run.workflowPath}>
                        <ArrowUpRight size={14} />
                        Open
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </article>

      <aside className="rounded-xl surface-panel p-5 space-y-4">
        <SectionHeading title="Case detail" />

        {selectedCaseSummary ? (
          <>
            <SummaryRail
              items={selectedCaseSummary.fields}
              className="xl:grid-cols-1"
              compact
            />

            <div className="flex flex-wrap gap-2">
              {primaryAction?.task ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenInboxTask(primaryAction.task!, selectedCase.id)}
                >
                  <Inbox size={14} />
                  Approval
                </Button>
              ) : null}
              {primaryAction?.run ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { void onOpenWorkflow(primaryAction.run?.workflowPath || null) }}
                  disabled={!primaryAction.run.workflowPath}
                >
                  <ArrowUpRight size={14} />
                  Open run
                </Button>
              ) : null}
              {primaryAction?.template ? (
                <Button
                  size="sm"
                  onClick={() => { void onLaunchTemplate(primaryAction.template!, selectedCase.artifacts) }}
                  disabled={Boolean(launchingTemplateId)}
                >
                  {launchingTemplateId === primaryAction.template.id ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                  {launchingTemplateId === primaryAction.template.id ? "Opening..." : "Open next step"}
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => onOpenCaseArtifacts(selectedCase.id)}>
                <FileStack size={14} />
                Case results
              </Button>
            </div>
          </>
        ) : null}

        <div className="space-y-3">
          <div className="ui-meta-label text-muted-foreground">Open approvals</div>
          {selectedCase.tasks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-4 text-body-sm text-muted-foreground">
              No pending approvals for this case.
            </div>
          ) : (
            <div className="space-y-2">
              {selectedCase.tasks.map((task) => (
                <div key={`${task.workspace}:${task.taskId}`} className="rounded-lg surface-warning-soft px-4 py-3">
                  <div className="text-body-sm font-medium text-foreground">{task.title}</div>
                  <div className="mt-1 text-body-sm text-muted-foreground">
                    {task.kind === "approval" ? "Approval" : "Input needed"} · {formatRelativeTime(task.createdAt)}
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => {
                if (selectedCase.tasks[0]) {
                  onOpenInboxTask(selectedCase.tasks[0], selectedCase.id)
                }
              }}>
                <Inbox size={14} />
                Open inbox
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="ui-meta-label text-muted-foreground">Next steps</div>
          {selectedCase.nextTemplates.length === 0 ? (
            <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-4 text-body-sm text-muted-foreground">
              No downstream step is ready yet for this case.
            </div>
          ) : (
            <div className="space-y-2">
              {selectedCase.nextTemplates.map((template) => {
                const stageLabel = deriveTemplateJourneyStageLabel(template)
                const disciplineLabels = deriveTemplateExecutionDisciplineLabels(template)
                const isLaunching = launchingTemplateId === template.id
                return (
                  <div key={`${selectedCase.id}-${template.id}`} className="rounded-lg border border-hairline bg-surface-2/35 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-body-sm font-medium text-foreground">{template.name}</div>
                          {stageLabel ? (
                            <Badge variant="secondary" className="ui-meta-text px-2 py-0">
                              {stageLabel}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 text-body-sm text-muted-foreground">
                          {disciplineLabels.length > 0 ? disciplineLabels.join(" · ") : "Ready from this case context."}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => { void onLaunchTemplate(template, selectedCase.artifacts) }}
                        disabled={Boolean(launchingTemplateId)}
                      >
                        {isLaunching ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                        {isLaunching ? "Opening..." : "Open"}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </aside>
    </section>
  )
}
