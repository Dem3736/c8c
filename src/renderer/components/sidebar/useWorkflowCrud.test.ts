import { createStore } from "jotai"
import { describe, expect, it, vi } from "vitest"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import { currentWorkflowAtom, selectedWorkflowPathAtom, workflowSavedSnapshotAtom } from "@/lib/store"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { createEmptyWorkflowExecutionState } from "@/lib/workflow-execution"
import { workflowExecutionStatesAtom } from "@/features/execution"
import { applyLoadedWorkflow, createEmptySelectionState } from "./useWorkflowCrud"

describe("useWorkflowCrud helpers", () => {
  it("preserves execution state when opening another workflow", () => {
    const store = createStore()
    const targetPath = "/tmp/running.chain"
    const runningState = {
      ...createEmptyWorkflowExecutionState(),
      runStatus: "running" as const,
      runId: "run-1",
      workspace: "/tmp/run-1",
    }
    const loadedWorkflow = {
      ...createEmptyWorkflow(),
      name: "Running workflow",
    }

    store.set(workflowExecutionStatesAtom, {
      [targetPath]: runningState,
    })

    applyLoadedWorkflow(
      targetPath,
      loadedWorkflow,
      (next) => {
        const value = typeof next === "function" ? next(store.get(selectedWorkflowPathAtom)) : next
        store.set(selectedWorkflowPathAtom, value)
      },
      (next) => {
        const value = typeof next === "function" ? next(store.get(currentWorkflowAtom)) : next
        store.set(currentWorkflowAtom, value)
      },
      (next) => {
        const value = typeof next === "function" ? next(store.get(workflowSavedSnapshotAtom)) : next
        store.set(workflowSavedSnapshotAtom, value)
      },
    )

    expect(store.get(selectedWorkflowPathAtom)).toBe(targetPath)
    expect(store.get(currentWorkflowAtom)).toEqual(loadedWorkflow)
    expect(store.get(workflowSavedSnapshotAtom)).toBe(workflowSnapshot(loadedWorkflow))
    expect(store.get(workflowExecutionStatesAtom)[targetPath]).toEqual(runningState)
  })

  it("clears draft execution when switching to an empty selection", () => {
    const store = createStore()
    const clearDraftExecutionState = vi.fn()

    createEmptySelectionState(
      (next) => {
        const value = typeof next === "function" ? next(store.get(selectedWorkflowPathAtom)) : next
        store.set(selectedWorkflowPathAtom, value)
      },
      (next) => {
        const value = typeof next === "function" ? next(store.get(currentWorkflowAtom)) : next
        store.set(currentWorkflowAtom, value)
      },
      (next) => {
        const value = typeof next === "function" ? next(store.get(workflowSavedSnapshotAtom)) : next
        store.set(workflowSavedSnapshotAtom, value)
      },
      clearDraftExecutionState,
    )

    const emptyWorkflow = createEmptyWorkflow()
    expect(store.get(selectedWorkflowPathAtom)).toBeNull()
    expect(store.get(currentWorkflowAtom)).toEqual(emptyWorkflow)
    expect(store.get(workflowSavedSnapshotAtom)).toBe(workflowSnapshot(emptyWorkflow))
    expect(clearDraftExecutionState).toHaveBeenCalledTimes(1)
  })
})
