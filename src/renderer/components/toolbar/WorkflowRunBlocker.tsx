import { cn } from "@/lib/cn"
import type { ValidationError } from "@/lib/validate-workflow"

interface WorkflowRunBlockerProps {
  isRunning: boolean
  workflowReviewMode: boolean
  runDisabledReason: string | null
  workflowValidation: ValidationError[]
  hasBlockingErrors: boolean
  onNavigateToValidationIssue: (issue: ValidationError) => void
}

export function WorkflowRunBlocker({
  isRunning,
  workflowReviewMode,
  runDisabledReason,
  workflowValidation,
  hasBlockingErrors,
  onNavigateToValidationIssue,
}: WorkflowRunBlockerProps) {
  return (
    <div
      data-open={!isRunning && !workflowReviewMode && Boolean(runDisabledReason) ? "true" : "false"}
      className={cn(
        "ui-collapsible",
        !isRunning && !workflowReviewMode && runDisabledReason && "border-b border-hairline",
      )}
    >
      <div className="ui-collapsible-inner">
        <div className="px-3 py-1 ui-meta-text text-muted-foreground bg-surface-1/70">
          {runDisabledReason || ""}
          {hasBlockingErrors && (
            <ul className="mt-1 space-y-1">
              {workflowValidation.filter((issue) => issue.severity === "error").map((issue) => (
                <li key={`${issue.nodeId}-${issue.field}`}>
                  <button
                    type="button"
                    onClick={() => onNavigateToValidationIssue(issue)}
                    className="text-left text-status-danger underline-offset-2 hover:underline"
                  >
                    {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
