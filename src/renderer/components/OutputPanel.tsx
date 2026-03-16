import { cn } from "@/lib/cn"
import {
  Check,
  Loader2,
  FileText,
  History,
  Copy,
  Download,
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
import { HistoryTab } from "@/components/output/HistoryTab"
import { LogTab, NodesTab, formatCost } from "@/components/output/OutputSections"
import type { RunResult } from "@shared/types"
import ReactMarkdown, { type Components as MarkdownComponents } from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
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
  const [outputContextMenu, setOutputContextMenu] = useState<
    | { x: number, y: number, scope: "result" }
    | null
  >(null)
  const copyResetTimerRef = useRef<number | null>(null)
  const resultPulseTimerRef = useRef<number | null>(null)
  const resultSignalShownRef = useRef(false)
  const previousRunStatusRef = useRef(runStatus)

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

  const handleExportResult = useCallback(async () => {
    if (!canCopyResult) return
    const content = displayedResultContent
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    const workflowName = workflow.name || "workflow"
    const mdContent = `# ${workflowName}\n\nExported: ${new Date().toLocaleString()}\n\n---\n\n${content}`
    const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${workflowName}-result-${stamp}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [canCopyResult, displayedResultContent, workflow.name])

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
      previousRunStatusRef.current = runStatus
      return
    }
    const runJustCompleted = previousRunStatusRef.current !== "done"
    previousRunStatusRef.current = runStatus
    if (runJustCompleted) {
      resultSignalShownRef.current = true
      if (activeTab !== "result" && activeTab !== "history") {
        setActiveTab("result")
        setResultReadyPulse(false)
        return
      }
    }
    if (resultSignalShownRef.current) return
    resultSignalShownRef.current = true
    if (activeTab === "result") return
    setResultReadyPulse(true)
    if (resultPulseTimerRef.current) {
      window.clearTimeout(resultPulseTimerRef.current)
    }
    resultPulseTimerRef.current = window.setTimeout(() => setResultReadyPulse(false), 2800)
  }, [activeTab, hasResult, runStatus])

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
            {resultReadyPulse && activeTab !== "result" && (
              <span className="ui-status-beacon mr-1.5" aria-hidden="true">
                <span className="ui-status-beacon-ring bg-status-success/35" />
                <span className="ui-status-beacon-core bg-status-success" />
              </span>
            )}
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
                      style={{
                        width: `${branchesProgressPct}%`,
                        transition: "width var(--motion-slow) var(--ease-emphasis)",
                      }}
                    />
                  </div>
                </div>
              )}
              {budgetCost != null && (
                <div className="mb-2 rounded-md border border-hairline bg-surface-2 px-3 py-1.5 ui-meta-text space-y-1 ui-elevation-inset">
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
                  <div
                    data-open={budgetWarning ? "true" : "false"}
                    className="ui-collapsible"
                  >
                    <div className="ui-collapsible-inner">
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
                        {budgetWarning || ""}
                      </div>
                    </div>
                  </div>
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

              <div
                data-open={runStatus === "done" ? "true" : "false"}
                className="ui-collapsible"
              >
                <div className="ui-collapsible-inner">
                  <div
                    role="status"
                    aria-live="polite"
                    className="ui-alert-success mt-2 flex flex-wrap items-center justify-between gap-2 text-status-success"
                  >
                    <span>Workflow completed successfully.</span>
                    {hasResult && (
                      <button
                        type="button"
                        className="ui-pressable rounded-md border border-status-success/30 bg-status-success/10 px-2 py-1 ui-meta-label text-status-success hover:bg-status-success/15"
                        onClick={() => setActiveTab("result")}
                      >
                        View result
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div
                data-open={runStatus === "error" ? "true" : "false"}
                className="ui-collapsible"
              >
                <div className="ui-collapsible-inner">
                  <div
                    role="alert"
                    className="ui-alert-danger mt-2 space-y-1 text-status-danger"
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
                </div>
              </div>
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
              <div
                data-open={resultReadyPulse ? "true" : "false"}
                className="ui-collapsible"
              >
                <div className="ui-collapsible-inner">
                  <div
                    role="status"
                    aria-live="polite"
                    className="ui-alert-success text-status-success"
                  >
                    Result is ready.
                  </div>
                </div>
              </div>
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
                    className="ui-pressable ui-surface-lift surface-soft flex items-center gap-2 rounded-lg px-3 py-1 ui-meta-label ui-elevation-base hover:bg-surface-3 ui-transition-colors ui-motion-fast"
                    onClick={() => void handleOpenReport(reportPath)}
                  >
                    <FileText size={12} />
                    Open Report
                    <span className={cn("text-muted-foreground truncate", PREVIEW_MAX_W)} title={reportPath}>{reportPath.split("/").pop()}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="ui-pressable ui-surface-lift surface-soft flex items-center gap-2 rounded-lg px-3 py-1 ui-meta-label ui-elevation-base hover:bg-surface-3 ui-transition-colors ui-motion-fast"
                  onClick={() => void handleCopyResult()}
                  disabled={!canCopyResult}
                >
                  <Copy size={12} />
                  {copiedResult ? "Copied" : "Copy Result"}
                </button>
                <button
                  type="button"
                  className="ui-pressable ui-surface-lift surface-soft flex items-center gap-2 rounded-lg px-3 py-1 ui-meta-label ui-elevation-base hover:bg-surface-3 ui-transition-colors ui-motion-fast"
                  onClick={() => void handleExportResult()}
                  disabled={!canCopyResult}
                >
                  <Download size={12} />
                  Export
                </button>
              </div>
              <div className="rounded-lg surface-soft p-3 ui-elevation-base">
                {isDisplayedResultEmpty ? (
                  <div className="ui-meta-text text-muted-foreground">
                    {selectedResultNode
                      ? "This step completed with an empty output."
                      : "Final result is empty."}
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
          ) : (
            <div className="rounded-lg surface-soft p-6 ui-empty-state text-body-md text-muted-foreground">
              Step results will appear here as nodes complete.
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-2">
          <HistoryTab
            pastRuns={pastRuns}
            runStatus={runStatus}
            onOpenReport={handleOpenReport}
            onContinueRun={onContinueRun}
          />
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
      </CursorMenu>
    </div>
  )
}
