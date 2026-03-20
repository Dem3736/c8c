import type { ReactNode } from "react"
import { ArrowRight, Download, FileText, FolderTree } from "lucide-react"
import ReactMarkdown, { type Components as MarkdownComponents } from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import remarkGfm from "remark-gfm"

import { CopyButton } from "@/components/ui/copy-button"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import { ScopeBanner } from "@/components/ui/scope-banner"
import { SummaryRail } from "@/components/ui/summary-rail"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/cn"
import type { ExecutionLoopSummary } from "@/lib/execution-loops"
import type { RuntimeStagePresentation } from "@/lib/runtime-flow-labels"
import { ExecutionCheckRecord } from "@/components/ui/execution-check-record"
import { ExecutionLoopCard } from "@/components/ui/execution-loop-card"
import type { ArtifactRecord, RunResult } from "@shared/types"

const MARKDOWN_PROSE_CLASS = "prose-c8c"
const MARKDOWN_COMPONENTS: MarkdownComponents = {
  a: ({ href, children, ...props }) => {
    const safeHref = typeof href === "string" ? href : ""
    return (
      <a
        {...props}
        href={safeHref}
        target="_blank"
        rel="noreferrer noopener"
        onClick={(event) => {
          if (!safeHref) {
            event.preventDefault()
          }
        }}
      >
        {children}
      </a>
    )
  },
}

