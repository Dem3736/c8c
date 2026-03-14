import { useState, useEffect } from "react"
import { useAtom } from "jotai"
import { approvalRequestsAtom } from "@/lib/store"
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

export function ApprovalDialog() {
  const [requests, setRequests] = useAtom(approvalRequestsAtom)
  const [editedContent, setEditedContent] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const request = requests[0] ?? null
  const queueCount = requests.length

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
      const ok = await window.api.approveNode(request.runId, request.nodeId, content)
      if (!ok) {
        toast.error("Could not approve node: run is no longer active")
        return
      }
      shiftQueue()
    } catch (err) {
      console.error("[ApprovalDialog] approve failed:", err)
      toast.error("Failed to approve step")
    } finally {
      setSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const ok = await window.api.rejectNode(request.runId, request.nodeId)
      if (!ok) {
        toast.error("Could not stop workflow: run is no longer active")
        return
      }
      shiftQueue()
    } catch (err) {
      console.error("[ApprovalDialog] reject failed:", err)
      toast.error("Failed to stop workflow")
    } finally {
      setSubmitting(false)
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
