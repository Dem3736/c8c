import { cn } from "@/lib/cn"
import {
  Check,
  Loader2,
  FileText,
  History,
  Copy,
} from "lucide-react"
import { useRef, useEffect, useState, useCallback } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { CursorMenu } from "@/components/ui/cursor-menu"
import { getWorkflowNodeLabel } from "@/lib/workflow-labels"
import { useOutputPanel } from "@/hooks/useOutputPanel"
import { RunCompare, RunTrends } from "./RunTrends"
import { LogTab, NodesTab, formatCost } from "@/components/output/OutputSections"
import type { RunResult } from "@shared/types"
import ReactMarkdown, { type Components as MarkdownComponents } from "react-markdown"
import remarkGfm from "remark-gfm"
import { toast } from "sonner"

const PREVIEW_MAX_W = "max-w-52" as const
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

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`
  return String(tokens)
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

function formatRunCost(run: RunResult): string {
  if (typeof run.totalCost === "number") {
    return formatCost(run.totalCost)
  }
  return "n/a"
}

function formatRunCompletedAt(run: RunResult, includeTime: boolean): string {
  if (!Number.isFinite(run.completedAt) || run.completedAt <= 0) {
    return "n/a"
  }
  const completedDate = new Date(run.completedAt)
  if (Number.isNaN(completedDate.getTime())) {
    return "n/a"
  }
  return includeTime ? completedDate.toLocaleString() : completedDate.toLocaleDateString()
}

function isRunContinuable(run: RunResult): boolean {
  return run.status !== "completed" && run.status !== "failed" && run.status !== "cancelled"
}

// ── Main OutputPanel ─────────────────────────────────────

export function OutputPanel({
  onOpenReport = (path: string) => { void window.api.openReport(path) },
  onRerunFrom,
  onContinueRun,
}: {
  onOpenReport?: (path: string) => void | Promise<void>
  onRerunFrom?: (nodeId: string) => Promise<void> | void
  onContinueRun?: (run: RunResult) => Promise<void> | void
}) {
  const {
    runStatus,
    nodeStates,
    activeNodeId,
    selectedNodeId,
    setSelectedNodeId,
    finalContent,
    workflow,
    evalResults,
    runtimeMeta,
    reportPath,
    pastRuns,
    workspace,
  } = useOutputPanel()
  const [activeTab, setActiveTab] = useState("nodes")
  const [copiedResult, setCopiedResult] = useState(false)
  const [resultReadyPulse, setResultReadyPulse] = useState(false)
  const [selectedHistoryRunId, setSelectedHistoryRunId] = useState<string | null>(null)
  const [selectedRunDetails, setSelectedRunDetails] = useState<(RunResult & { reportContent: string }) | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [compareRunAId, setCompareRunAId] = useState<string | null>(null)
  const [compareRunBId, setCompareRunBId] = useState<string | null>(null)
  const [outputContextMenu, setOutputContextMenu] = useState<
    | { x: number, y: number, scope: "result" }
    | { x: number, y: number, scope: "history_run", runId: string }
    | null
  >(null)
  const copyResetTimerRef = useRef<number | null>(null)
  const resultPulseTimerRef = useRef<number | null>(null)
  const resultSignalShownRef = useRef(false)

  const handleRerunFrom = useCallback((nodeId: string) => {
    if (!onRerunFrom || !workspace) return
    void onRerunFrom(nodeId)
  }, [onRerunFrom, workspace])

  // Filter out template nodes that were replaced by runtime branches
  const replacedTemplateIds = new Set(
    Object.values(runtimeMeta).map((m) => m.templateId).filter(Boolean),
  )

  const displayNodes = workflow.nodes
    .filter((n) => n.type !== "input" && n.type !== "output")
    .filter((n) => !replacedTemplateIds.has(n.id))
    .map((n) => ({
      id: n.id,
      label: getWorkflowNodeLabel(n),
      type: n.type,
    }))

  // Add runtime branch nodes (created by splitter expansion)
  const staticNodeIds = new Set(workflow.nodes.map((n) => n.id))
  const runtimeBranchIds = Object.keys(nodeStates)
    .filter((id) => id.includes("::") && !staticNodeIds.has(id))

  const templateById = new Map(workflow.nodes.map((n) => [n.id, n]))
  const templateLabelByBranchId = new Map<string, string>()
  const templateLabelCounts = new Map<string, number>()

  for (const branchId of runtimeBranchIds) {
    const meta = runtimeMeta[branchId]
    if (!meta) continue
    const templateNode = templateById.get(meta.templateId)
    const templateLabel = templateNode ? getWorkflowNodeLabel(templateNode) : meta.templateId
    templateLabelByBranchId.set(branchId, templateLabel)
    templateLabelCounts.set(templateLabel, (templateLabelCounts.get(templateLabel) || 0) + 1)
  }

  const runtimeBranchNodes = runtimeBranchIds.map((id) => {
    const meta = runtimeMeta[id]
    if (!meta) {
      return { id, label: `branch: ${id.split("::").pop()}`, type: "skill" as const, indent: true }
    }

    const templateLabel = templateLabelByBranchId.get(id)
    const shouldDisambiguateTemplate = !!templateLabel && (templateLabelCounts.get(templateLabel) || 0) > 1
    const templateSuffix = templateLabel
      ? shouldDisambiguateTemplate
        ? `${templateLabel} [${meta.templateId}]`
        : templateLabel
      : meta.templateId

    return {
      id,
      label: `branch: ${meta.subtaskKey} (${meta.branchIndex + 1}/${meta.totalBranches}) · ${templateSuffix}`,
      type: "skill" as const,
      indent: true,
    }
  })

  const allDisplayNodes = [...displayNodes, ...runtimeBranchNodes]
  const displayLabelByNodeId = new Map(allDisplayNodes.map((node) => [node.id, node.label]))
  for (const node of workflow.nodes) {
    if (!displayLabelByNodeId.has(node.id)) {
      displayLabelByNodeId.set(node.id, getWorkflowNodeLabel(node))
    }
  }
  const workflowOrderIndex = new Map(workflow.nodes.map((node, index) => [node.id, index]))
  const resultNodeOptions = Object.entries(nodeStates)
    .filter(([, state]) => typeof state.output?.content === "string")
    .map(([id, state]) => {
      const workflowNode = templateById.get(id)
      const label = workflowNode?.type === "output"
        ? `${displayLabelByNodeId.get(id) || id} (final)`
        : (displayLabelByNodeId.get(id) || id)
      return {
        id,
        label,
        hasContent: state.output!.content.trim().length > 0,
      }
    })
    .sort((a, b) => {
      const aIndex = workflowOrderIndex.get(a.id)
      const bIndex = workflowOrderIndex.get(b.id)
      if (aIndex != null && bIndex != null) return aIndex - bIndex
      if (aIndex != null) return -1
      if (bIndex != null) return 1
      return a.label.localeCompare(b.label)
    })
  const resultNodeOptionIds = new Set(resultNodeOptions.map((option) => option.id))

  // Parallel execution indicator
  const runningBranches = runtimeBranchNodes.filter((n) => nodeStates[n.id]?.status === "running").length
  const totalBranches = runtimeBranchNodes.length
  const completedBranches = runtimeBranchNodes.filter((n) => {
    const status = nodeStates[n.id]?.status
    return status === "completed" || status === "failed" || status === "skipped"
  }).length
  const remainingBranches = Math.max(0, totalBranches - completedBranches)
  const branchesProgressPct = totalBranches > 0
    ? Math.round((completedBranches / totalBranches) * 100)
    : 0

  // Budget tracking
  const budgetCost = workflow.defaults?.budget_cost_usd ?? null
  const budgetTokens = workflow.defaults?.budget_tokens ?? null
  const accumulatedCost = Object.values(nodeStates).reduce(
    (sum, s) => sum + (s.metrics?.cost_usd || 0),
    0,
  )
  const totalTokensIn = Object.values(nodeStates).reduce(
    (sum, s) => sum + (s.metrics?.tokens_in || 0),
    0,
  )
  const totalTokensOut = Object.values(nodeStates).reduce(
    (sum, s) => sum + (s.metrics?.tokens_out || 0),
    0,
  )
  const totalTokens = totalTokensIn + totalTokensOut
  const budgetProgressRatio = budgetCost && budgetCost > 0
    ? accumulatedCost / budgetCost
    : 1
  const budgetWarning = budgetCost == null
    ? null
    : budgetProgressRatio >= 1
      ? "Budget exceeded. Execution may stop on the next budget check."
      : budgetProgressRatio >= 0.9
        ? "Budget warning: over 90% of cost limit is used."
        : budgetProgressRatio >= 0.7
          ? "Budget notice: over 70% of cost limit is used."
          : null

  const hasNodeStates = Object.keys(nodeStates).length > 0
  const hasFinalResult = finalContent.trim().length > 0
  const hasStageResult = resultNodeOptions.length > 0
  const hasResult = hasFinalResult || hasStageResult
  const outputResultNode = resultNodeOptions.find((option) => templateById.get(option.id)?.type === "output") || null
  const selectedResultNodeId = selectedNodeId && resultNodeOptionIds.has(selectedNodeId)
    ? selectedNodeId
    : outputResultNode?.id || resultNodeOptions[0]?.id || null
  const selectedResultNode = selectedResultNodeId
    ? resultNodeOptions.find((option) => option.id === selectedResultNodeId) || null
    : null
  const selectedResultContent = selectedResultNodeId
    ? (nodeStates[selectedResultNodeId]?.output?.content || "")
    : null
  const displayedResultContent = selectedResultContent ?? finalContent
  const isDisplayedResultEmpty = displayedResultContent.trim().length === 0
  const canCopyResult = displayedResultContent.length > 0
  const showIdleState = runStatus === "idle" && !hasNodeStates && !hasResult
  const completedRuns = pastRuns.filter((run) => run.status === "completed")
  const selectedHistoryRun = pastRuns.find((run) => run.runId === selectedHistoryRunId) || null
  const compareRunA = completedRuns.find((run) => run.runId === compareRunAId) || null
  const compareRunB = completedRuns.find((run) => run.runId === compareRunBId) || null
  const contextHistoryRun = outputContextMenu?.scope === "history_run"
    ? pastRuns.find((run) => run.runId === outputContextMenu.runId) || null
    : null

  const handleCopyResult = useCallback(async () => {
    if (!canCopyResult) return
    try {
      await navigator.clipboard.writeText(displayedResultContent)
      setCopiedResult(true)
      if (copyResetTimerRef.current) {
        window.clearTimeout(copyResetTimerRef.current)
      }
      copyResetTimerRef.current = window.setTimeout(() => setCopiedResult(false), 1600)
    } catch (error) {
      console.error("[OutputPanel] copy result failed:", error)
      toast.error("Could not copy result", {
        description: String(error),
      })
      setCopiedResult(false)
    }
  }, [canCopyResult, displayedResultContent])

  const handleOpenReport = useCallback(async (path: string) => {
    try {
      await Promise.resolve(onOpenReport(path))
    } catch (error) {
      console.error("[OutputPanel] open report failed:", error)
      toast.error("Could not open report file", {
        description: String(error),
      })
    }
  }, [onOpenReport])

  const handleCopyRunId = useCallback(async (runId: string) => {
    try {
      await navigator.clipboard.writeText(runId)
    } catch (error) {
      console.error("[OutputPanel] copy run ID failed:", error)
      toast.error("Could not copy run ID", {
        description: String(error),
      })
    }
  }, [])

  useEffect(() => {
    if (!hasResult && activeTab === "result") {
      setActiveTab("nodes")
    }
  }, [activeTab, hasResult])

  useEffect(() => {
    if (activeTab === "history" && pastRuns.length === 0) {
      setActiveTab("nodes")
    }
  }, [activeTab, pastRuns.length])

  useEffect(() => {
    if (runStatus !== "done" || !hasResult) {
      resultSignalShownRef.current = false
      setResultReadyPulse(false)
      return
    }
    if (resultSignalShownRef.current) return
    resultSignalShownRef.current = true
    if (activeTab === "result") {
      return
    }
    setResultReadyPulse(true)
    if (resultPulseTimerRef.current) {
      window.clearTimeout(resultPulseTimerRef.current)
    }
    resultPulseTimerRef.current = window.setTimeout(() => setResultReadyPulse(false), 2800)
  }, [activeTab, hasResult, runStatus])

  useEffect(() => {
    if (pastRuns.length === 0) {
      setSelectedHistoryRunId(null)
      return
    }
    const exists = selectedHistoryRunId && pastRuns.some((run) => run.runId === selectedHistoryRunId)
    if (!exists) {
      setSelectedHistoryRunId(pastRuns[0].runId)
    }
  }, [pastRuns, selectedHistoryRunId])

  useEffect(() => {
    if (completedRuns.length < 2) {
      setCompareRunAId(null)
      setCompareRunBId(null)
      return
    }
    const runIds = completedRuns.map((run) => run.runId)
    const nextA = compareRunAId && runIds.includes(compareRunAId) ? compareRunAId : runIds[0]
    const nextB = compareRunBId && runIds.includes(compareRunBId) && compareRunBId !== nextA
      ? compareRunBId
      : runIds.find((id) => id !== nextA) || null
    if (nextA !== compareRunAId) {
      setCompareRunAId(nextA)
    }
    if (nextB !== compareRunBId) {
      setCompareRunBId(nextB)
    }
  }, [compareRunAId, compareRunBId, completedRuns])

  useEffect(() => {
    if (!selectedHistoryRun?.workspace) {
      setSelectedRunDetails(null)
      setHistoryError(null)
      return
    }
    let cancelled = false
    setSelectedRunDetails(null)
    setHistoryLoading(true)
    setHistoryError(null)
    window.api.loadRunResult(selectedHistoryRun.workspace)
      .then((result) => {
        if (cancelled) return
        if (!result) {
          setSelectedRunDetails(null)
          setHistoryError("Run details are unavailable for this entry.")
          return
        }
        setSelectedRunDetails(result)
      })
      .catch(() => {
        if (cancelled) return
        setSelectedRunDetails(null)
        setHistoryError("Failed to load run details.")
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedHistoryRun?.runId, selectedHistoryRun?.workspace])

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        window.clearTimeout(copyResetTimerRef.current)
      }
      if (resultPulseTimerRef.current) {
        window.clearTimeout(resultPulseTimerRef.current)
      }
    }
  }, [])

  return (
    <div className="space-y-3 ui-fade-slide-in">
      <label className="section-kicker">
        Output
      </label>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-control-md">
          <TabsTrigger value="nodes" className="px-3 py-1 text-body-sm">
            Steps
          </TabsTrigger>
          <TabsTrigger value="log" className="px-3 py-1 text-body-sm">
            Log
          </TabsTrigger>
          <TabsTrigger
            value="result"
            className={cn(
              "px-3 py-1 text-body-sm",
              resultReadyPulse && activeTab !== "result" && "border-status-success/40 text-status-success",
            )}
            disabled={!hasResult}
          >
            Result
          </TabsTrigger>
          <TabsTrigger value="history" className="px-3 py-1 text-body-sm" disabled={pastRuns.length === 0}>
            <History size={12} className="mr-1" />
            History{pastRuns.length > 0 && ` (${pastRuns.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="nodes" className="mt-2">
          {showIdleState ? (
            <NodesTab
              nodes={allDisplayNodes}
              nodeStates={nodeStates}
              activeNodeId={activeNodeId}
              evalResults={evalResults}
              canRerun={false}
              onRerunFrom={handleRerunFrom}
              onSelectNode={(nodeId) => {
                setSelectedNodeId(nodeId)
                setActiveTab("log")
              }}
            />
          ) : (
            <>
              <div className="surface-soft mb-2 rounded-lg px-3 py-2">
                <div className="flex flex-wrap items-center gap-3 ui-meta-text text-foreground-subtle">
                  <span className="font-medium">Run totals</span>
                  <span className="font-mono">
                    {formatCost(accumulatedCost)}
                    {budgetCost != null ? ` / ${formatCost(budgetCost)}` : ""}
                  </span>
                  <span className="font-mono">
                    {formatTokenCount(totalTokens)} tokens
                    {budgetTokens != null ? ` / ${formatTokenCount(budgetTokens)}` : ""}
                  </span>
                </div>
              </div>
              {totalBranches > 0 && (
                <div className="surface-soft mb-2 rounded-lg px-3 py-2 space-y-1.5">
                  <div className="flex items-center gap-2 ui-meta-text text-foreground-subtle">
                    {runningBranches > 0 ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Check size={12} />
                    )}
                    <span>
                      {runningBranches}/{totalBranches} running · {completedBranches} completed · {remainingBranches} remaining · {branchesProgressPct}%
                    </span>
                  </div>
                  <div className="ui-progress-track">
                    <div
                      className="ui-progress-bar"
                      style={{ width: `${branchesProgressPct}%` }}
                    />
                  </div>
                </div>
              )}
              {budgetCost != null && (
                <div className="mb-2 px-3 py-1.5 ui-meta-text bg-surface-2 border border-hairline rounded-md space-y-1">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Cost limit</span>
                    <span>{formatCost(accumulatedCost)} / {formatCost(budgetCost)}</span>
                  </div>
                  <div className="ui-progress-track">
                    <div
                      className="ui-progress-bar"
                      style={{
                        width: `${Math.min(100, budgetProgressRatio * 100)}%`,
                        background: budgetProgressRatio > 0.9
                          ? "hsl(var(--status-danger))"
                          : budgetProgressRatio > 0.7
                            ? "hsl(var(--status-warning))"
                            : undefined,
                      }}
                    />
                  </div>
                  {budgetWarning && (
                    <div
                      role={budgetProgressRatio >= 1 ? "alert" : "status"}
                      aria-live="polite"
                      className={cn(
                        "pt-0.5",
                        budgetProgressRatio >= 1
                          ? "text-status-danger"
                          : budgetProgressRatio >= 0.9
                            ? "text-status-danger"
                            : "text-status-warning",
                      )}
                    >
                      {budgetWarning}
                    </div>
                  )}
                </div>
              )}
              <NodesTab
                nodes={allDisplayNodes}
                nodeStates={nodeStates}
                activeNodeId={activeNodeId}
                evalResults={evalResults}
                canRerun={runStatus !== "running" && !!workspace && !!onRerunFrom}
                onRerunFrom={handleRerunFrom}
                onSelectNode={(nodeId) => {
                  setSelectedNodeId(nodeId)
                  setActiveTab("log")
                }}
              />

              {runStatus === "done" && (
                <div
                  role="status"
                  aria-live="polite"
                  className="ui-alert-success text-status-success mt-2"
                >
                  Workflow completed successfully
                </div>
              )}
              {runStatus === "error" && (
                <div
                  role="alert"
                  className="ui-alert-danger text-status-danger mt-2 space-y-1"
                >
                  <div className="font-medium text-status-danger">Workflow failed</div>
                  {Object.entries(nodeStates)
                    .filter(([, s]) => s.status === "failed" && s.error)
                    .map(([id, s]) => {
                      const node = allDisplayNodes.find((n) => n.id === id)
                      return (
                        <div key={id} className="text-status-danger/80">
                          <span className="font-medium">{node?.label || id}:</span>{" "}
                          {s.error}
                        </div>
                      )
                    })}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="log" className="mt-2">
          {showIdleState ? (
            <div className="rounded-lg surface-soft p-6 text-center text-body-md text-muted-foreground">
              Logs will appear here after you start a run.
            </div>
          ) : (
            <LogTab selectedNodeId={selectedNodeId} nodeStates={nodeStates} evalResults={evalResults} />
          )}
        </TabsContent>

        <TabsContent value="result" className="mt-2">
          {hasResult ? (
            <div
              className="space-y-2"
              onContextMenu={(event) => {
                event.preventDefault()
                setOutputContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  scope: "result",
                })
              }}
            >
              {resultReadyPulse && (
                <div
                  role="status"
                  aria-live="polite"
                  className="ui-alert-success text-status-success"
                >
                  Result is ready.
                </div>
              )}
              {resultNodeOptions.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="ui-meta-label text-foreground-subtle">Step</span>
                  <Select
                    value={selectedResultNodeId || undefined}
                    onValueChange={(nextNodeId) => {
                      setSelectedNodeId(nextNodeId)
                    }}
                  >
                    <SelectTrigger className="h-control-sm w-[320px] text-body-sm">
                      <SelectValue placeholder="Select step result" />
                    </SelectTrigger>
                    <SelectContent>
                      {resultNodeOptions.map((option) => (
                        <SelectItem key={`result-node-${option.id}`} value={option.id}>
                          {option.label}{option.hasContent ? "" : " · empty output"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedResultNode && (
                    <Badge variant="outline" className="ui-meta-text px-2 py-0">
                      {selectedResultNode.id}
                    </Badge>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {reportPath && (
                  <button
                    type="button"
                    className="surface-soft flex items-center gap-2 px-3 py-1 ui-meta-label rounded-lg hover:bg-surface-3 ui-transition-colors ui-motion-fast"
                    onClick={() => void handleOpenReport(reportPath)}
                  >
                    <FileText size={12} />
                    Open Report
                    <span className={cn("text-muted-foreground truncate", PREVIEW_MAX_W)}>{reportPath.split("/").pop()}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="surface-soft flex items-center gap-2 px-3 py-1 ui-meta-label rounded-lg hover:bg-surface-3 ui-transition-colors ui-motion-fast"
                  onClick={() => void handleCopyResult()}
                  disabled={!canCopyResult}
                >
                  <Copy size={12} />
                  {copiedResult ? "Copied" : "Copy Result"}
                </button>
              </div>
              <div className="rounded-lg surface-soft p-3">
                {isDisplayedResultEmpty ? (
                  <div className="ui-meta-text text-muted-foreground">
                    {selectedResultNode
                      ? "This step completed with an empty output."
                      : "Final result is empty."}
                  </div>
                ) : (
                  <div className={MARKDOWN_PROSE_CLASS}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                      {displayedResultContent}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg surface-soft p-6 ui-empty-state text-body-md text-muted-foreground">
              Step results will appear here as nodes complete.
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-2">
          {pastRuns.length === 0 ? (
            <div className="rounded-lg surface-soft p-6 ui-empty-state text-body-md text-muted-foreground">
              No past runs yet. Start a workflow run to build history.
            </div>
          ) : (
            <div className="space-y-3">
              <RunTrends runs={pastRuns} />

              {compareRunA && compareRunB && (
                <div className="rounded-lg surface-soft p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="ui-meta-label text-foreground-subtle">Compare runs</span>
                    <Select
                      value={compareRunA.runId}
                      onValueChange={(nextRunId) => {
                        setCompareRunAId(nextRunId)
                        if (nextRunId === compareRunB?.runId) {
                          const fallback = completedRuns.find((run) => run.runId !== nextRunId)
                          setCompareRunBId(fallback ? fallback.runId : null)
                        }
                      }}
                    >
                      <SelectTrigger className="h-control-sm w-[220px] text-body-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {completedRuns.map((run) => (
                          <SelectItem key={`compare-a-${run.runId}`} value={run.runId}>
                            {(run.workflowName || run.runId)} · {formatRunCompletedAt(run, false)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={compareRunB.runId}
                      onValueChange={(nextRunId) => {
                        setCompareRunBId(nextRunId)
                        if (nextRunId === compareRunA?.runId) {
                          const fallback = completedRuns.find((run) => run.runId !== nextRunId)
                          setCompareRunAId(fallback ? fallback.runId : null)
                        }
                      }}
                    >
                      <SelectTrigger className="h-control-sm w-[220px] text-body-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {completedRuns.map((run) => (
                          <SelectItem key={`compare-b-${run.runId}`} value={run.runId}>
                            {(run.workflowName || run.runId)} · {formatRunCompletedAt(run, false)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <RunCompare runA={compareRunA} runB={compareRunB} />
                </div>
              )}

              <div className="rounded-lg surface-soft overflow-hidden">
                {pastRuns.map((run) => {
                  const isSelected = selectedHistoryRun?.runId === run.runId
                  const canOpenReport = Boolean(run.reportPath)
                  const canContinue = Boolean(
                    onContinueRun
                    && run.workspace
                    && isRunContinuable(run)
                    && runStatus !== "running",
                  )
                  return (
                    <div
                      key={run.runId}
                      className="flex items-center gap-2 border-b border-hairline px-2 py-1.5 last:border-b-0"
                      onContextMenu={(event) => {
                        event.preventDefault()
                        setSelectedHistoryRunId(run.runId)
                        setOutputContextMenu({
                          x: event.clientX,
                          y: event.clientY,
                          scope: "history_run",
                          runId: run.runId,
                        })
                      }}
                    >
                      <button
                        type="button"
                        className={cn(
                          "flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left ui-transition-colors ui-motion-fast hover:bg-surface-3/80",
                          isSelected && "bg-surface-3/80",
                        )}
                        onClick={() => setSelectedHistoryRunId(run.runId)}
                      >
                        <FileText size={14} className="text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-body-md font-medium truncate">{run.workflowName || run.runId}</div>
                          <div className="ui-meta-text text-muted-foreground">
                            {formatRunCompletedAt(run, true)} · {formatRunDuration(run)} · {formatRunCost(run)}
                          </div>
                        </div>
                        <Badge
                          variant={
                            run.status === "completed"
                              ? "outline"
                              : run.status === "interrupted"
                                ? "outline"
                                : "destructive"
                          }
                          className={cn(
                            "ui-meta-text px-2 py-0 shrink-0",
                            run.status === "completed" && "text-status-success border-status-success/30 bg-status-success/10",
                            run.status === "interrupted" && "text-status-warning border-status-warning/30",
                          )}
                        >
                          {run.status}
                        </Badge>
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "h-control-sm rounded-md px-2 ui-meta-text ui-transition-colors ui-motion-fast",
                          canOpenReport
                            ? "border border-hairline bg-surface-1/80 text-foreground hover:bg-surface-3"
                            : "border border-hairline bg-surface-2/75 text-muted-foreground/85 cursor-not-allowed",
                        )}
                        disabled={!canOpenReport}
                        onClick={() => {
                          if (!run.reportPath) return
                          void handleOpenReport(run.reportPath)
                        }}
                      >
                        Open file
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "h-control-sm rounded-md px-2 ui-meta-text ui-transition-colors ui-motion-fast",
                          canContinue
                            ? "border border-hairline bg-surface-1/80 text-foreground hover:bg-surface-3"
                            : "border border-hairline bg-surface-2/75 text-muted-foreground/85 cursor-not-allowed",
                        )}
                        disabled={!canContinue}
                        onClick={() => {
                          if (!canContinue || !onContinueRun) return
                          void onContinueRun(run)
                        }}
                      >
                        Continue
                      </button>
                    </div>
                  )
                })}
              </div>

              {selectedHistoryRun && (
                <div className="rounded-lg surface-soft p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-body-md font-medium">Run details</span>
                    <span className="ui-meta-text text-muted-foreground">
                      {formatRunCompletedAt(selectedHistoryRun, true)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 ui-meta-text">
                    <div className="rounded-md border border-hairline bg-surface-2/60 px-2 py-1.5">
                      <div className="text-muted-foreground">Status</div>
                      <div className="font-medium text-foreground">{selectedHistoryRun.status}</div>
                    </div>
                    <div className="rounded-md border border-hairline bg-surface-2/60 px-2 py-1.5">
                      <div className="text-muted-foreground">Duration</div>
                      <div className="font-medium text-foreground">{formatRunDuration(selectedHistoryRun)}</div>
                    </div>
                    <div className="rounded-md border border-hairline bg-surface-2/60 px-2 py-1.5">
                      <div className="text-muted-foreground">Total cost</div>
                      <div className="font-medium text-foreground">{formatRunCost(selectedHistoryRun)}</div>
                    </div>
                    <div className="rounded-md border border-hairline bg-surface-2/60 px-2 py-1.5">
                      <div className="text-muted-foreground">Run ID</div>
                      <div className={cn("font-mono text-foreground truncate", PREVIEW_MAX_W)} title={selectedHistoryRun.runId}>
                        {selectedHistoryRun.runId}
                      </div>
                    </div>
                  </div>

                  {historyLoading && (
                    <div className="ui-meta-text text-muted-foreground">Loading run details...</div>
                  )}
                  {!historyLoading && historyError && (
                    <div role="alert" className="ui-meta-text text-status-danger">{historyError}</div>
                  )}
                  {!historyLoading && !historyError && selectedRunDetails?.reportContent && (
                    <div className="rounded-md border border-hairline bg-surface-1/70 p-2">
                      <div className="ui-meta-text text-muted-foreground mb-1">Report preview</div>
                      <div className="max-h-56 overflow-y-auto ui-scroll-region">
                        <div className={MARKDOWN_PROSE_CLASS}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                            {selectedRunDetails.reportContent}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  )}
                  {!historyLoading && !historyError && !selectedRunDetails?.reportContent && (
                    <div className="ui-meta-text text-muted-foreground">
                      No report content is available for this run.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CursorMenu
        open={outputContextMenu !== null}
        x={outputContextMenu?.x || 0}
        y={outputContextMenu?.y || 0}
        onOpenChange={(open) => {
          if (!open) setOutputContextMenu(null)
        }}
      >
        {outputContextMenu?.scope === "result" && (
          <>
            <DropdownMenuLabel>Result</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!canCopyResult}
              onSelect={() => {
                void handleCopyResult()
                setOutputContextMenu(null)
              }}
            >
              Copy result
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!reportPath}
              onSelect={() => {
                if (!reportPath) return
                void handleOpenReport(reportPath)
                setOutputContextMenu(null)
              }}
            >
              Open report file
            </DropdownMenuItem>
          </>
        )}
        {outputContextMenu?.scope === "history_run" && contextHistoryRun && (
          <>
            <DropdownMenuLabel>{contextHistoryRun.workflowName || "Run"}</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => {
                setSelectedHistoryRunId(contextHistoryRun.runId)
                setOutputContextMenu(null)
              }}
            >
              Open run details
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                void handleCopyRunId(contextHistoryRun.runId)
                setOutputContextMenu(null)
              }}
            >
              Copy run ID
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!onContinueRun || !contextHistoryRun.workspace || !isRunContinuable(contextHistoryRun) || runStatus === "running"}
              onSelect={() => {
                if (!onContinueRun || !contextHistoryRun.workspace || !isRunContinuable(contextHistoryRun) || runStatus === "running") return
                void onContinueRun(contextHistoryRun)
                setOutputContextMenu(null)
              }}
            >
              Continue run
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!contextHistoryRun.reportPath}
              onSelect={() => {
                if (!contextHistoryRun.reportPath) return
                void handleOpenReport(contextHistoryRun.reportPath)
                setOutputContextMenu(null)
              }}
            >
              Open report file
            </DropdownMenuItem>
          </>
        )}
      </CursorMenu>
    </div>
  )
}