function formatDurationMs(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs}ms`
  const seconds = durationMs / 1_000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = Math.round(seconds % 60)
  return `${minutes}m ${remainSeconds}s`
}

function formatRunDuration(run: RunResult): string {
  if (typeof run.durationMs === "number" && run.durationMs >= 0) {
    return formatDurationMs(run.durationMs)
  }
  if (run.completedAt > 0 && run.startedAt > 0) {
    const delta = run.completedAt - run.startedAt
    if (delta > 0) return formatDurationMs(delta)
  }
  return "n/a"
}

function formatResultCountLabel(count: number) {
  return `${count} result${count === 1 ? "" : "s"}`
}

interface ResultNodeOption {
  id: string
  label: string
  hasContent: boolean
}

export function ResultTab({
  reviewingRunHistory,
  selectedReviewRun,
  selectedResultPresentation,
  selectedResultBranchLabel,
  selectedResultMetricsLabel,
  isDisplayedResultEmpty,
  executionLoopSummary,
  approvalLoopSummary,
  savedRunLoadingNotice,
  savedRunErrorNotice,
  hasMultipleResultOptions,
  resultNodeOptions,
  selectedResultNodeId,
  onSelectResultNode,
  showArtifactContinuation,
  artifactContinuationToneClass,
  artifactPersistenceStatus,
  artifactPersistenceError,
  artifactRecords,
  nextStageRequiresApproval,
  nextStageAutoRuns,
  nextStageLabel,
  nextStageDescription,
  nextStageOutput,
  nextStagePending,
  onRunNextStage,
  onOpenArtifacts,
  visibleArtifactContinuation,
  hiddenArtifactContinuationCount,
  visibleNextStageArtifacts,
  hiddenNextStageArtifactCount,
  primaryModifierLabel,
  reportPath,
  onOpenReport,
  displayedResultContent,
  canCopyResult,
  onCopyError,
  onExportResult,
  canStartFreshRun,
  onStartNewRun,
  onContextMenu,
}: {
  reviewingRunHistory: boolean
  selectedReviewRun: RunResult | null
  selectedResultPresentation: RuntimeStagePresentation | null
  selectedResultBranchLabel: string | null
  selectedResultMetricsLabel: string
  isDisplayedResultEmpty: boolean
  executionLoopSummary: ExecutionLoopSummary | null
  approvalLoopSummary: ExecutionLoopSummary | null
  savedRunLoadingNotice: ReactNode
  savedRunErrorNotice: ReactNode
  hasMultipleResultOptions: boolean
  resultNodeOptions: ResultNodeOption[]
  selectedResultNodeId: string | null
  onSelectResultNode: (nodeId: string) => void
  showArtifactContinuation: boolean
  artifactContinuationToneClass: string
  artifactPersistenceStatus: "idle" | "saving" | "saved" | "error"
  artifactPersistenceError: string | null
  artifactRecords: ArtifactRecord[]
  nextStageRequiresApproval: boolean
  nextStageAutoRuns: boolean
  nextStageLabel: string | null
  nextStageDescription: string | null
  nextStageOutput?: string | null
  nextStagePending: boolean
  onRunNextStage?: (() => Promise<void> | void) | null
  onOpenArtifacts?: (() => void) | null
  visibleArtifactContinuation: ArtifactRecord[]
  hiddenArtifactContinuationCount: number
  visibleNextStageArtifacts: ArtifactRecord[]
  hiddenNextStageArtifactCount: number
  primaryModifierLabel: string
  reportPath: string | null
  onOpenReport: (path: string) => void | Promise<void>
  displayedResultContent: string
  canCopyResult: boolean
  onCopyError: (error: unknown) => void
  onExportResult: () => void
  canStartFreshRun: boolean
  onStartNewRun?: () => void
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void
}) {
  return (
    <div className="space-y-2" onContextMenu={onContextMenu}>
      <div className="rounded-lg border border-hairline bg-surface-2/60 px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="ui-meta-label text-foreground-subtle">
              {reviewingRunHistory ? "Saved result" : "Primary result"}
            </div>
            <div className="text-body-sm font-medium text-foreground">
              {reviewingRunHistory
                ? (selectedResultPresentation?.artifactLabel || "Saved result")
                : (selectedResultPresentation?.artifactLabel || "Final result")}
            </div>
            <div className="ui-meta-text text-muted-foreground">
              {reviewingRunHistory
                ? "Saved run"
                : (selectedResultPresentation?.title || "Latest result")}
            </div>
          </div>
          <div className="ui-badge-row">
            {reviewingRunHistory ? (
              <Badge variant="outline" className="ui-meta-text px-2 py-0">
                {selectedReviewRun?.status || "completed"}
              </Badge>
            ) : selectedResultPresentation && (
              <Badge variant="outline" className="ui-meta-text px-2 py-0">
                {selectedResultPresentation.artifactLabel}
              </Badge>
            )}
            <Badge variant="outline" className="ui-meta-text px-2 py-0 text-muted-foreground">
              {reviewingRunHistory
                ? (selectedReviewRun ? formatRunDuration(selectedReviewRun) : "Saved run")
                : (selectedResultBranchLabel || (isDisplayedResultEmpty ? "No content" : "Result"))}
            </Badge>
            {!reviewingRunHistory && selectedResultPresentation?.outcomeLabel && (
              <Badge variant="outline" className="ui-meta-text px-2 py-0 text-muted-foreground">
                {selectedResultPresentation.outcomeLabel}
              </Badge>
            )}
            {!reviewingRunHistory && selectedResultMetricsLabel && (
              <Badge variant="outline" className="ui-meta-text px-2 py-0 text-muted-foreground">
                {selectedResultMetricsLabel}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <ExecutionCheckRecord summary={executionLoopSummary} compact />
      <ExecutionLoopCard summary={approvalLoopSummary} compact detailSummary="Why / checks" />
      {savedRunLoadingNotice}
      {savedRunErrorNotice}

      {!reviewingRunHistory && hasMultipleResultOptions && (
        <DisclosurePanel
          summary={`Other results (${resultNodeOptions.length})`}
          className="border border-hairline bg-surface-1/70"
          contentClassName="space-y-2"
        >
          <div className="space-y-1">
            <Select
              value={selectedResultNodeId || undefined}
              onValueChange={onSelectResultNode}
            >
              <SelectTrigger className="h-control-sm w-full text-body-sm sm:w-[360px]">
                <SelectValue placeholder="Select another result" />
              </SelectTrigger>
              <SelectContent>
                {resultNodeOptions.map((option) => (
                  <SelectItem key={`result-node-${option.id}`} value={option.id}>
                    {option.label}{option.hasContent ? "" : " · empty result"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DisclosurePanel>
      )}

      {showArtifactContinuation && (
        <div className={cn("space-y-3 rounded-lg px-3 py-3", artifactContinuationToneClass)}>
          <ScopeBanner
            tone="muted"
            eyebrow={(
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant={
                    artifactPersistenceStatus === "error"
                      ? "destructive"
                      : artifactPersistenceStatus === "saved"
                        ? "success"
                        : "outline"
                  }
                  className="ui-meta-text px-2 py-0"
                >
                  {artifactPersistenceStatus === "saving"
                    ? "Preparing results"
                    : artifactPersistenceStatus === "error"
                      ? "Needs attention"
                      : artifactRecords.length > 0
                        ? `${formatResultCountLabel(artifactRecords.length)} ready`
                        : "No results"}
                </Badge>
                {nextStageRequiresApproval ? (
                  <Badge variant="warning" className="ui-meta-text px-2 py-0">
                    Approval before continue
                  </Badge>
                ) : null}
                {nextStageAutoRuns ? (
                  <Badge variant="success" className="ui-meta-text px-2 py-0">
                    Runs on continue
                  </Badge>
                ) : null}
              </div>
            )}
            title={nextStageLabel ? `Continue to ${nextStageLabel}` : "Continue to the next step"}
            description={
              artifactPersistenceStatus === "saving"
                ? "Preparing results."
                : artifactPersistenceError
                  ? artifactPersistenceError
                  : nextStageLabel
                    ? (nextStageDescription || "Next step ready.")
                    : artifactPersistenceStatus === "saved"
                      ? "Results saved."
                      : "No reusable results."
            }
            actions={(
              <>
                {nextStageLabel && onRunNextStage ? (
                  <Button
                    type="button"
                    size="sm"
                    title={`${primaryModifierLabel}↵`}
                    onClick={() => {
                      void Promise.resolve(onRunNextStage())
                    }}
                    disabled={artifactPersistenceStatus === "saving" || nextStagePending}
                  >
                    <ArrowRight size={12} />
                    {nextStagePending
                      ? "Opening..."
                      : nextStageLabel
                        ? `Continue to ${nextStageLabel}`
                        : "Continue"}
                  </Button>
                ) : null}
                {onOpenArtifacts && artifactPersistenceStatus === "saved" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onOpenArtifacts}
                  >
                    <FolderTree size={12} />
                    Results
                  </Button>
                ) : null}
              </>
            )}
          />
          <SummaryRail
            compact
            className={cn(nextStageOutput ? "md:grid-cols-3" : "md:grid-cols-2")}
            items={[
              {
                label: "Ready now",
                value: artifactRecords.length > 0
                  ? visibleArtifactContinuation.map((artifact) => artifact.title).join(" · ")
                  : "No reusable results",
                hint: hiddenArtifactContinuationCount > 0 ? `+${hiddenArtifactContinuationCount} more` : undefined,
              },
              {
                label: "Used next",
                value: visibleNextStageArtifacts.length > 0
                  ? visibleNextStageArtifacts.map((artifact) => artifact.title).join(" · ")
                  : "Resolved after continue",
                hint: hiddenNextStageArtifactCount > 0 ? `+${hiddenNextStageArtifactCount} more` : undefined,
              },
              ...(nextStageOutput ? [{
                label: "Next result",
                value: nextStageOutput,
              }] : []),
            ]}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {reportPath && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void Promise.resolve(onOpenReport(reportPath))
            }}
          >
            <FileText size={12} />
            Open Report
            <span
              className="max-w-52 truncate text-muted-foreground"
              title={reportPath}
            >
              {reportPath.split("/").pop()}
            </span>
          </Button>
        )}
        <CopyButton
          text={displayedResultContent}
          idleLabel="Copy Result"
          copiedLabel="Copied"
          idleAriaLabel="Copy result"
          disabled={!canCopyResult}
          onCopyError={onCopyError}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onExportResult}
          disabled={!canCopyResult}
        >
          <Download size={12} />
          Export
        </Button>
        {canStartFreshRun && onStartNewRun && (
          <Button type="button" variant="outline" size="sm" onClick={onStartNewRun}>
            New run
          </Button>
        )}
      </div>

      <div className="rounded-lg surface-soft p-3">
        {isDisplayedResultEmpty ? (
          <div className="ui-meta-text text-muted-foreground">
            {reviewingRunHistory
              ? "No saved result for this run."
              : selectedResultNodeId
                ? "This step finished without a primary result."
                : "No result yet."}
          </div>
        ) : (
          <div className={MARKDOWN_PROSE_CLASS}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={MARKDOWN_COMPONENTS}>
              {displayedResultContent}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
