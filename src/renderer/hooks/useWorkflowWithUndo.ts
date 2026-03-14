import { useCallback } from "react"
import { useAtom } from "jotai"
import { currentWorkflowAtom } from "@/lib/store"
import { undoStackAtom, redoStackAtom, pushUndoSnapshot } from "@/lib/undo-manager"
import type { Workflow } from "@shared/types"

/**
 * Returns a `setWorkflow` that automatically pushes an undo snapshot
 * before applying the mutation. Use this in components that mutate
 * the workflow (ChainBuilder, CanvasView, etc.).
 */
export function useWorkflowWithUndo() {
  const [workflow, setWorkflowDirect] = useAtom(currentWorkflowAtom)
  const [, setUndoStack] = useAtom(undoStackAtom)
  const [, setRedoStack] = useAtom(redoStackAtom)

  const setWorkflowWithUndo = useCallback(
    (updater: Workflow | ((prev: Workflow) => Workflow)) => {
      pushUndoSnapshot(workflow, setUndoStack, setRedoStack)
      setWorkflowDirect(updater)
    },
    [workflow, setWorkflowDirect, setUndoStack, setRedoStack],
  )

  return { workflow, setWorkflow: setWorkflowWithUndo, setWorkflowDirect }
}
