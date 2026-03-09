import { useState, useEffect } from "react"
import { useAtom } from "jotai"
import { approvalRequestAtom } from "@/lib/store"
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
import { Check, X } from "lucide-react"
import { toast } from "sonner"

export function ApprovalDialog() {
  const [request, setRequest] = useAtom(approvalRequestAtom)
  const [editedContent, setEditedContent] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (request) {
      setEditedContent(request.content)
    }
  }, [request])

  if (!request) return null

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
      setRequest(null)
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
      setRequest(null)
    } catch (err) {
      console.error("[ApprovalDialog] reject failed:", err)
      toast.error("Failed to stop workflow")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!request} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Waiting for your approval</DialogTitle>
          <DialogDescription>
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
            <div className="rounded-md border border-hairline bg-surface-2 p-3 max-h-64 overflow-y-auto">
              <pre className="text-body-sm text-foreground/80 whitespace-pre-wrap">{request.content}</pre>
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
