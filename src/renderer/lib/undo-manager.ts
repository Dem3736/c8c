import { atom } from "jotai"
import type { Workflow } from "@shared/types"

const MAX_UNDO_STACK = 50

export const undoStackAtom = atom<Workflow[]>([])
export const redoStackAtom = atom<Workflow[]>([])

export const canUndoAtom = atom((get) => get(undoStackAtom).length > 0)
export const canRedoAtom = atom((get) => get(redoStackAtom).length > 0)

/**
 * Push a snapshot before a mutation. Call this BEFORE changing the workflow.
 * Clears the redo stack (standard undo/redo behavior).
 */
export function pushUndoSnapshot(
  workflow: Workflow,
  setUndoStack: (fn: (prev: Workflow[]) => Workflow[]) => void,
  setRedoStack: (fn: (prev: Workflow[]) => Workflow[]) => void,
) {
  setUndoStack((prev) => {
    const next = [...prev, workflow]
    if (next.length > MAX_UNDO_STACK) next.shift()
    return next
  })
  setRedoStack(() => [])
}

/**
 * Undo: pop from undo stack, push current to redo, return the restored workflow.
 * Returns null if nothing to undo.
 */
export function performUndo(
  currentWorkflow: Workflow,
  undoStack: Workflow[],
  setUndoStack: (fn: (prev: Workflow[]) => Workflow[]) => void,
  setRedoStack: (fn: (prev: Workflow[]) => Workflow[]) => void,
): Workflow | null {
  if (undoStack.length === 0) return null
  const restored = undoStack[undoStack.length - 1]
  setUndoStack((prev) => prev.slice(0, -1))
  setRedoStack((prev) => [...prev, currentWorkflow])
  return restored
}

/**
 * Redo: pop from redo stack, push current to undo, return the re-applied workflow.
 * Returns null if nothing to redo.
 */
export function performRedo(
  currentWorkflow: Workflow,
  redoStack: Workflow[],
  setUndoStack: (fn: (prev: Workflow[]) => Workflow[]) => void,
  setRedoStack: (fn: (prev: Workflow[]) => Workflow[]) => void,
): Workflow | null {
  if (redoStack.length === 0) return null
  const restored = redoStack[redoStack.length - 1]
  setRedoStack((prev) => prev.slice(0, -1))
  setUndoStack((prev) => [...prev, currentWorkflow])
  return restored
}
