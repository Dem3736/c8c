import { useState, useEffect, useMemo, useRef } from "react"
import { useAtom, useAtomValue } from "jotai"
import { approvalRequestsAtom, workflowExecutionStatesAtom } from "@/features/execution"
import { desktopRuntimeAtom } from "@/lib/store"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Check, X } from "lucide-react"
import { toast } from "sonner"
import { DEFAULT_EXECUTION_IPC_TIMEOUT_MS, withIpcTimeout } from "@/features/execution"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import { consumeShortcut, isShortcutConsumed } from "@/lib/keyboard-shortcuts"
import type { WorkflowNode } from "@shared/types"
import { deriveExecutionLoopSummary } from "@/lib/execution-loops"
import { ExecutionLoopCard } from "@/components/ui/execution-loop-card"
import { getRuntimeNodeLabel, getRuntimeStagePresentation } from "@/lib/runtime-flow-labels"

type EvaluatorWorkflowNode = Extract<WorkflowNode, { type: "evaluator" }>

function isEvaluatorNode(node: WorkflowNode | null | undefined): node is EvaluatorWorkflowNode {
  return node?.type === "evaluator"
}

function labelFromPathLike(value: string | null | undefined, fallback: string) {
  if (!value) return fallback
  const leaf = value.split(/[\\/]/).pop() || value
  const normalized = leaf.replace(/\.(ya?ml|json)$/i, "").trim()
  return normalized || fallback
}

