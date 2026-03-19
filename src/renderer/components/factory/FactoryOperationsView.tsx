import { ArrowUpRight, FileStack, Inbox, Loader2, Rocket } from "lucide-react"
import { CaseDetail } from "@/components/factory/CaseDetail"
import { StatCard } from "@/components/factory/FactoryPagePrimitives"
import {
  cardToneClass,
  factoryActionLabel,
  factoryCaseStatusLabel,
  factoryCaseStatusTone,
  formatFactoryDate,
  latestLineageLabel,
  launchablePlannedTemplateId,
  type CaseSummaryField,
  type FactoryActionItem,
  type FactoryCase,
  type FactoryCaseLane,
  type FactoryCaseSummary,
  type FactoryPlannedCaseProgress,
  type FactoryRunEntry,
} from "@/components/factory/factory-page-helpers"
import { Badge } from "@/components/ui/badge"
import { BoardLane } from "@/components/ui/board-lane"
import { Button } from "@/components/ui/button"
import { SectionHeading } from "@/components/ui/page-shell"
import { SummaryRail } from "@/components/ui/summary-rail"
import { formatRelativeTime } from "@/components/sidebar/projectSidebarUtils"
import { cn } from "@/lib/cn"
import { formatElapsedTime } from "@/lib/run-progress"
import {
  deriveTemplateExecutionDisciplineLabels,
  deriveTemplateJourneyStageLabel,
  deriveTemplateUseWhen,
  formatArtifactContractLabel,
} from "@/lib/workflow-entry"
import type {
  ArtifactRecord,
  FactoryPlannedCase,
  HumanTaskSummary,
  RunResult,
  WorkflowTemplate,
} from "@shared/types"

interface FactoryOperationsViewProps {
  availableEntrypointTemplates: WorkflowTemplate[]
  artifactsError: string | null
  artifactsLoading: boolean
  caseLanes: FactoryCaseLane[]
  factoryStateError: string | null
  factoryStateLoading: boolean
  humanTasksError: string | null
  humanTasksLoading: boolean
  launchingTemplateId: string | null
  nextActions: FactoryActionItem[]
  outcomeProgressFields: CaseSummaryField[]
  plannedCaseProgress: FactoryPlannedCaseProgress[]
  readyCasesCount: number
  scopedActiveRunsCount: number
  scopedArtifacts: ArtifactRecord[]
  scopedCases: FactoryCase[]
  scopedCompatibleTemplates: WorkflowTemplate[]
  scopedHumanTasks: HumanTaskSummary[]
  scopedLiveRunEntries: FactoryRunEntry[]
  scopedRecentArtifacts: ArtifactRecord[]
  scopedRecentRuns: RunResult[]
  scopedReadyTemplates: WorkflowTemplate[]
  selectedCase: FactoryCase | null
  selectedCaseSummary: FactoryCaseSummary | null
  spawnCandidateArtifact: ArtifactRecord | null
  spawnTemplateCandidate: WorkflowTemplate | null
  spawningCases: boolean
  templateById: Map<string, WorkflowTemplate>
  templatesError: string | null
  templatesLoading: boolean
  onFocusCase: (caseId: string) => void
  onLaunchPlannedCase: (plannedCase: FactoryPlannedCase) => Promise<void> | void
  onLaunchTemplate: (template: WorkflowTemplate, artifacts: ArtifactRecord[]) => Promise<void> | void
  onOpenArtifact: (artifact: ArtifactRecord) => Promise<void> | void
  onOpenArtifactsLibrary: () => void
  onOpenCaseArtifacts: (caseId: string) => void
  onOpenInboxTask: (task: HumanTaskSummary, caseId?: string) => void
  onOpenReport: (reportPath: string | null) => Promise<void> | void
  onOpenWorkflow: (workflowPath: string | null) => Promise<void> | void
  onSpawnPlannedCases: () => Promise<void> | void
}

