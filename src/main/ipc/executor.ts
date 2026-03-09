import { ipcMain, BrowserWindow, shell, type IpcMainInvokeEvent } from "electron"
import { runWorkflow, rerunFromNode, cancelWorkflowRun, resolveApproval } from "../lib/workflow-runner"
import { validateWorkflow } from "../lib/graph-engine"
import { runBatch, cancelBatch } from "../lib/batch-runner"
import { readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { Workflow, WorkflowInput, RunResult } from "@shared/types"
import { allowedReportRoots, assertWithinRoots } from "../lib/security-paths"

let runCounter = 0
let batchCounter = 0
const activeWindowRuns = new Map<number, string>()

function resolveWindowFromEvent(event: IpcMainInvokeEvent): BrowserWindow | null {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || window.isDestroyed()) return null
  return window
}

async function assertRunWorkspacePath(workspace: string): Promise<string> {
  const reportRoots = await allowedReportRoots()
  return assertWithinRoots(resolve(workspace), reportRoots, "Run workspace")
}

async function assertReportPath(reportPath: string): Promise<string> {
  const reportRoots = await allowedReportRoots()
  return assertWithinRoots(resolve(reportPath), reportRoots, "Report path")
}

export function registerExecutorHandlers() {
  ipcMain.handle(
    "executor:run",
    async (
      event,
      workflow: Workflow,
      input: WorkflowInput,
      projectPath?: string,
      workflowPath?: string,
      webSearchBackend?: "builtin" | "exa",
    ) => {
      const window = resolveWindowFromEvent(event)
      if (!window) return null

      if (activeWindowRuns.has(window.id)) {
        return { error: "A workflow is already running" }
      }

      let errors: string[]
      try {
        errors = validateWorkflow(workflow)
      } catch (err) {
        return { error: `Validation failed: ${String(err)}` }
      }
      if (errors.length > 0) {
        return { error: errors.join("; ") }
      }

      const runId = `run-${++runCounter}-${Date.now()}`

      activeWindowRuns.set(window.id, runId)

      // Fire and forget — events stream back via IPC
      runWorkflow(runId, workflow, input, window, projectPath, workflowPath, webSearchBackend).catch((err) => {
        try {
          if (!window.isDestroyed()) {
            window.webContents.send("workflow:event", {
              runId,
              type: "node-error",
              nodeId: "__global",
              error: String(err),
            })
            window.webContents.send("workflow:event", {
              runId,
              type: "run-done",
              status: "failed",
            })
          }
        } catch { /* window destroyed between check and send */ }
      }).finally(() => activeWindowRuns.delete(window.id))

      return runId
    },
  )

  ipcMain.handle("executor:cancel", async (_e, runId: string) => {
    return cancelWorkflowRun(runId)
  })

  ipcMain.handle(
    "executor:rerun-from",
    async (
      event,
      fromNodeId: string,
      workflow: Workflow,
      workspace: string,
      projectPath?: string,
      workflowPath?: string,
      webSearchBackend?: "builtin" | "exa",
    ) => {
      const window = resolveWindowFromEvent(event)
      if (!window) return null
      if (activeWindowRuns.has(window.id)) return null

      const runId = `rerun-${++runCounter}-${Date.now()}`
      const safeWorkspace = await assertRunWorkspacePath(workspace)
      activeWindowRuns.set(window.id, runId)

      rerunFromNode(
        runId,
        fromNodeId,
        workflow,
        safeWorkspace,
        window,
        projectPath,
        workflowPath,
        webSearchBackend,
      ).catch((err) => {
        try {
          if (!window.isDestroyed()) {
            window.webContents.send("workflow:event", {
              runId,
              type: "node-error",
              nodeId: "__global",
              error: String(err),
            })
            window.webContents.send("workflow:event", {
              runId,
              type: "run-done",
              status: "failed",
            })
          }
        } catch { /* window destroyed between check and send */ }
      }).finally(() => activeWindowRuns.delete(window.id))

      return runId
    },
  )

  ipcMain.handle("executor:list-runs", async (_e, projectPath: string): Promise<RunResult[]> => {
    const runsDir = join(projectPath, ".c8c", "runs")
    try {
      const entries = await readdir(runsDir, { withFileTypes: true })
      const results: RunResult[] = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        try {
          const resultPath = join(runsDir, entry.name, "run-result.json")
          const raw = await readFile(resultPath, "utf-8")
          const result: RunResult = JSON.parse(raw)
          // If status is still "running" on disk, the run was interrupted
          if (result.status === "running") {
            result.status = "interrupted"
          }
          results.push(result)
        } catch { /* skip dirs without run-result.json */ }
      }
      return results.sort((a, b) => (b.completedAt || b.startedAt) - (a.completedAt || a.startedAt))
    } catch {
      return []
    }
  })

  ipcMain.handle("executor:load-run-result", async (_e, workspace: string) => {
    try {
      const safeWorkspace = await assertRunWorkspacePath(workspace)
      const metaRaw = await readFile(join(safeWorkspace, "run-result.json"), "utf-8")
      const meta: RunResult = JSON.parse(metaRaw)
      let reportContent = ""
      if (meta.reportPath) {
        try {
          const safeReportPath = await assertReportPath(meta.reportPath)
          reportContent = await readFile(safeReportPath, "utf-8")
        } catch { /* report file missing */ }
      }
      return { ...meta, reportContent }
    } catch {
      return null
    }
  })

  ipcMain.handle("executor:open-report", async (_e, reportPath: string) => {
    const safeReportPath = await assertReportPath(reportPath)
    return shell.openPath(safeReportPath)
  })

  ipcMain.handle(
    "executor:run-batch",
    async (
      event,
      workflow: Workflow,
      inputs: WorkflowInput[],
      concurrency: number,
      stopOnFailure: boolean,
      projectPath?: string,
      workflowPath?: string,
    ) => {
      const window = resolveWindowFromEvent(event)
      if (!window) return null
      if (activeWindowRuns.has(window.id)) return null

      const batchId = `batch-${++batchCounter}-${Date.now()}`
      activeWindowRuns.set(window.id, `batch:${batchId}`)

      queueMicrotask(() => {
        runBatch(batchId, workflow, inputs, concurrency, stopOnFailure, window, projectPath, workflowPath).catch((err) => {
          if (!window.isDestroyed()) {
            window.webContents.send("batch:event", {
              type: "batch-error",
              batchId,
              error: String(err),
            })
          }
        }).finally(() => activeWindowRuns.delete(window.id))
      })

      return batchId
    },
  )

  ipcMain.handle("executor:cancel-batch", async (_e, batchId: string) => {
    return cancelBatch(batchId)
  })

  ipcMain.handle(
    "executor:approve",
    async (_e, runId: string, nodeId: string, editedContent?: string) => {
      return resolveApproval(runId, nodeId, true, editedContent)
    },
  )

  ipcMain.handle(
    "executor:reject",
    async (_e, runId: string, nodeId: string) => {
      return resolveApproval(runId, nodeId, false)
    },
  )
}