function formatNextStageLabel(labels: string[]) {
  if (labels.length === 0) return null
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels[0]} +${labels.length - 1} more`
}

export function ApprovalDialog() {
  const [requests, setRequests] = useAtom(approvalRequestsAtom)
  const executionStates = useAtomValue(workflowExecutionStatesAtom)
  const desktopRuntime = useAtomValue(desktopRuntimeAtom)
  const [editedContent, setEditedContent] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const mountedRef = useRef(true)

  const request = requests[0] ?? null
  const queueCount = requests.length
  const requestExecutionState = useMemo(
    () => request
      ? executionStates[request.workflowKey]
        || Object.values(executionStates).find((state) => state.runId === request.runId)
        || null
      : null,
    [executionStates, request],
  )
  const evaluatorSummary = useMemo(() => {
    if (!request || !requestExecutionState?.workflowSnapshot) return null

    const workflow = requestExecutionState.workflowSnapshot
    const directPredecessorIds = workflow.edges
      .filter((edge) => edge.target === request.nodeId)
      .map((edge) => edge.source)
    const directEvaluatorNode = directPredecessorIds
      .map((nodeId) => workflow.nodes.find((node) => node.id === nodeId) || null)
      .find(isEvaluatorNode)
    return deriveExecutionLoopSummary({
      workflow,
      nodeStates: requestExecutionState.nodeStates,
      evalResults: requestExecutionState.evalResults,
      runOutcome: requestExecutionState.runOutcome,
      preferredEvaluatorNodeId: directEvaluatorNode?.id || null,
    })
  }, [request, requestExecutionState])
  const primaryShortcutLabel = `${desktopRuntime.primaryModifierLabel}↵`
  const failedCriterionCount = evaluatorSummary?.failedCriteriaCount || 0
  const gateTitle = evaluatorSummary
    ? `${evaluatorSummary.title} gate`
    : "Approval required"
  const gateDescription = request?.message || "Review this stage before the process continues."
  const requestContext = useMemo(() => {
    if (!request) return null

    const workflow = requestExecutionState?.workflowSnapshot
    const workflowName = requestExecutionState?.workflowName.trim()
      || labelFromPathLike(requestExecutionState?.runWorkflowPath, labelFromPathLike(request.workflowKey, "Workflow"))
    const stageNode = workflow?.nodes.find((node) => node.id === request.nodeId) || null
    const stageLabel = stageNode
      ? getRuntimeNodeLabel(stageNode, { fallbackId: stageNode.id })
      : labelFromPathLike(request.nodeId, "Stage")
    const stageKind = stageNode
      ? getRuntimeStagePresentation(stageNode, { fallbackId: stageNode.id }).kind
      : "Stage"
    const nextStageLabels = workflow
      ? Array.from(new Set(
        workflow.edges
          .filter((edge) => edge.source === request.nodeId)
          .map((edge) => workflow.nodes.find((node) => node.id === edge.target) || null)
          .filter((node): node is WorkflowNode => Boolean(node))
          .map((node) => getRuntimeNodeLabel(node, { fallbackId: node.id })),
      ))
      : []
    const nextStageLabel = formatNextStageLabel(nextStageLabels)

    return {
      workflowName,
      stageLabel,
      stageKind,
      approveConsequence: nextStageLabel
        ? `Continues to ${nextStageLabel}`
        : workflow
          ? "Completes this workflow run"
          : "Continues this workflow run",
      rejectConsequence: "Stops this workflow run",
    }
  }, [request, requestExecutionState])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (request) {
      setEditedContent(request.content)
    }
  }, [request])

  useEffect(() => {
    if (!request) return

    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isShortcutConsumed(event)) return

      const usesPrimaryModifier = desktopRuntime.primaryModifierKey === "meta"
        ? event.metaKey
        : event.ctrlKey
      if (!usesPrimaryModifier || event.key !== "Enter") return
      consumeShortcut(event)
      void handleApprove()
    }

    window.addEventListener("keydown", handler, true)
    return () => {
      window.removeEventListener("keydown", handler, true)
    }
  }, [desktopRuntime.primaryModifierKey, request, submitting, editedContent])

  if (!request) return null

  const shiftQueue = () => {
    setRequests((prev) => prev.slice(1))
  }

  const handleApprove = async () => {
    if (submitting) return
    const content = request.allowEdit ? editedContent : undefined
    setSubmitting(true)
    try {
      const ok = await withIpcTimeout(
        window.api.approveNode(request.runId, request.nodeId, content),
        DEFAULT_EXECUTION_IPC_TIMEOUT_MS,
        "Approval timed out. Check the main process and try again.",
      )
      if (!ok) {
        toast.error("Could not approve node: run is no longer active")
        shiftQueue()
        return
      }
      shiftQueue()
    } catch (err) {
      console.error("[ApprovalDialog] approve failed:", err)
      toast.error("Failed to approve step")
    } finally {
      if (mountedRef.current) {
        setSubmitting(false)
      }
    }
  }

  const handleReject = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const ok = await withIpcTimeout(
        window.api.rejectNode(request.runId, request.nodeId),
        DEFAULT_EXECUTION_IPC_TIMEOUT_MS,
        "Rejecting the process timed out. Check the main process and try again.",
      )
      if (!ok) {
        toast.error("Could not stop process: it is no longer active")
        shiftQueue()
        return
      }
      shiftQueue()
    } catch (err) {
      console.error("[ApprovalDialog] reject failed:", err)
      toast.error("Failed to stop process")
    } finally {
      if (mountedRef.current) {
        setSubmitting(false)
      }
    }
  }

  return (
    <Dialog open={!!request} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto ui-scroll-region" showCloseButton={false} aria-describedby="approval-description">
        <DialogHeader className="space-y-2">
          <DialogTitle>{gateTitle}</DialogTitle>
          <DialogDescription id="approval-description">
            {gateDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          {queueCount > 1 && (
            <Badge variant="secondary">{queueCount - 1} more pending</Badge>
          )}
          <Badge variant="outline" size="compact">{primaryShortcutLabel} approve</Badge>
          {failedCriterionCount > 0 && (
            <Badge variant="warning" size="compact">
              {failedCriterionCount} below
            </Badge>
          )}
        </div>

        {requestContext && (
          <section className="rounded-lg border border-hairline bg-surface-2/70 p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" size="compact">Workflow</Badge>
              <span className="text-body-sm font-medium text-foreground">{requestContext.workflowName}</span>
              <Badge variant="outline" size="compact">{requestContext.stageKind}</Badge>
              {request.allowEdit && (
                <Badge variant="outline" size="compact">Editable payload</Badge>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border border-hairline bg-surface-1/80 px-3 py-2.5">
                <div className="ui-meta-label text-muted-foreground">Current stage</div>
                <div className="text-body-sm font-medium text-foreground">{requestContext.stageLabel}</div>
              </div>
              <div className="rounded-md border border-hairline bg-surface-1/80 px-3 py-2.5">
                <div className="ui-meta-label text-muted-foreground">Workflow</div>
                <div className="text-body-sm font-medium text-foreground">{requestContext.workflowName}</div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border border-status-success/20 bg-status-success/5 px-3 py-2.5">
                <div className="ui-meta-label text-status-success">Approve</div>
                <div className="text-body-sm font-medium text-foreground">{requestContext.approveConsequence}</div>
              </div>
              <div className="rounded-md border border-status-danger/20 bg-status-danger/5 px-3 py-2.5">
                <div className="ui-meta-label text-status-danger">Reject</div>
                <div className="text-body-sm font-medium text-foreground">{requestContext.rejectConsequence}</div>
              </div>
            </div>
          </section>
        )}

        {evaluatorSummary && (
          <ExecutionLoopCard
            summary={evaluatorSummary}
            compact
            detailSummary="Why / checks"
          />
        )}

        {request.content && (
          request.allowEdit ? (
            <section className="space-y-2 rounded-lg surface-inset-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="ui-meta-label text-muted-foreground">Gate payload</p>
                <Badge variant="outline" size="compact">Editable</Badge>
              </div>
              <Textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                rows={12}
                className="font-mono text-body-sm"
              />
            </section>
          ) : (
            <DisclosurePanel summary="Show payload">
              <div className="rounded-lg surface-inset-card p-3">
                <div className="max-h-64 overflow-y-auto ui-scroll-region">
                  <pre className="text-body-sm text-foreground-subtle whitespace-pre-wrap">{request.content}</pre>
                </div>
              </div>
            </DisclosurePanel>
          )
        )}

        <DialogFooter className="border-t border-hairline/70 pt-3">
          <Button variant="destructive" size="sm" onClick={handleReject} disabled={submitting}>
            <X size={14} />
            Reject & stop
          </Button>
          <Button size="sm" onClick={handleApprove} disabled={submitting}>
            <Check size={14} />
            Approve & continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