export function FactoryOperationsView({
  availableEntrypointTemplates,
  artifactsError,
  artifactsLoading,
  caseLanes,
  factoryStateError,
  factoryStateLoading,
  humanTasksError,
  humanTasksLoading,
  launchingTemplateId,
  nextActions,
  outcomeProgressFields,
  plannedCaseProgress,
  readyCasesCount,
  scopedActiveRunsCount,
  scopedArtifacts,
  scopedCases,
  scopedCompatibleTemplates,
  scopedHumanTasks,
  scopedLiveRunEntries,
  scopedRecentArtifacts,
  scopedRecentRuns,
  scopedReadyTemplates,
  selectedCase,
  selectedCaseSummary,
  spawnCandidateArtifact,
  spawnTemplateCandidate,
  spawningCases,
  templateById,
  templatesError,
  templatesLoading,
  onFocusCase,
  onLaunchPlannedCase,
  onLaunchTemplate,
  onOpenArtifact,
  onOpenArtifactsLibrary,
  onOpenCaseArtifacts,
  onOpenInboxTask,
  onOpenReport,
  onOpenWorkflow,
  onSpawnPlannedCases,
}: FactoryOperationsViewProps) {
  return (
    <section className="space-y-4">
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <StatCard
          label="Active runs"
          value={String(scopedActiveRunsCount)}
          hint={scopedActiveRunsCount > 0 ? "Flows currently executing or waiting on a gate." : "Nothing is actively running right now."}
          tone={scopedActiveRunsCount > 0 ? "info" : "default"}
        />
        <StatCard
          label="Waiting on you"
          value={String(scopedHumanTasks.length)}
          hint={scopedHumanTasks.length > 0 ? "Structured review or input tasks are blocking progress." : "No open HIL tasks right now."}
          tone={scopedHumanTasks.length > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Saved outputs"
          value={String(scopedArtifacts.length)}
          hint={scopedArtifacts.length > 0 ? "Reusable outputs available for downstream stages." : "Run a stage to create reusable outputs."}
        />
        <StatCard
          label="Ready next steps"
          value={String(readyCasesCount)}
          hint={readyCasesCount > 0 ? "Cases with a next step ready to open." : "No downstream step is ready yet."}
          tone={readyCasesCount > 0 ? "success" : "default"}
        />
      </section>

      {scopedCases.length === 0 && availableEntrypointTemplates.length > 0 ? (
        <section className="rounded-xl surface-panel p-5 space-y-4">
          <SectionHeading
            title="Entrypoints"
            meta={(
              <Badge variant="outline" className="ui-meta-text px-2 py-0">
                {availableEntrypointTemplates.length} ready
              </Badge>
            )}
          />

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {availableEntrypointTemplates.map((template) => {
              const stageLabel = deriveTemplateJourneyStageLabel(template)
              const disciplineLabels = deriveTemplateExecutionDisciplineLabels(template)
              const isLaunching = launchingTemplateId === template.id
              return (
                <article key={template.id} className="rounded-lg border border-hairline bg-surface-2/35 px-4 py-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-body-md font-medium text-foreground">{template.name}</h3>
                    {template.pack ? (
                      <Badge variant="outline" className="ui-meta-text px-2 py-0">
                        {template.pack.label}
                      </Badge>
                    ) : null}
                    {stageLabel ? (
                      <Badge variant="secondary" className="ui-meta-text px-2 py-0">
                        {stageLabel}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-body-sm text-muted-foreground">
                    {deriveTemplateUseWhen(template)}
                  </p>
                  {disciplineLabels.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {disciplineLabels.slice(0, 3).map((label) => (
                        <Badge key={`${template.id}-${label}`} variant="secondary" className="ui-meta-text px-2 py-0">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => { void onLaunchTemplate(template, []) }} disabled={Boolean(launchingTemplateId)}>
                      {isLaunching ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                      {isLaunching ? "Opening..." : "Open"}
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl surface-panel p-5 space-y-4">
        <SectionHeading
          title="Progress"
          meta={(
            <div className="flex items-center gap-2">
              {spawnCandidateArtifact && spawnTemplateCandidate ? (
                <Button size="sm" onClick={() => { void onSpawnPlannedCases() }} disabled={spawningCases}>
                  {spawningCases ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                  {spawningCases ? "Spawning..." : `Spawn from ${spawnCandidateArtifact.title}`}
                </Button>
              ) : null}
            </div>
          )}
        />

        <SummaryRail
          items={outcomeProgressFields}
          className="xl:grid-cols-5"
          compact
        />

        {factoryStateError ? (
          <div role="alert" className="rounded-lg border border-status-danger/25 bg-status-danger/5 px-4 py-3 text-body-sm text-status-danger">
            {factoryStateError}
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="ui-meta-label text-muted-foreground">Planned items</div>
          {factoryStateLoading ? (
            <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
              Loading planned item cases...
            </div>
          ) : plannedCaseProgress.length === 0 ? (
            <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
              {spawnCandidateArtifact
                ? `Use ${spawnCandidateArtifact.title} to spawn item-level work and compare planned volume against the target.`
                : "No planning output is available yet to spawn item-level work."}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {plannedCaseProgress.slice(0, 8).map((entry) => {
                const isLaunching = launchablePlannedTemplateId(entry.plannedCase, templateById, spawnTemplateCandidate) === launchingTemplateId
                return (
                  <article key={entry.plannedCase.id} className="rounded-lg border border-hairline bg-surface-2/35 px-4 py-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-body-md font-medium text-foreground">{entry.plannedCase.title}</h3>
                          <span className={cn("ui-status-badge ui-meta-text", cardToneClass(factoryCaseStatusTone(entry.status === "planned" ? "ready" : entry.status)))}>
                            {entry.status === "planned" ? "Planned" : factoryCaseStatusLabel(entry.status)}
                          </span>
                          {entry.plannedCase.scheduledFor ? (
                            <Badge variant="secondary" className="ui-meta-text px-2 py-0">
                              {formatFactoryDate(entry.plannedCase.scheduledFor)}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-body-sm text-muted-foreground">
                          {entry.plannedCase.summary || entry.plannedCase.sourceArtifactTitle || "Item case derived from a planning artifact."}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {entry.runtimeCase ? (
                        <Button variant="outline" size="sm" onClick={() => onFocusCase(entry.runtimeCase!.id)}>
                          Focus case
                        </Button>
                      ) : null}
                      {!entry.runtimeCase ? (
                        <Button
                          size="sm"
                          onClick={() => { void onLaunchPlannedCase(entry.plannedCase) }}
                          disabled={Boolean(launchingTemplateId)}
                        >
                          {isLaunching ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                          {isLaunching ? "Opening..." : "Start item"}
                        </Button>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading title="Operations" />

        <section className="rounded-xl surface-panel p-5 space-y-4">
          <SectionHeading
            title="Next actions"
            meta={(
              <Badge variant="outline" className="ui-meta-text px-2 py-0">
                {nextActions.length} queued
              </Badge>
            )}
          />

          {nextActions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
              No immediate actions right now. New review gates, live runs, and ready stages will surface here automatically.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {nextActions.slice(0, 6).map((action) => {
                const isSelected = selectedCase?.id === action.caseId
                const disciplineLabels = action.template ? deriveTemplateExecutionDisciplineLabels(action.template) : []
                const stageLabel = action.template ? deriveTemplateJourneyStageLabel(action.template) : null
                const isLaunching = action.template ? launchingTemplateId === action.template.id : false
                return (
                  <article
                    key={action.id}
                    className={`rounded-lg border px-4 py-4 space-y-4 ${
                      isSelected
                        ? "border-primary/35 bg-primary/8 shadow-[inset_0_1px_0_hsl(var(--primary)/0.08),0_10px_22px_hsl(var(--foreground)/0.05)]"
                        : "border-hairline bg-surface-2/35"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("ui-status-badge ui-meta-text", cardToneClass(action.tone))}>
                            {factoryActionLabel(action.kind)}
                          </span>
                          <Badge variant="secondary" className="ui-meta-text px-2 py-0">
                            {action.caseLabel}
                          </Badge>
                          {stageLabel ? (
                            <Badge variant="outline" className="ui-meta-text px-2 py-0">
                              {stageLabel}
                            </Badge>
                          ) : null}
                        </div>
                        <h2 className="mt-2 text-title-sm text-foreground">{action.title}</h2>
                        <p className="mt-1 text-body-sm text-muted-foreground">{action.description}</p>
                        <div className="mt-2 ui-meta-text text-muted-foreground">
                          {formatRelativeTime(action.timestamp)}
                          {action.run?.runStartedAt ? ` · ${formatElapsedTime(action.run.runStartedAt)}` : ""}
                        </div>
                        {disciplineLabels.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {disciplineLabels.slice(0, 3).map((label) => (
                              <Badge key={`${action.id}-${label}`} variant="secondary" className="ui-meta-text px-2 py-0">
                                {label}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {action.task ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenInboxTask(action.task!, action.caseId)}
                        >
                          <Inbox size={14} />
                          Review gate
                        </Button>
                      ) : null}
                      {action.run ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onFocusCase(action.caseId)
                            void onOpenWorkflow(action.run?.workflowPath || null)
                          }}
                          disabled={!action.run.workflowPath}
                        >
                          <ArrowUpRight size={14} />
                          Open run
                        </Button>
                      ) : null}
                      {action.template ? (
                        <Button
                          size="sm"
                          onClick={() => {
                            onFocusCase(action.caseId)
                            void onLaunchTemplate(action.template!, action.artifacts)
                          }}
                          disabled={Boolean(launchingTemplateId)}
                        >
                          {isLaunching ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                          {isLaunching ? "Opening..." : "Open stage"}
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="sm" onClick={() => onFocusCase(action.caseId)}>
                        Focus case
                      </Button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl surface-panel p-5 space-y-4">
          <SectionHeading
            title="Cases"
            meta={(
              <Badge variant="outline" className="ui-meta-text px-2 py-0">
                {scopedCases.length} tracked
              </Badge>
            )}
          />

          {scopedCases.length === 0 ? (
            <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
              No derived cases yet for this factory. Run an entry stage and persist artifacts to establish case lineage.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-4">
              {caseLanes.map((lane) => (
                <BoardLane
                  key={lane.status}
                  title={lane.title}
                  description={lane.description}
                  count={lane.cases.length}
                  tone={lane.tone}
                >
                  {lane.cases.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-hairline bg-surface-1/50 px-3 py-6 text-body-sm text-muted-foreground">
                      No cases in this lane right now.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {lane.cases.map((entry) => {
                        const statusTone = factoryCaseStatusTone(entry.status)
                        const primaryTemplate = entry.nextTemplates[0] || null
                        const isLaunching = primaryTemplate ? launchingTemplateId === primaryTemplate.id : false
                        const openWorkflowPath = entry.activeRun?.workflowPath || entry.workflowPaths[0] || null
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => onFocusCase(entry.id)}
                            className={`w-full rounded-lg border px-4 py-4 text-left space-y-4 ui-transition-colors ui-motion-fast ${
                              selectedCase?.id === entry.id
                                ? "border-primary/35 bg-primary/8 shadow-[inset_0_1px_0_hsl(var(--primary)/0.08),0_10px_22px_hsl(var(--foreground)/0.05)]"
                                : "border-hairline bg-surface-1/70 hover:bg-surface-1"
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h2 className="text-title-sm text-foreground">{entry.label}</h2>
                                  <span className={cn("ui-status-badge ui-meta-text", cardToneClass(statusTone))}>
                                    {factoryCaseStatusLabel(entry.status)}
                                  </span>
                                  {latestLineageLabel(entry) ? (
                                    <Badge variant="secondary" className="ui-meta-text px-2 py-0">
                                      {latestLineageLabel(entry)}
                                    </Badge>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-body-sm text-muted-foreground">
                                  {entry.latestArtifact
                                    ? `${entry.latestArtifact.title} · ${formatRelativeTime(entry.latestArtifact.updatedAt)}`
                                    : entry.activeRun?.workflowName || "Case in progress"}
                                </p>
                              </div>
                              {openWorkflowPath ? (
                                <Button variant="ghost" size="sm" onClick={() => { void onOpenWorkflow(openWorkflowPath) }}>
                                  <ArrowUpRight size={14} />
                                  Open
                                </Button>
                              ) : null}
                            </div>

                            <SummaryRail
                              items={[
                                {
                                  label: "Artifacts",
                                  value: String(entry.artifacts.length),
                                },
                                {
                                  label: "Tasks",
                                  value: String(entry.tasks.length),
                                  tone: entry.tasks.length > 0 ? "warning" : "default",
                                },
                                {
                                  label: "Next stages",
                                  value: String(entry.nextTemplates.length),
                                  tone: entry.nextTemplates.length > 0 ? "success" : "default",
                                },
                              ]}
                              className="sm:grid-cols-3"
                              compact
                            />

                            <div className="space-y-2">
                              <div className="ui-meta-label text-muted-foreground">Next action</div>
                              {entry.activeRun ? (
                                <div className="rounded-md surface-info-soft px-3 py-2 text-body-sm text-foreground">
                                  {entry.activeRun.summary.activeStepLabel || "Run in progress"}{entry.activeRun.runStartedAt ? ` · ${formatElapsedTime(entry.activeRun.runStartedAt)}` : ""}
                                </div>
                              ) : entry.tasks[0] ? (
                                <div className="rounded-md surface-warning-soft px-3 py-2 text-body-sm text-foreground">
                                  {entry.tasks[0].title}
                                </div>
                              ) : primaryTemplate ? (
                                <div className="rounded-md surface-success-soft px-3 py-2 text-body-sm text-foreground">
                                  {primaryTemplate.name}
                                </div>
                              ) : (
                                <div className="rounded-md border border-hairline bg-surface-1/70 px-3 py-2 text-body-sm text-muted-foreground">
                                  No next stage detected yet.
                                </div>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {entry.tasks.length > 0 ? (
                                <Button variant="outline" size="sm" onClick={() => {
                                  if (entry.tasks[0]) {
                                    onOpenInboxTask(entry.tasks[0], entry.id)
                                  }
                                }}>
                                  <Inbox size={14} />
                                  Review gate
                                </Button>
                              ) : null}
                              {primaryTemplate ? (
                                <Button
                                  size="sm"
                                  onClick={() => { void onLaunchTemplate(primaryTemplate, entry.artifacts) }}
                                  disabled={Boolean(launchingTemplateId)}
                                >
                                  {isLaunching ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                                  {isLaunching ? "Opening..." : "Open next stage"}
                                </Button>
                              ) : null}
                              <Button variant="ghost" size="sm" onClick={() => onOpenCaseArtifacts(entry.id)}>
                                <FileStack size={14} />
                                Artifacts
                              </Button>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </BoardLane>
              ))}
            </div>
          )}
        </section>

        {selectedCase ? (
          <CaseDetail
            selectedCase={selectedCase}
            selectedCaseSummary={selectedCaseSummary}
            launchingTemplateId={launchingTemplateId}
            onLaunchTemplate={onLaunchTemplate}
            onOpenArtifact={onOpenArtifact}
            onOpenCaseArtifacts={onOpenCaseArtifacts}
            onOpenInboxTask={onOpenInboxTask}
            onOpenReport={onOpenReport}
            onOpenWorkflow={onOpenWorkflow}
          />
        ) : null}

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <article className="rounded-xl surface-panel p-5 space-y-4">
            <SectionHeading
              title="Needs your input"
              meta={(
                <Badge variant="outline" className="ui-meta-text px-2 py-0">
                  {humanTasksLoading ? "Loading..." : `${scopedHumanTasks.length} open`}
                </Badge>
              )}
            />

            {humanTasksError ? (
              <div role="alert" className="rounded-lg border border-status-danger/25 bg-status-danger/5 px-4 py-3 text-body-sm text-status-danger">
                {humanTasksError}
              </div>
            ) : scopedHumanTasks.length === 0 && !humanTasksLoading ? (
              <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
                No human gates are blocking this factory right now.
              </div>
            ) : (
              <div className="space-y-2">
                {scopedHumanTasks.slice(0, 4).map((task) => (
                  <div
                    key={`${task.workspace}:${task.taskId}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-2/45 px-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-body-sm font-medium text-foreground">{task.title}</div>
                        <Badge variant={task.kind === "approval" ? "warning" : "info"} className="ui-meta-text px-2 py-0">
                          {task.kind === "approval" ? "Review gate" : "Input needed"}
                        </Badge>
                      </div>
                      <div className="mt-1 text-body-sm text-muted-foreground">
                        {task.workflowName} · {formatRelativeTime(task.createdAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {task.workflowPath ? (
                        <Button variant="ghost" size="sm" onClick={() => { void onOpenWorkflow(task.workflowPath || null) }}>
                          <ArrowUpRight size={14} />
                          Open flow
                        </Button>
                      ) : null}
                      <Button variant="outline" size="sm" onClick={() => onOpenInboxTask(task)}>
                        <Inbox size={14} />
                        Review
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="rounded-xl surface-panel p-5 space-y-4">
            <SectionHeading
              title="Ready to launch"
              meta={(
                <Badge variant="outline" className="ui-meta-text px-2 py-0">
                  {templatesLoading ? "Loading..." : `${scopedCompatibleTemplates.length} ready`}
                </Badge>
              )}
            />

            {templatesError ? (
              <div role="alert" className="rounded-lg border border-status-danger/25 bg-status-danger/5 px-4 py-3 text-body-sm text-status-danger">
                {templatesError}
              </div>
            ) : scopedReadyTemplates.length === 0 && !templatesLoading ? (
              <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
                No downstream stage is fully ready yet for this factory. Use artifacts to build up the required contracts first.
              </div>
            ) : (
              <div className="space-y-2">
                {scopedReadyTemplates.map((template) => {
                  const stageLabel = deriveTemplateJourneyStageLabel(template)
                  const disciplineLabels = deriveTemplateExecutionDisciplineLabels(template)
                  const isLaunching = launchingTemplateId === template.id
                  return (
                    <div
                      key={template.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-2/45 px-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-body-sm font-medium text-foreground">{template.name}</div>
                          {template.pack ? (
                            <Badge variant="outline" className="ui-meta-text px-2 py-0">
                              {template.pack.label}
                            </Badge>
                          ) : null}
                          {stageLabel ? (
                            <Badge variant="secondary" className="ui-meta-text px-2 py-0">
                              {stageLabel}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 text-body-sm text-muted-foreground">
                          {disciplineLabels.length > 0
                            ? disciplineLabels.join(" · ")
                            : "Ready from the current factory artifacts."}
                        </div>
                      </div>
                      <Button size="sm" onClick={() => { void onLaunchTemplate(template, scopedArtifacts) }} disabled={Boolean(launchingTemplateId)}>
                        {isLaunching ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                        {isLaunching ? "Opening..." : "Open stage"}
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </article>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <article className="rounded-xl surface-panel p-5 space-y-4">
            <SectionHeading
              title={scopedLiveRunEntries.length > 0 ? "Live work" : "Recent runs"}
              meta={(
                <Badge variant="outline" className="ui-meta-text px-2 py-0">
                  {scopedLiveRunEntries.length > 0 ? `${scopedLiveRunEntries.length} tracked` : `${scopedRecentRuns.length} recent`}
                </Badge>
              )}
            />

            {scopedLiveRunEntries.length === 0 && scopedRecentRuns.length === 0 ? (
              <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
                No runs to show yet for this factory.
              </div>
            ) : scopedLiveRunEntries.length > 0 ? (
              <div className="space-y-2">
                {scopedLiveRunEntries.slice(0, 4).map((entry) => (
                  <div
                    key={entry.workflowKey}
                    className="rounded-lg border border-hairline bg-surface-2/45 px-3 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-body-sm font-medium text-foreground">{entry.workflowName}</div>
                          <span className={cn("ui-status-badge ui-meta-text", cardToneClass(entry.summary.tone))}>
                            {entry.summary.phaseLabel}
                          </span>
                        </div>
                        <div className="mt-1 text-body-sm text-muted-foreground">
                          {entry.summary.activeStepLabel || "Waiting for the next step"}{entry.runStartedAt ? ` · ${formatElapsedTime(entry.runStartedAt)}` : ""}
                        </div>
                        <div className="mt-1 ui-meta-text text-muted-foreground">
                          Step {Math.min(entry.summary.completedSteps, entry.summary.totalSteps)}/{entry.summary.totalSteps || 0}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {entry.reportPath ? (
                          <Button variant="ghost" size="sm" onClick={() => { void onOpenReport(entry.reportPath) }}>
                            <FileStack size={14} />
                            Report
                          </Button>
                        ) : null}
                        <Button variant="outline" size="sm" onClick={() => { void onOpenWorkflow(entry.workflowPath) }} disabled={!entry.workflowPath}>
                          <ArrowUpRight size={14} />
                          Open
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {scopedRecentRuns.map((run) => (
                  <div
                    key={run.runId}
                    className="rounded-lg border border-hairline bg-surface-2/45 px-3 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-body-sm font-medium text-foreground">{run.workflowName}</div>
                          <Badge variant={run.status === "completed" ? "success" : run.status === "failed" ? "destructive" : "outline"} className="ui-meta-text px-2 py-0">
                            {run.status}
                          </Badge>
                        </div>
                        <div className="mt-1 text-body-sm text-muted-foreground">
                          {run.completedAt ? `Finished ${formatRelativeTime(run.completedAt)}` : `Started ${formatRelativeTime(run.startedAt)}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {run.reportPath ? (
                          <Button variant="ghost" size="sm" onClick={() => { void onOpenReport(run.reportPath) }}>
                            <FileStack size={14} />
                            Report
                          </Button>
                        ) : null}
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
          </article>

          <article className="rounded-xl surface-panel p-5 space-y-4">
            <SectionHeading
              title="Recent artifacts"
              meta={(
                <Button variant="ghost" size="sm" onClick={onOpenArtifactsLibrary}>
                  <ArrowUpRight size={14} />
                  Open library
                </Button>
              )}
            />

            {artifactsError ? (
              <div role="alert" className="rounded-lg border border-status-danger/25 bg-status-danger/5 px-4 py-3 text-body-sm text-status-danger">
                {artifactsError}
              </div>
            ) : scopedRecentArtifacts.length === 0 && !artifactsLoading ? (
              <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
                No reusable artifacts have been saved for this factory yet.
              </div>
            ) : (
              <div className="space-y-2">
                {scopedRecentArtifacts.map((artifact) => (
                  <div
                    key={artifact.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-2/45 px-3 py-3"
                  >
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
                    </div>
                    <Button variant="outline" size="sm" onClick={() => { void onOpenArtifact(artifact) }}>
                      <FileStack size={14} />
                      Open
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      </section>
    </section>
  )
}
