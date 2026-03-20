import { useCallback } from "react"
import type { RunResult, WorkflowFile } from "@shared/types"
import type { WorkflowExecutionState } from "@/lib/workflow-execution"
import {
  historicalRunVisual,
  workflowHasActiveRunStatus,
} from "./projectSidebarUtils"

interface UseProjectSidebarMetricsParams {
  projectLatestRunsCache: Record<string, Record<string, RunResult>>
  workflowExecutionStates: Record<string, WorkflowExecutionState>
  selectedWorkflowPath: string | null
}

export interface WorkflowRunMetrics {
  runStatus: string
  completedSteps: number
  failedSteps: number
  progress: number
  totalSteps: number
  waitingSteps: number
  barClass: string
  textClass: string
  showProgressTrack: boolean
}

export function useProjectSidebarMetrics({
  projectLatestRunsCache,
  workflowExecutionStates,
  selectedWorkflowPath,
}: UseProjectSidebarMetricsParams) {
  const getWorkflowRunMetrics = useCallback((workflowPath: string): WorkflowRunMetrics => {
    const executionState = workflowExecutionStates[workflowPath]
    const runStatus = executionState?.runStatus ?? "idle"
    const activeRunStates = Object.values(executionState?.nodeStates ?? {})
    let completedSteps = 0
    let failedSteps = 0
    let waitingSteps = 0

    for (const state of activeRunStates) {
      const status = state.status || "pending"
      if (status === "completed" || status === "skipped") completedSteps += 1
      if (status === "failed") failedSteps += 1
      if (status === "waiting_approval" || status === "waiting_human") waitingSteps += 1
    }

    const totalSteps = activeRunStates.length
    const progress = totalSteps > 0
      ? Math.round((completedSteps / totalSteps) * 100)
      : 0
    const toneClass = runStatus === "paused" || runStatus === "cancelling" || waitingSteps > 0
      ? "status-warning"
      : failedSteps > 0
        ? "status-danger"
        : "status-info"

    return {
      runStatus,
      completedSteps,
      failedSteps,
      progress,
      totalSteps,
      waitingSteps,
      barClass: toneClass === "status-warning"
        ? "bg-status-warning"
        : toneClass === "status-danger"
          ? "bg-status-danger"
          : "bg-status-info",
      textClass: toneClass === "status-warning"
        ? "text-status-warning"
        : toneClass === "status-danger"
          ? "text-status-danger"
          : "text-status-info",
      showProgressTrack: workflowHasActiveRunStatus(runStatus) && totalSteps > 0,
    }
  }, [workflowExecutionStates])

  const getProjectStatusRollup = useCallback((projectPath: string, projectWorkflows: WorkflowFile[]) => {
    let activeCount = 0
    let waitingCount = 0
    let attentionCount = 0

    for (const workflow of projectWorkflows) {
      const metrics = getWorkflowRunMetrics(workflow.path)
      const latestRun = projectLatestRunsCache[projectPath]?.[workflow.path]
      const runIsActive = workflowHasActiveRunStatus(metrics.runStatus)
      const runNeedsAttention = metrics.failedSteps > 0
        || metrics.waitingSteps > 0
        || (!runIsActive && (latestRun?.status === "failed" || latestRun?.status === "interrupted"))

      if (runIsActive) activeCount += 1
      if (metrics.waitingSteps > 0 || metrics.runStatus === "paused" || metrics.runStatus === "cancelling") {
        waitingCount += 1
      }
      if (runNeedsAttention) attentionCount += 1
    }

    return {
      activeCount,
      waitingCount,
      attentionCount,
    }
  }, [getWorkflowRunMetrics, projectLatestRunsCache])

  const sortProjectWorkflows = useCallback((projectPath: string, projectWorkflows: WorkflowFile[]) => {
    return [...projectWorkflows].sort((left, right) => {
      const leftMetrics = getWorkflowRunMetrics(left.path)
      const rightMetrics = getWorkflowRunMetrics(right.path)
      const leftLatestRun = projectLatestRunsCache[projectPath]?.[left.path]
      const rightLatestRun = projectLatestRunsCache[projectPath]?.[right.path]

      const rank = (
        metrics: WorkflowRunMetrics,
        latestRunStatus?: string | null,
        workflowPath?: string,
      ) => {
        if (selectedWorkflowPath === workflowPath) return 700
        if (workflowHasActiveRunStatus(metrics.runStatus)) return 600
        if (metrics.waitingSteps > 0 || metrics.runStatus === "paused" || metrics.runStatus === "cancelling") return 500
        if (metrics.failedSteps > 0 || latestRunStatus === "failed" || latestRunStatus === "interrupted") return 400
        if (latestRunStatus === "completed") return 300
        return 100
      }

      const leftRank = rank(leftMetrics, leftLatestRun?.status || null, left.path)
      const rightRank = rank(rightMetrics, rightLatestRun?.status || null, right.path)
      if (leftRank !== rightRank) return rightRank - leftRank

      return (right.updatedAt || 0) - (left.updatedAt || 0)
    })
  }, [getWorkflowRunMetrics, projectLatestRunsCache, selectedWorkflowPath])

  const getHistoricalRunVisual = useCallback((projectPath: string, workflowPath: string) => {
    const latestRun = projectLatestRunsCache[projectPath]?.[workflowPath]
    return {
      latestRun,
      latestRunMeta: historicalRunVisual(latestRun?.status),
    }
  }, [projectLatestRunsCache])

  return {
    getWorkflowRunMetrics,
    getProjectStatusRollup,
    sortProjectWorkflows,
    getHistoricalRunVisual,
  }
}
