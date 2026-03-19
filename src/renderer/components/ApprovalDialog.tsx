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
import { getRuntimeStagePresentation } from "@/lib/runtime-flow-labels"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import { consumeShortcut, isShortcutConsumed } from "@/lib/keyboard-shortcuts"
import { ExecutionSurfaceNoticeBanner } from "@/components/ui/execution-surface-notice"
import type { EvaluatorNodeConfig, WorkflowNode } from "@shared/types"

type EvaluatorWorkflowNode = Extract<WorkflowNode, { type: "evaluator" }>

function isEvaluatorNode(node: WorkflowNode | null | undefined): node is EvaluatorWorkflowNode {
  return node?.type === "evaluator"
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
    const directEvaluator = directPredecessorIds
      .map((nodeId) => workflow.nodes.find((node) => node.id === nodeId) || null)
      .find(isEvaluatorNode)
    const fallbackEvaluator = [...workflow.nodes]
      .reverse()
      .find((node) => isEvaluatorNode(node) && (requestExecutionState.evalResults[node.id] || []).length > 0)
    const evaluatorNode = directEvaluator || (isEvaluatorNode(fallbackEvaluator) ? fallbackEvaluator : null)
    if (!evaluatorNode) return null

    const attempts = requestExecutionState.evalResults[evaluatorNode.id] || []
    const latestAttempt = attempts[attempts.length - 1] || null
    const config = evaluatorNode.config as EvaluatorNodeConfig
    const presentation = getRuntimeStagePresentation(evaluatorNode, { fallbackId: evaluatorNode.id })

    return {
      criteria: config.criteria,
      threshold: config.threshold,
      title: presentation.title,
      group: presentation.group,
      attempts,
      latestAttempt,
    }
  }, [request, requestExecutionState])
  const primaryShortcutLabel = `${desktopRuntime.primaryModifierLabel}↵`
  const failedCriterionCount = useMemo(() => {
    if (!evaluatorSummary?.latestAttempt?.criteria?.length) return 0
    return evaluatorSummary.latestAttempt.criteria.filter((criterion) => criterion.score < evaluatorSummary.threshold).length
  }, [evaluatorSummary])

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
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto ui-scroll-region" showCloseButton={false} aria-describedby="approval-description">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Approval before continue
            {queueCount > 1 && (
              <Badge variant="secondary">{queueCount - 1} more pending</Badge>
            )}
            <Badge variant="outline" size="compact">{primaryShortcutLabel} approve</Badge>
          </DialogTitle>
          <DialogDescription id="approval-description">
            {request.message || "Review this stage before the process continues."}
          </DialogDescription>
        </DialogHeader>

        {evaluatorSummary && (
          <ExecutionSurfaceNoticeBanner
            notice={{
              level: "warning",
              title: evaluatorSummary.group,
              description: evaluatorSummary.latestAttempt?.reason
                || "Review this gate before the process continues.",
              actionLabel: "",
              actionTarget: "result",
            }}
            children={(
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-body-sm font-medium text-foreground">{evaluatorSummary.title}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" size="compact">
                      Threshold {evaluatorSummary.threshold}/10
                    </Badge>
                    {evaluatorSummary.latestAttempt && (
                      <Badge
                        variant={evaluatorSummary.latestAttempt.passed ? "success" : "warning"}
                        size="compact"
                      >
                        Score {evaluatorSummary.latestAttempt.score}/10
                      </Badge>
                    )}
                    {evaluatorSummary.attempts.length > 1 && (
                      <Badge variant="outline" size="compact">
                        {evaluatorSummary.attempts.length} attempts
                      </Badge>
                    )}
                    {failedCriterionCount > 0 && (
                      <Badge variant="warning" size="compact">
                        {failedCriterionCount} below threshold
                      </Badge>
                    )}
                  </div>
                </div>

                {evaluatorSummary.latestAttempt && (
                  <DisclosurePanel summary="Gate details">
                    <div className="space-y-3">
                      <div>
                        <p className="ui-meta-label text-muted-foreground">Criteria</p>
                        <p className="mt-1 text-body-sm text-foreground whitespace-pre-wrap">{evaluatorSummary.criteria}</p>
                      </div>
                      {evaluatorSummary.latestAttempt.fix_instructions && (
                        <div>
                          <p className="ui-meta-label text-muted-foreground">Fix guidance</p>
                          <p className="mt-1 text-body-sm text-foreground whitespace-pre-wrap">
                            {evaluatorSummary.latestAttempt.fix_instructions}
                          </p>
                        </div>
                      )}
                      {evaluatorSummary.latestAttempt.criteria && evaluatorSummary.latestAttempt.criteria.length > 0 && (
                        <div className="space-y-1">
                          <p className="ui-meta-label text-muted-foreground">Criterion scores</p>
                          {evaluatorSummary.latestAttempt.criteria.map((criterion) => (
                            <div key={`${criterion.id}-${criterion.score}`} className="flex items-center justify-between gap-3 text-body-sm">
                              <span className="text-foreground">{criterion.id}</span>
                              <span className="font-mono text-muted-foreground">{criterion.score}/10</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </DisclosurePanel>
                )}
              </div>
            )}
          />
        )}

        {request.content && (
          request.allowEdit ? (
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="ui-meta-label text-muted-foreground">Adjust before continue</p>
                <Badge variant="outline" size="compact">Approve uses current text</Badge>
              </div>
              <Textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                rows={12}
                className="font-mono text-body-sm"
              />
            </section>
          ) : (
            <DisclosurePanel summary="Stage payload">
              <div>
                <div className="rounded-md border border-hairline bg-surface-2 p-3 max-h-64 overflow-y-auto ui-scroll-region">
                  <pre className="text-body-sm text-foreground-subtle whitespace-pre-wrap">{request.content}</pre>
                </div>
              </div>
            </DisclosurePanel>
          )
        )}

        <DialogFooter>
          <Button variant="destructive" size="sm" onClick={handleReject} disabled={submitting}>
            <X size={14} />
            Reject
          </Button>
          <Button size="sm" onClick={handleApprove} disabled={submitting}>
            <Check size={14} />
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
