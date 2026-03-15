import { useEffect, useMemo, useRef, useState } from "react"
import type { EvaluationResult } from "@/lib/store"
import type { LogEntry, NodeState } from "@shared/types"
import { cn } from "@/lib/cn"
import { getToolPermissionHint } from "@/lib/tool-permission-hints"
import {
  Check,
  Loader2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Wrench,
  RotateCcw,
  Search,
  X,
  FileCode2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

const PREVIEW_MAX_W = "max-w-52" as const

const STATUS_ICONS: Record<string, typeof Clock> = {
  pending: Clock,
  queued: Clock,
  running: Loader2,
  completed: Check,
  failed: AlertCircle,
  skipped: Clock,
  waiting_approval: Clock,
}

const ERROR_KIND_LABELS: Record<string, string> = {
  tool: "Tool error",
  model: "Model error",
  timeout: "Timeout",
  policy: "Policy",
  unknown: "Error",
}

const STATUS_LABELS: Record<string, string> = {
  queued: "waiting",
  waiting_approval: "waiting for approval",
}

const LOG_ENTRY_TYPES = ["thinking", "text", "tool_use", "tool_result", "error", "diff"] as const
type LogEntryType = (typeof LOG_ENTRY_TYPES)[number]

const LOG_TYPE_LABELS: Record<LogEntryType, string> = {
  thinking: "Thinking",
  text: "Text",
  tool_use: "Tool Use",
  tool_result: "Tool Result",
  error: "Error",
  diff: "Diff",
}

function getEntrySearchText(entry: LogEntry): string {
  switch (entry.type) {
    case "thinking":
    case "text":
    case "error":
      return entry.content
    case "tool_use":
      return `${entry.tool} ${JSON.stringify(entry.input)}`
    case "tool_result":
      return `${entry.tool} ${entry.output}`
    case "diff":
      return `${entry.files.join(" ")} ${entry.content}`
  }
}

function mcpServerLabel(qualifiedName: string): string {
  const match = qualifiedName.match(/^mcp__([^_]+)__/)
  return match ? `MCP: ${match[1]}` : "MCP"
}

function LogEntryCard({ entry }: { entry: LogEntry }) {
  const permissionHint = getToolPermissionHint(entry)
  const [collapsed, setCollapsed] = useState(
    entry.type === "thinking" || entry.type === "tool_use" || entry.type === "tool_result",
  )

  if (entry.type === "thinking") {
    return (
      <div className="border-l-2 border-muted pl-3 py-1">
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand thinking block" : "Collapse thinking block"}
          className="flex items-center gap-1 ui-meta-text text-muted-foreground hover:text-foreground ui-pressable"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span className="italic">thinking...</span>
        </button>
        {!collapsed && (
          <pre className="ui-meta-text text-muted-foreground whitespace-pre-wrap font-mono mt-1">
            {entry.content}
          </pre>
        )}
      </div>
    )
  }

  if (entry.type === "text") {
    return (
      <div className="py-1">
        <pre className="text-body-md whitespace-pre-wrap font-mono">{entry.content}</pre>
      </div>
    )
  }

  if (entry.type === "tool_use") {
    const inputPreview = JSON.stringify(entry.input, null, 2)
    const isMcp = entry.tool.startsWith("mcp__")
    const toolDisplayName = isMcp
      ? entry.tool.replace(/^mcp__/, "").replace(/__/, " / ")
      : entry.tool

    return (
      <div className="border-l-2 border-hairline pl-3 py-1">
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${toolDisplayName} input` : `Collapse ${toolDisplayName} input`}
          className="flex items-center gap-2 ui-meta-label text-foreground-subtle hover:text-foreground ui-pressable"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <Wrench size={12} />
          <span>{toolDisplayName}</span>
          {isMcp && <Badge variant="outline" className="ui-meta-text px-1 py-0 border-accent/30 text-accent">{mcpServerLabel(entry.tool)}</Badge>}
        </button>
        {!collapsed && (
          <pre className="ui-meta-text text-muted-foreground whitespace-pre-wrap font-mono mt-1 max-h-60 overflow-y-auto ui-scroll-region">
            {inputPreview}
          </pre>
        )}
      </div>
    )
  }

  if (entry.type === "tool_result") {
    const isError = entry.status === "error"
    const isMcp = entry.tool.startsWith("mcp__")
    const toolDisplayName = isMcp
      ? entry.tool.replace(/^mcp__/, "").replace(/__/, " / ")
      : entry.tool

    const borderColor = isError
      ? "border-status-danger/50"
      : isMcp
        ? "border-accent/30"
        : "border-status-success/50"
    const textColor = isError
      ? "text-status-danger hover:text-status-danger/80"
      : isMcp
        ? "text-foreground-subtle hover:text-foreground"
        : "text-status-success hover:text-status-success/80"

    return (
      <div className={cn("border-l-2 pl-3 py-1", borderColor)}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${toolDisplayName} result` : `Collapse ${toolDisplayName} result`}
          className={cn("flex items-center gap-2 ui-meta-label ui-pressable", textColor)}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span>
            {toolDisplayName} {isError ? "failed" : "result"}
          </span>
          {isMcp && <Badge variant="outline" className="ui-meta-text px-1 py-0 border-accent/30 text-accent">{mcpServerLabel(entry.tool)}</Badge>}
        </button>
        {permissionHint && (
          <div className="mt-1 rounded-md border border-status-warning/30 bg-status-warning/10 px-2 py-1.5">
            <p className="ui-meta-text text-status-warning">
              Permission hint: add <span className="font-mono">{permissionHint.toolName}</span> to this skill step&apos;s
              {" "}Allowed Tools, then rerun this step.
            </p>
            {permissionHint.domain && (
              <p className="ui-meta-text text-muted-foreground mt-1">
                If domain allowlist blocks access, add{" "}
                <span className="font-mono">WebFetch(domain:{permissionHint.domain})</span>{" "}
                to <span className="font-mono">.claude/settings.local.json</span>.
              </p>
            )}
          </div>
        )}
        {!collapsed && (
          <pre
            className={cn(
              "ui-meta-text whitespace-pre-wrap font-mono mt-1 max-h-60 overflow-y-auto ui-scroll-region",
              isError ? "text-status-danger/80" : "text-muted-foreground",
            )}
          >
            {entry.output}
          </pre>
        )}
      </div>
    )
  }

  if (entry.type === "error") {
    return (
      <div className="py-1">
        <pre className="ui-meta-text text-status-danger whitespace-pre-wrap font-mono">
          {entry.content}
        </pre>
        {permissionHint && (
          <div className="mt-1 rounded-md border border-status-warning/30 bg-status-warning/10 px-2 py-1.5">
            <p className="ui-meta-text text-status-warning">
              Permission hint: add <span className="font-mono">{permissionHint.toolName}</span> to this skill step&apos;s
              {" "}Allowed Tools, then rerun this step.
            </p>
            {permissionHint.domain && (
              <p className="ui-meta-text text-muted-foreground mt-1">
                If domain allowlist blocks access, add{" "}
                <span className="font-mono">WebFetch(domain:{permissionHint.domain})</span>{" "}
                to <span className="font-mono">.claude/settings.local.json</span>.
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  if (entry.type === "diff") {
    return (
      <div className="border-l-2 border-accent/40 pl-3 py-1">
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand diff" : "Collapse diff"}
          className="flex items-center gap-2 ui-meta-label text-foreground-subtle hover:text-foreground ui-pressable"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <FileCode2 size={12} />
          <span>{entry.files.length} file{entry.files.length !== 1 ? "s" : ""} changed</span>
        </button>
        {!collapsed && (
          <>
            <div className="mt-1 flex flex-wrap gap-1">
              {entry.files.map((file) => (
                <span key={file} className="inline-flex items-center rounded-sm border border-hairline px-1.5 py-0 ui-meta-text text-muted-foreground bg-surface-1/80 font-mono">
                  {file}
                </span>
              ))}
            </div>
            <pre className="ui-meta-text whitespace-pre-wrap font-mono mt-2 max-h-80 overflow-y-auto ui-scroll-region">
              {entry.content.split("\n").map((line, i) => {
                const color = line.startsWith("+") && !line.startsWith("+++")
                  ? "text-status-success"
                  : line.startsWith("-") && !line.startsWith("---")
                    ? "text-status-danger"
                    : line.startsWith("@@")
                      ? "text-accent"
                      : "text-muted-foreground"
                return (
                  <span key={i} className={color}>
                    {line}
                    {"\n"}
                  </span>
                )
              })}
            </pre>
          </>
        )}
      </div>
    )
  }

  return null
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function formatCost(usd: number): string {
  if (usd < 0.001) return "<$0.001"
  if (usd < 0.01) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

export function NodesTab({
  nodes,
  nodeStates,
  activeNodeId,
  evalResults,
  canRerun,
  onSelectNode,
  onRerunFrom,
}: {
  nodes: { id: string; label: string; type: string; indent?: boolean }[]
  nodeStates: Record<string, NodeState>
  activeNodeId: string | null
  evalResults: Record<string, EvaluationResult[]>
  canRerun: boolean
  onSelectNode: (nodeId: string) => void
  onRerunFrom?: (nodeId: string) => void
}) {
  return (
    <div className="rounded-lg surface-soft overflow-hidden">
      {nodes.length === 0 && (
        <div className="px-3 py-4 text-body-md text-muted-foreground text-center">
          No skill steps in this workflow
        </div>
      )}
      {nodes.map((node) => {
        const state = nodeStates[node.id]
        const status = state?.status || "pending"
        const Icon = STATUS_ICONS[status] || Clock
        const statusLabel = STATUS_LABELS[status] || status
        const isActive = node.id === activeNodeId
        const splitterTotalSubtasks = state?.output?.metadata?.splitter_total_subtasks
        const splitterUsedSubtasks = state?.output?.metadata?.splitter_used_subtasks
        const splitterTruncated = Boolean(state?.output?.metadata?.splitter_truncated)

        let durationMs: number | undefined
        if (state?.startedAt && state?.completedAt) {
          durationMs = state.completedAt - state.startedAt
        }

        return (
          <div key={node.id} className="border-b border-hairline last:border-b-0">
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-3/80 ui-pressable focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                isActive && "bg-surface-3/80",
                node.indent && "pl-7",
              )}
              onClick={() => onSelectNode(node.id)}
              aria-label={`Select node ${node.label}`}
            >
              <Icon
                size={14}
                className={cn(
                  status === "completed" && "text-status-success",
                  status === "failed" && "text-status-danger",
                  status === "running" && "text-foreground animate-spin",
                  (status === "pending" || status === "queued" || status === "skipped") &&
                    "text-muted-foreground",
                )}
              />
              <span className="sr-only">Status: {statusLabel}</span>
              <span className="text-body-md font-medium flex-1">{node.label}</span>
              <Badge
                variant={
                  status === "completed"
                    ? "outline"
                    : status === "failed"
                      ? "destructive"
                      : "outline"
                }
                className={cn(
                  "ui-meta-text px-2 py-0",
                  status === "completed" && "border-status-success/30 bg-status-success/10 text-status-success",
                )}
              >
                {statusLabel}
              </Badge>
              {state?.error && (
                <span className={cn("ui-meta-text text-status-danger truncate", PREVIEW_MAX_W)} title={state.error}>
                  {state?.errorKind ? `[${ERROR_KIND_LABELS[state.errorKind] || state.errorKind}] ` : ""}
                  {state.error.slice(0, 60)}{state.error.length > 60 ? "..." : ""}
                </span>
              )}
              {state?.metrics && (state.metrics.tokens_in > 0 || state.metrics.tokens_out > 0) && (
                <span className="ui-meta-text text-muted-foreground font-mono" title={`In: ${state.metrics.tokens_in} / Out: ${state.metrics.tokens_out}`}>
                  {formatTokens(state.metrics.tokens_in + state.metrics.tokens_out)}t
                </span>
              )}
              {state?.metrics && state.metrics.cost_usd > 0 && (
                <span className="ui-meta-text text-muted-foreground font-mono">
                  {formatCost(state.metrics.cost_usd)}
                </span>
              )}
              {durationMs != null && (
                <span className="ui-meta-text text-muted-foreground">
                  {(durationMs / 1000).toFixed(1)}s
                </span>
              )}
              {splitterTruncated && (
                <span className="ui-meta-text text-status-warning bg-status-warning/20 border border-status-warning/30 rounded px-1 py-0">
                  truncated {splitterUsedSubtasks || "?"}/{splitterTotalSubtasks || "?"}
                </span>
              )}
              {(state?.retriesUsed || 0) > 0 && (
                <span className="ui-meta-text text-status-warning font-mono">
                  retry x{state?.retriesUsed}
                </span>
              )}
              {state?.policyApplied && (
                <span className="ui-meta-text text-muted-foreground font-mono">
                  {state.policyApplied}
                </span>
              )}
              {evalResults[node.id]?.length > 0 && (
                <div className="flex items-center gap-2 ml-1">
                  {evalResults[node.id].map((er) => (
                    <span
                      key={er.attempt}
                      className={cn(
                        "ui-meta-text font-mono px-1 py-0 rounded",
                        er.passed
                          ? "bg-status-success/20 text-status-success"
                          : "bg-status-warning/20 text-status-warning",
                      )}
                    >
                      {er.score}/10
                    </span>
                  ))}
                </div>
              )}
              {canRerun && (status === "completed" || status === "failed") && onRerunFrom && (
                <button
                  type="button"
                  className="ml-1 ui-icon-button border border-hairline bg-surface-1/80"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRerunFrom(node.id)
                  }}
                  aria-label={`Rerun from ${node.label}`}
                  title="Rerun from here"
                >
                  <RotateCcw size={12} />
                </button>
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function LogTab({
  selectedNodeId,
  nodeStates,
  evalResults,
}: {
  selectedNodeId: string | null
  nodeStates: Record<string, NodeState>
  evalResults: Record<string, EvaluationResult[]>
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevLogLengthRef = useRef(0)
  const prevSelectedNodeIdRef = useRef<string | null>(selectedNodeId)
  const state = selectedNodeId ? nodeStates[selectedNodeId] : null
  const log = state?.log || []

  const [searchQuery, setSearchQuery] = useState("")
  const [activeTypeFilters, setActiveTypeFilters] = useState<Set<LogEntryType>>(
    () => new Set(LOG_ENTRY_TYPES),
  )

  // Reset search/filter when switching nodes
  useEffect(() => {
    setSearchQuery("")
    setActiveTypeFilters(new Set(LOG_ENTRY_TYPES))
  }, [selectedNodeId])

  const filteredLog = useMemo(() => {
    const query = searchQuery.toLowerCase()
    return log.filter((entry) => {
      if (!activeTypeFilters.has(entry.type)) return false
      if (query && !getEntrySearchText(entry).toLowerCase().includes(query)) return false
      return true
    })
  }, [log, searchQuery, activeTypeFilters])

  const toggleTypeFilter = (type: LogEntryType) => {
    setActiveTypeFilters((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const hasActiveFilters = searchQuery !== "" || activeTypeFilters.size !== LOG_ENTRY_TYPES.length

  useEffect(() => {
    prevLogLengthRef.current = log.length
    prevSelectedNodeIdRef.current = selectedNodeId
  }, [selectedNodeId])

  useEffect(() => {
    // Avoid forcing scroll-to-bottom when the user switches between nodes.
    if (prevSelectedNodeIdRef.current !== selectedNodeId) {
      prevSelectedNodeIdRef.current = selectedNodeId
      prevLogLengthRef.current = log.length
      return
    }
    const delta = log.length - prevLogLengthRef.current
    prevLogLengthRef.current = log.length
    if (delta <= 0) return
    const behavior: ScrollBehavior = delta === 1 ? "smooth" : "auto"
    scrollRef.current?.scrollIntoView({ behavior, block: "end" })
  }, [log.length, selectedNodeId])

  if (!selectedNodeId) {
    return (
      <div className="rounded-lg surface-soft p-6 text-center text-body-md text-muted-foreground">
        Click a step to view its log
      </div>
    )
  }

  if (log.length === 0 && !state?.error) {
    return (
      <div className="rounded-lg surface-soft p-6 text-center text-body-md text-muted-foreground">
        {state?.status === "pending" || state?.status === "queued"
          ? "Waiting to execute..."
          : state?.status === "running"
            ? "Running... output will appear here soon."
            : state?.status === "waiting_approval"
              ? "Waiting for approval..."
            : "No log entries"}
      </div>
    )
  }

  return (
    <div className="rounded-lg surface-soft p-3 space-y-2">
      {/* Search and filter controls */}
      {log.length > 0 && (
        <div className="space-y-2">
          {/* Search input */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search log entries..."
              className="w-full h-control-sm pl-8 pr-8 rounded-md border border-hairline bg-surface-2/60 text-body-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 ui-icon-button"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Type filter buttons */}
          <div className="flex flex-wrap gap-2 items-center">
            {LOG_ENTRY_TYPES.map((type) => {
              const isActive = activeTypeFilters.has(type)
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleTypeFilter(type)}
                  className={cn(
                    "px-2 py-0.5 rounded-md ui-meta-text border ui-pressable",
                    isActive
                      ? cn(
                          "bg-surface-3 border-hairline",
                          type === "error" ? "text-status-danger" : "text-foreground",
                        )
                      : "bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-surface-2",
                  )}
                  aria-pressed={isActive}
                  aria-label={`${isActive ? "Hide" : "Show"} ${LOG_TYPE_LABELS[type]} entries`}
                >
                  {LOG_TYPE_LABELS[type]}
                </button>
              )
            })}
            {/* Filtered/total count */}
            <span className="ui-meta-text text-muted-foreground ml-auto">
              {hasActiveFilters
                ? `${filteredLog.length}/${log.length} entries`
                : `${log.length} entries`}
            </span>
          </div>
        </div>
      )}

      {/* Scrollable log content */}
      <div className="max-h-96 overflow-y-auto ui-scroll-region space-y-1">
        {state?.metrics && (state.metrics.tokens_in > 0 || state.metrics.tokens_out > 0) && (
          <div className="flex items-center gap-3 ui-meta-text text-muted-foreground bg-surface-2/50 rounded px-2 py-1.5 mb-1 font-mono">
            <span title="Input tokens">In: {formatTokens(state.metrics.tokens_in)}</span>
            <span title="Output tokens">Out: {formatTokens(state.metrics.tokens_out)}</span>
            {state.metrics.cost_usd > 0 && <span title="Estimated cost">{formatCost(state.metrics.cost_usd)}</span>}
            {Number.isFinite(state.metrics.latency_ms) && state.metrics.latency_ms >= 0 && (
              <span title="Latency">{(state.metrics.latency_ms / 1000).toFixed(1)}s</span>
            )}
            {state.meta?.model_id && <span className="text-muted-foreground/60">{state.meta.model_id}</span>}
          </div>
        )}
        {state?.error && (
          <div className="ui-meta-text text-status-danger bg-status-danger/10 rounded px-2 py-1 border border-status-danger/20 mb-1">
            <span className="font-medium">{state.errorKind ? ERROR_KIND_LABELS[state.errorKind] || state.errorKind : "Error"}:</span> {state.error}
            {(state.retriesUsed || 0) > 0 && (
              <span className="ml-2 text-status-warning">retry x{state.retriesUsed}</span>
            )}
            {state.policyApplied && (
              <span className="ml-2 text-muted-foreground">policy: {state.policyApplied}</span>
            )}
          </div>
        )}
        {filteredLog.length === 0 && log.length > 0 && (
          <div className="py-4 text-center text-body-sm text-muted-foreground">
            No entries match the current filters
          </div>
        )}
        {filteredLog.map((entry, i) => (
          <LogEntryCard key={`${selectedNodeId}-${entry.type}-${i}`} entry={entry} />
        ))}
        {selectedNodeId && evalResults[selectedNodeId]?.length > 0 && (
          <div className="border-t border-hairline pt-2 mt-2 space-y-2">
            <span className="ui-meta-label text-muted-foreground">Evaluations</span>
            {evalResults[selectedNodeId].map((er) => (
              <div key={er.attempt} className="space-y-1.5">
                <div
                  className={cn(
                    "ui-meta-text font-mono px-2 py-1 rounded",
                    er.passed
                      ? "bg-status-success/10 text-status-success"
                      : "bg-status-warning/10 text-status-warning",
                  )}
                >
                  Attempt {er.attempt}: {er.score}/10 {er.passed ? "PASS" : "FAIL"} — {er.reason}
                </div>
                {er.criteria && er.criteria.length > 0 && (
                  <div className="px-2 space-y-1">
                    {er.criteria.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 ui-meta-text">
                        <span className="w-20 truncate text-muted-foreground">{c.id}</span>
                        <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full ui-transition-width ui-motion-standard",
                              c.score >= 7 ? "bg-status-success" : c.score >= 4 ? "bg-status-warning" : "bg-status-danger",
                            )}
                            style={{ width: `${(c.score / 10) * 100}%` }}
                          />
                        </div>
                        <span className="w-8 text-right font-mono text-muted-foreground">{c.score}/10</span>
                      </div>
                    ))}
                  </div>
                )}
                {er.fix_instructions && (
                  <div className="px-2 py-1.5 ui-meta-text bg-surface-2 border border-hairline rounded">
                    <span className="font-medium text-foreground-subtle">Fix: </span>
                    <span className="text-muted-foreground">{er.fix_instructions}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div ref={scrollRef} />
      </div>
    </div>
  )
}
