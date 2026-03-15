import type { RunResult } from "@shared/types"

export function historicalRunVisual(status?: string): {
  label: string
  progress: number
  barClass: string
  textClass: string
  dotClass: string
} {
  switch (status) {
    case "completed":
      return {
        label: "completed",
        progress: 100,
        barClass: "bg-status-success",
        textClass: "text-status-success",
        dotClass: "border-status-success/30 bg-status-success",
      }
    case "failed":
      return {
        label: "failed",
        progress: 78,
        barClass: "bg-status-danger",
        textClass: "text-status-danger",
        dotClass: "border-status-danger/30 bg-status-danger",
      }
    case "interrupted":
      return {
        label: "interrupted",
        progress: 56,
        barClass: "bg-status-warning",
        textClass: "text-status-warning",
        dotClass: "border-status-warning/30 bg-status-warning",
      }
    case "cancelled":
      return {
        label: "cancelled",
        progress: 40,
        barClass: "bg-muted-foreground/60",
        textClass: "text-muted-foreground",
        dotClass: "border-muted-foreground/20 bg-muted-foreground/70",
      }
    default:
      return {
        label: "no runs yet",
        progress: 0,
        barClass: "bg-muted-foreground/50",
        textClass: "text-muted-foreground",
        dotClass: "border-muted-foreground/20 bg-muted-foreground/45",
      }
  }
}

export function projectFolderName(projectPath: string): string {
  return projectPath.split("/").pop() || projectPath
}

export function formatRelativeTime(updatedAt?: number): string {
  if (!updatedAt) return ""
  const deltaMs = Date.now() - updatedAt
  if (deltaMs < 60_000) return "now"
  const minutes = Math.floor(deltaMs / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  return `${weeks}w`
}

export function workflowHasActiveRunStatus(status?: string): boolean {
  return status === "starting"
    || status === "running"
    || status === "paused"
    || status === "cancelling"
}

export function latestRunByWorkflowPath(pastRuns: RunResult[]): Map<string, RunResult> {
  const result = new Map<string, RunResult>()
  for (const run of pastRuns) {
    const path = run.workflowPath
    if (!path || result.has(path)) continue
    result.set(path, run)
  }
  return result
}
