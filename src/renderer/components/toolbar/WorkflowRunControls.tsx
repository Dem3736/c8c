import { AlertTriangle, ChevronDown, Eye, Layers, Loader2, Pause, Play, Square } from "lucide-react"
import type { PermissionMode } from "@shared/types"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  batchDisabledReason: string | null
  hasSkillNodes: boolean
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
  batchDisabledReason,
  hasSkillNodes,
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
                  variant="outline"
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="ui-fade-slide-in-trailing gap-1.5"
                  onClick={onPause}
                  disabled={isCancelling || isStarting || runControlPending !== null}
                >
                  {runControlPending === "pause" ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />}
                  {runControlPending === "pause" ? "Pausing..." : "Pause"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Pause run (running nodes will finish)</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                className="ui-fade-slide-in-trailing"
                onClick={onCancel}
                disabled={isCancelling || isStarting}
              >
                {isCancelling ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
                {isCancelling ? "Stopping..." : isStarting ? "Connecting..." : "Stop"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isCancelling ? "Stopping run..." : isStarting ? "Connecting to CLI..." : `Stop run (${runShortcutLabel})`}
            </TooltipContent>
          </Tooltip>
        </>
      ) : (
        <div className="flex items-center gap-0.5 rounded-lg control-cluster p-0.5">
          {workflowValidation.length > 0 && (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "gap-1.5 rounded-md px-2 text-status-warning hover:bg-status-warning/10 hover:text-status-warning",
                        hasBlockingErrors && "bg-status-warning/8",
                      )}
                      aria-label={`${workflowValidation.length} validation issue${workflowValidation.length === 1 ? "" : "s"}`}
                    >
                      <AlertTriangle size={14} />
                      <span className="text-body-sm font-medium">
                        {blockingValidationCount > 0 ? blockingValidationCount : warningValidationCount}
                      </span>
                      {blockingValidationCount > 0 && warningValidationCount > 0 && (
                        <span className="ui-meta-text text-muted-foreground">+{warningValidationCount}</span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  {blockingValidationCount > 0
                    ? `${blockingValidationCount} error(s) and ${warningValidationCount} warning(s)`
                    : `${warningValidationCount} warning(s)`}
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-[360px] max-h-[24rem] overflow-y-auto">
                <DropdownMenuLabel>Flow issues</DropdownMenuLabel>
                {groupedValidationIssues.map((group, groupIndex) => (
                  <div key={group.nodeId}>
                    {groupIndex > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="ui-meta-label text-muted-foreground">
                      {group.label}
                    </DropdownMenuLabel>
                    {group.issues.map((issue) => (
                      <DropdownMenuItem
                        key={`${issue.nodeId}-${issue.field}-${issue.message}`}
                        onSelect={() => onNavigateToValidationIssue(issue)}
                        className="items-start gap-3 py-2"
                      >
                        <span
                          className={cn(
                            "mt-1 inline-flex h-2 w-2 shrink-0 rounded-full",
                            issue.severity === "error" ? "bg-status-danger" : "bg-status-warning",
                          )}
                          aria-hidden="true"
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="text-body-sm text-foreground">{issue.message}</span>
                          <span className="ui-meta-text text-muted-foreground">
                            {issue.field.replace(/^config\./, "")}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!hasRunMenuActions}
                    className="relative w-8 rounded-md border border-transparent px-0 text-muted-foreground hover:border-hairline/80 hover:bg-surface-1/90 hover:text-foreground before:absolute before:left-0 before:top-1/2 before:h-4 before:w-px before:-translate-y-1/2 before:bg-hairline/70"
                    aria-label="Choose run mode"
                    title={!hasRunMenuActions ? batchDisabledReason || undefined : undefined}
                  >
                    <ChevronDown size={14} />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{hasRunMenuActions ? "More run options" : batchDisabledReason}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Run options</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!canRun}
                onSelect={() => onRun("plan")}
                className="items-start gap-3 py-2"
              >
                <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-md border border-hairline bg-surface-2 text-muted-foreground ui-elevation-inset">
                  <Eye size={13} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-body-sm font-medium text-foreground">Run in plan mode</span>
                  <span className="ui-meta-text text-muted-foreground">
                    {canRun ? "Read-only analysis without file edits" : (runDisabledReason || "Unavailable")}
                  </span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!hasSkillNodes}
                onSelect={onOpenBatch}
                className="items-start gap-3 py-2"
              >
                <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-md border border-hairline bg-surface-2 text-muted-foreground ui-elevation-inset">
                  <Layers size={13} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-body-sm font-medium text-foreground">Batch run</span>
                  <span className="ui-meta-text text-muted-foreground">
                    {batchDisabledReason || "Run the flow on multiple inputs"}
                  </span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}
