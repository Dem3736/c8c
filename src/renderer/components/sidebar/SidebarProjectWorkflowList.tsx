import type { WorkflowExecutionState } from "@/lib/workflow-execution"
import type { WorkflowFile } from "@shared/types"
import { buildSidebarWorkflowSummary, formatRelativeTime, workflowHasActiveRunStatus } from "./projectSidebarUtils"
import { SidebarWorkflowRow } from "./SidebarWorkflowRow"
import type { SidebarContextMenuState } from "./SidebarWorkflowDialogs"
import type { WorkflowRunMetrics } from "./useProjectSidebarMetrics"

const PROJECT_WORKFLOW_PREVIEW_LIMIT = 10
const PROJECT_WORKFLOW_LOADING_ROWS = 3

interface SidebarProjectWorkflowListProps {
  projectPath: string
  projectLabel: string
  projectWorkflows: WorkflowFile[]
  isProjectLoading: boolean
  workflowSearchQuery: string
  isWorkflowListExpanded: boolean
  selectedWorkflowPath: string | null
  workflowDirty: boolean
  workflowExecutionStates: Record<string, WorkflowExecutionState>
  getWorkflowRunMetrics: (workflowPath: string) => WorkflowRunMetrics
  getHistoricalRunVisual: (projectPath: string, workflowPath: string) => {
    latestRun?: { status?: string } | null
    latestRunMeta: { label: string; dotClass: string }
  }
  sortProjectWorkflows: (projectPath: string, projectWorkflows: WorkflowFile[]) => WorkflowFile[]
  onToggleExpanded: () => void
  onOpenWorkflow: (workflow: WorkflowFile) => void
  onRenameWorkflow: (workflow: WorkflowFile) => void
  onDeleteWorkflow: (workflow: WorkflowFile) => void
  onWorkflowContextMenu: (payload: SidebarContextMenuState) => void
}

