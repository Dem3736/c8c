import { Loader2, Play, Square } from "lucide-react"
import type { PermissionMode } from "@shared/types"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/cn"
import type { ValidationError } from "@/lib/validate-workflow"

export interface WorkflowValidationGroup {
  nodeId: string
  label: string
  issues: ValidationError[]
}

interface WorkflowRunControlsProps {
  controlGroupClass: string
  isRunning: boolean
  isPaused: boolean
  isCancelling: boolean
  isStarting: boolean
  runControlPending: "pause" | "resume" | null
  runShortcutLabel: string
  workflowValidation: ValidationError[]
  hasBlockingErrors: boolean
  blockingValidationCount: number
  warningValidationCount: number
  groupedValidationIssues: WorkflowValidationGroup[]
  canRun: boolean
  runDisabledReason: string | null
  hasRunMenuActions: boolean
  canBatchRun: boolean
  batchDisabledReason: string | null
  onPause: () => void
  onResume: () => void
  onCancel: () => void
  onRun: (mode: PermissionMode) => void
  onNavigateToValidationIssue: (issue: ValidationError) => void
  onOpenBatch: () => void
}

export function WorkflowRunControls({
  controlGroupClass,
  isRunning,
  isPaused,
  isCancelling,
  isStarting,
  runControlPending,
  runShortcutLabel,
  workflowValidation,
  hasBlockingErrors,
  blockingValidationCount,
  warningValidationCount,
  groupedValidationIssues,
  canRun,
  runDisabledReason,
  hasRunMenuActions,
  canBatchRun,
  batchDisabledReason,
  onPause,
  onResume,
  onCancel,
  onRun,
  onNavigateToValidationIssue,
  onOpenBatch,
}: WorkflowRunControlsProps) {
  return (
    <div
      role="group"
      aria-label="Run controls"
      className={cn(
        "flex items-center gap-1 rounded-lg p-1 ui-transition-surface ui-motion-fast",
        isRunning
          ? isPaused
            ? "surface-warning-soft shadow-inset-highlight-subtle"
            : "surface-info-soft shadow-inset-highlight-subtle"
          : controlGroupClass,
      )}
    >
      {isRunning ? (
        <>
          {isPaused ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className="ui-fade-slide-in-trailing gap-1.5"
                  onClick={onResume}
                  disabled={runControlPending !== null}
                >
                  {runControlPending === "resume" ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  {runControlPending === "resume" ? "Resuming..." : "Resume"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Resume run</TooltipContent>
            </Tooltip>
          ) : (
            <></>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isPaused ? "outline" : "destructive"}
                size="sm"
                className="ui-fade-slide-in-trailing"
                onClick={onCancel}
                disabled={isCancelling || isStarting}
              >
                {isCancelling ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
                {isCancelling ? "Stopping..." : isStarting ? "Connecting..." : "Cancel"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isCancelling ? "Stopping run..." : isStarting ? "Connecting to CLI..." : `Cancel run (${runShortcutLabel})`}
            </TooltipContent>
          </Tooltip>
        </>
      ) : (
        <div className="flex items-center gap-0.5 rounded-lg control-cluster p-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="sm"
                onClick={() => onRun("edit")}
                disabled={!canRun}
                className="min-w-[5.75rem] gap-1.5 rounded-md pr-3 shadow-[inset_0_1px_0_hsl(var(--primary-foreground)/0.2),0_0_0_1px_hsl(var(--hairline)/0.22)]"
                title={runDisabledReason || undefined}
              >
                <Play size={14} />
                Run
              </Button>
            </TooltipTrigger>
            <TooltipContent>{runDisabledReason || `Run in edit mode (${runShortcutLabel})`}</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  )
}
