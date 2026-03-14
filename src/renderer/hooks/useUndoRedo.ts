import { useEffect, useCallback } from "react"
import { useAtom, useSetAtom } from "jotai"
import { currentWorkflowAtom, desktopRuntimeAtom } from "@/lib/store"
import {
  undoStackAtom,
  redoStackAtom,
  performUndo,
  performRedo,
} from "@/lib/undo-manager"

export function useUndoRedo() {
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const [undoStack, setUndoStack] = useAtom(undoStackAtom)
  const [redoStack, setRedoStack] = useAtom(redoStackAtom)
  const [desktopRuntime] = useAtom(desktopRuntimeAtom)

  const undo = useCallback(() => {
    const restored = performUndo(workflow, undoStack, setUndoStack, setRedoStack)
    if (restored) setWorkflow(restored)
  }, [workflow, undoStack, setUndoStack, setRedoStack, setWorkflow])

  const redo = useCallback(() => {
    const restored = performRedo(workflow, redoStack, setUndoStack, setRedoStack)
    if (restored) setWorkflow(restored)
  }, [workflow, redoStack, setUndoStack, setRedoStack, setWorkflow])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const usesPrimaryModifier = desktopRuntime.primaryModifierKey === "meta"
        ? event.metaKey
        : event.ctrlKey
      if (!usesPrimaryModifier) return

      const key = event.key.toLowerCase()
      if (key !== "z") return

      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      const isEditable = Boolean(
        target?.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.closest("[contenteditable=true]"),
      )
      if (isEditable) return

      event.preventDefault()
      if (event.shiftKey) {
        redo()
      } else {
        undo()
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [desktopRuntime.primaryModifierKey, undo, redo])

  return { undo, redo }
}