export function SidebarProjectWorkflowList({
  projectPath,
  projectLabel,
  projectWorkflows,
  isProjectLoading,
  workflowSearchQuery,
  isWorkflowListExpanded,
  selectedWorkflowPath,
  workflowDirty,
  workflowExecutionStates,
  getWorkflowRunMetrics,
  getHistoricalRunVisual,
  sortProjectWorkflows,
  onToggleExpanded,
  onOpenWorkflow,
  onRenameWorkflow,
  onDeleteWorkflow,
  onWorkflowContextMenu,
}: SidebarProjectWorkflowListProps) {
  const hasSearchQuery = workflowSearchQuery.trim().length > 0
  const filteredProjectWorkflows = sortProjectWorkflows(projectPath, projectWorkflows).filter((workflow) => {
    if (!hasSearchQuery) return true
    return workflow.name.toLowerCase().includes(workflowSearchQuery.trim().toLowerCase())
  })
  const autoExpandWorkflowList = !hasSearchQuery
    && filteredProjectWorkflows
      .slice(PROJECT_WORKFLOW_PREVIEW_LIMIT)
      .some((workflow) => workflow.path === selectedWorkflowPath)
  const visibleProjectWorkflows = hasSearchQuery || isWorkflowListExpanded || autoExpandWorkflowList
    ? filteredProjectWorkflows
    : filteredProjectWorkflows.slice(0, PROJECT_WORKFLOW_PREVIEW_LIMIT)
  const shouldShowWorkflowToggle = !hasSearchQuery
    && filteredProjectWorkflows.length > PROJECT_WORKFLOW_PREVIEW_LIMIT

  return (
    <div className="mt-0.5 ml-7 space-y-px">
      <div role="listbox" aria-label={`${projectLabel} flows`}>
        {isProjectLoading && filteredProjectWorkflows.length === 0
          ? Array.from({ length: PROJECT_WORKFLOW_LOADING_ROWS }, (_, index) => (
            <div
              key={`loading-${projectPath}-${index}`}
              className="sidebar-thread-row"
              aria-hidden="true"
            >
              <div className="flex items-center gap-1.5 px-1 py-0.5">
                <span className="inline-flex h-2 w-2 flex-shrink-0 rounded-full bg-muted-foreground/20" />
                <span className="min-w-0 flex-1">
                  <span className="block h-3.5 w-[72%] rounded bg-muted-foreground/12" />
                  <span className="mt-1 block h-3 w-[40%] rounded bg-muted-foreground/10" />
                </span>
                <span className="h-3 w-7 rounded bg-muted-foreground/10" />
              </div>
            </div>
          ))
          : visibleProjectWorkflows.map((workflow) => {
            const runMetrics = getWorkflowRunMetrics(workflow.path)
            const workflowRunStatus = runMetrics.runStatus
            const isSelected = selectedWorkflowPath === workflow.path
            const isRunOwner = workflowHasActiveRunStatus(workflowRunStatus)
            const isDirty = isSelected && workflowDirty
            const { latestRun, latestRunMeta } = getHistoricalRunVisual(projectPath, workflow.path)
            const workflowSummary = buildSidebarWorkflowSummary({
              executionState: workflowExecutionStates[workflow.path],
            })
            const showSpinningIndicator = workflowRunStatus === "starting"
              || workflowRunStatus === "running"
              || workflowRunStatus === "cancelling"
            const activeIndicatorClass = runMetrics.textClass === "text-status-warning"
              ? "border-status-warning/30 bg-status-warning"
              : runMetrics.textClass === "text-status-danger"
                ? "border-status-danger/30 bg-status-danger"
                : "border-status-info/30 bg-status-info"
            const rowMeta = isRunOwner && runMetrics.totalSteps > 0
              ? `${runMetrics.completedSteps}/${runMetrics.totalSteps}`
              : (isRunOwner ? "now" : formatRelativeTime(workflow.updatedAt))
            const rowMetaClass = isRunOwner && runMetrics.totalSteps > 0
              ? runMetrics.textClass
              : "text-muted-foreground"
            const indicatorTitle = isRunOwner
              ? (
                runMetrics.totalSteps > 0
                  ? `${workflowRunStatus}: ${runMetrics.completedSteps}/${runMetrics.totalSteps}`
                  : workflowRunStatus
              )
              : (latestRun ? `Last run ${latestRunMeta.label}` : "No runs yet")
            const indicatorDotClass = isRunOwner ? activeIndicatorClass : latestRunMeta.dotClass

            return (
              <SidebarWorkflowRow
                key={workflow.path}
                workflow={workflow}
                isSelected={isSelected}
                isDirty={isDirty}
                detailLabel={workflowSummary.detailLabel}
                showSpinningIndicator={showSpinningIndicator}
                indicatorTitle={indicatorTitle}
                indicatorDotClass={indicatorDotClass}
                rowMeta={rowMeta}
                rowMetaClass={rowMetaClass}
                progress={runMetrics.progress}
                progressBarClass={runMetrics.barClass}
                runStatus={runMetrics.runStatus}
                showProgressTrack={runMetrics.showProgressTrack}
                onOpen={() => onOpenWorkflow(workflow)}
                onRename={() => onRenameWorkflow(workflow)}
                onDelete={() => onDeleteWorkflow(workflow)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onWorkflowContextMenu({
                    x: event.clientX,
                    y: event.clientY,
                    scope: "workflow",
                    workflow,
                    projectPath,
                  })
                }}
              />
            )
          })}
      </div>

      {shouldShowWorkflowToggle && !autoExpandWorkflowList && (
        <button
          type="button"
          data-sidebar-item="true"
          onClick={onToggleExpanded}
          className="ui-pressable ml-1 inline-flex h-6 items-center rounded-md px-1.5 text-sidebar-meta text-muted-foreground hover:bg-sidebar-hover hover:text-foreground ui-transition-colors ui-motion-fast"
        >
          {isWorkflowListExpanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  )
}
