import { useState, useEffect, useMemo, useRef } from "react"
import { useAtom, useAtomValue } from "jotai"
import { approvalRequestsAtom, workflowExecutionStatesAtom } from "@/features/execution"
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
import type { EvaluatorNodeConfig, WorkflowNode } from "@shared/types"

type EvaluatorWorkflowNode = Extract<WorkflowNode, { type: "evaluator" }>

function isEvaluatorNode(node: WorkflowNode | null | undefined): node is EvaluatorWorkflowNode {
  return node?.type === "evaluator"
}

export function ApprovalDialog() {
  const [requests, setRequests] = useAtom(approvalRequestsAtom)
  const executionStates = useAtomValue(workflowExecutionStatesAtom)
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
        "Rejecting the workflow timed out. Check the main process and try again.",
      )
      if (!ok) {
        toast.error("Could not stop workflow: run is no longer active")
        shiftQueue()
        return
      }
      shiftQueue()
    } catch (err) {
      console.error("[ApprovalDialog] reject failed:", err)
      toast.error("Failed to stop workflow")
    } finally {
      if (mountedRef.current) {
        setSubmitting(false)
      }
    }
  }

  return (
    <Dialog open={!!request} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto ui-scroll-region" showCloseButton={false} aria-describedby="approval-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Waiting for your approval
            {queueCount > 1 && (
              <Badge variant="secondary">{queueCount - 1} more pending</Badge>
            )}
          </DialogTitle>
          <DialogDescription id="approval-description">
            {request.message || "Review this step and choose whether to continue the run."}
          </DialogDescription>
        </DialogHeader>

        {evaluatorSummary && (
          <section className="space-y-3 rounded-lg surface-warning-soft px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="ui-meta-label text-status-warning">{evaluatorSummary.group}</p>
                <p className="mt-1 text-body-sm font-medium text-foreground">{evaluatorSummary.title}</p>
              </div>
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
              </div>
            </div>

            <div>
              <p className="ui-meta-label text-muted-foreground">Criteria</p>
              <p className="mt-1 text-body-sm text-foreground whitespace-pre-wrap">{evaluatorSummary.criteria}</p>
            </div>

            {evaluatorSummary.latestAttempt && (
              <div className="space-y-2">
                <div>
                  <p className="ui-meta-label text-muted-foreground">What needs attention</p>
                  <p className="mt-1 text-body-sm text-foreground whitespace-pre-wrap">{evaluatorSummary.latestAttempt.reason}</p>
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
                {evaluatorSummary.attempts.length > 1 && (
                  <p className="ui-meta-text text-muted-foreground">
                    Latest attempt shown. {evaluatorSummary.attempts.length} evaluation attempts recorded for this gate.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {request.content && (
          request.allowEdit ? (
            <Textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              rows={12}
              className="font-mono text-body-sm"
            />
          ) : (
            <div className="rounded-md border border-hairline bg-surface-2 p-3 max-h-64 overflow-y-auto ui-scroll-region">
              <pre className="text-body-sm text-foreground-subtle whitespace-pre-wrap">{request.content}</pre>
            </div>
          )
        )}

        <DialogFooter>
          <Button variant="destructive" size="sm" onClick={handleReject} disabled={submitting}>
            <X size={14} />
            Stop workflow
          </Button>
          <Button size="sm" onClick={handleApprove} disabled={submitting}>
            <Check size={14} />
            {request.allowEdit ? "Approve and continue" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
