import { ipcMain, BrowserWindow, shell, type IpcMainInvokeEvent } from "electron"
import {
  runWorkflow,
  rerunFromNode,
  cancelWorkflowRun,
  pauseWorkflowRun,
  resumeWorkflowRun,
  resolveApproval,
  continueRunFromWorkspace,
} from "../lib/workflow-runner"
import { validateWorkflow } from "../lib/graph-engine"
import { runBatch, cancelBatch } from "../lib/batch-runner"
import { scaffoldMissingSkills } from "../lib/skill-scaffold"
import { scanAllSkills } from "../lib/skill-scanner"
import { trackTelemetryEvent } from "../lib/telemetry/service"
import { summarizeMissingWorkflowSkillRefs } from "../lib/telemetry/workflow-usage"
import { readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { Workflow, WorkflowInput, RunResult } from "@shared/types"
import { allowedProjectRoots, allowedReportRoots, assertWithinRoots } from "../lib/security-paths"
import { logError, logInfo, logWarn } from "../lib/structured-log"
import {
  getProviderReadiness,
  providerReadinessError,
  resolveWorkflowProviderId,
} from "../lib/provider-runtime"
import { sendWorkflowEvent } from "../workflow-notifications"

let runCounter = 0
let batchCounter = 0
const activeWindowExecutions = new Map<number, Set<string>>()
const windowLifecycleBindings = new Set<number>()

function trackWindowExecution(windowId: number, executionId: string): void {
  const executions = activeWindowExecutions.get(windowId) ?? new Set<string>()
  executions.add(executionId)
  activeWindowExecutions.set(windowId, executions)
}

function releaseWindowExecution(windowId: number, executionId: string): void {
  const executions = activeWindowExecutions.get(windowId)
  if (!executions) return
  executions.delete(executionId)
  if (executions.size === 0) {
    activeWindowExecutions.delete(windowId)
  }
}

function cancelActiveWindowExecution(windowId: number): void {
  const executions = activeWindowExecutions.get(windowId)
  if (!executions || executions.size === 0) return
  activeWindowExecutions.delete(windowId)

  for (const executionId of executions) {
    if (executionId.startsWith("batch:")) {
      const batchId = executionId.slice("batch:".length)
      const cancelled = cancelBatch(batchId)
      logInfo("executor-ipc", "window_closed_cancel_batch", { windowId, batchId, cancelled })
      continue
    }

    const cancelled = cancelWorkflowRun(executionId)
    logInfo("executor-ipc", "window_closed_cancel_run", { windowId, runId: executionId, cancelled })
  }
}

function bindWindowLifecycle(window: BrowserWindow): void {
  if (windowLifecycleBindings.has(window.id)) return
  windowLifecycleBindings.add(window.id)
  window.once("closed", () => {
    windowLifecycleBindings.delete(window.id)
    cancelActiveWindowExecution(window.id)
  })
}

function resolveWindowFromEvent(event: IpcMainInvokeEvent): BrowserWindow | null {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || window.isDestroyed()) return null
  bindWindowLifecycle(window)
  return window
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === "string") return code
  }
  return undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function assertProjectPath(projectPath: string): Promise<string> {
  const projectRoots = await allowedProjectRoots()
  return assertWithinRoots(resolve(projectPath), projectRoots, "Project path")
}

async function assertRunWorkspacePath(workspace: string): Promise<string> {
  const reportRoots = await allowedReportRoots()
  return assertWithinRoots(resolve(workspace), reportRoots, "Run workspace")
}

async function assertReportPath(reportPath: string): Promise<string> {
  const reportRoots = await allowedReportRoots()
  return assertWithinRoots(resolve(reportPath), reportRoots, "Report path")
}

async function scaffoldWorkflowWithTelemetry(
  workflow: Workflow,
  projectPath: string,
  source: "executor_run" | "executor_rerun" | "executor_batch",
): Promise<Workflow> {
  const startedAt = Date.now()
  const availableSkills = await scanAllSkills(projectPath)
  const availableRefs = availableSkills.map((skill) => ({
    name: skill.name,
    category: skill.category,
  }))
  const before = summarizeMissingWorkflowSkillRefs(workflow, availableRefs)

  try {
    const scaffoldedWorkflow = await scaffoldMissingSkills(workflow, availableRefs, projectPath)
    const after = summarizeMissingWorkflowSkillRefs(scaffoldedWorkflow, availableRefs)
    void trackTelemetryEvent("skill_scaffold_completed", {
      source,
      status: "success",
      duration_ms: Date.now() - startedAt,
      skill_nodes_total: before.skillNodesTotal,
      available_skills_total: before.availableSkillsTotal,
      missing_refs_total: before.missingRefsTotal,
      missing_refs_unique: before.missingRefsUnique,
      missing_refs: before.missingRefsList,
      remaining_missing_refs_total: after.missingRefsTotal,
    })
    return scaffoldedWorkflow
  } catch (error) {
    void trackTelemetryEvent("skill_scaffold_completed", {
      source,
      status: "failed",
      duration_ms: Date.now() - startedAt,
      skill_nodes_total: before.skillNodesTotal,
      available_skills_total: before.availableSkillsTotal,
      missing_refs_total: before.missingRefsTotal,
      missing_refs_unique: before.missingRefsUnique,
      missing_refs: before.missingRefsList,
      error_kind: "scaffold_failed",
    })
    throw error
  }
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

      try {
        const providerId = await resolveWorkflowProviderId(workflow)
        const readiness = await getProviderReadiness(providerId)
        const providerError = providerReadinessError(readiness)
        if (providerError) return { error: providerError }
      } catch (err) {
        logWarn("executor-ipc", "cli_precheck_failed", { error: errorMessage(err) })
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

      // Auto-scaffold missing skills before run
      if (projectPath) {
        try {
          workflow = await scaffoldWorkflowWithTelemetry(workflow, projectPath, "executor_run")
        } catch (err) {
          return { error: `Skill scaffolding failed: ${String(err)}` }
        }
      }

      if (window.isDestroyed()) {
        logWarn("executor-ipc", "run_start_aborted_window_closed", { windowId: window.id })
        return { error: "Window was closed before run start" }
      }

      const runId = `run-${++runCounter}-${Date.now()}`
      trackWindowExecution(window.id, runId)
      logInfo("executor-ipc", "run_started", { runId, windowId: window.id })

      // Fire and forget — events stream back via IPC
      runWorkflow(runId, workflow, input, window, projectPath, workflowPath, webSearchBackend).catch((err) => {
        try {
          if (!window.isDestroyed()) {
            sendWorkflowEvent(window, {
              runId,
              type: "node-error",
              nodeId: "__global",
              error: String(err),
            })
            sendWorkflowEvent(window, {
              runId,
              type: "run-done",
              status: "failed",
            })
          }
        } catch { /* window destroyed between check and send */ }
      }).finally(() => releaseWindowExecution(window.id, runId))

      return runId
    },
  )

  ipcMain.handle("executor:cancel", async (_e, runId: string) => {
    return cancelWorkflowRun(runId)
  })

  ipcMain.handle("run:pause", async (_e, runId: string) => {
    return pauseWorkflowRun(runId)
  })

  ipcMain.handle("run:resume", async (_e, runId: string) => {
    return resumeWorkflowRun(runId)
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

      const valErrors = validateWorkflow(workflow)
      if (valErrors.length > 0) {
        return { error: valErrors.join("; ") }
      }

      try {
        const providerId = await resolveWorkflowProviderId(workflow)
        const readiness = await getProviderReadiness(providerId)
        const providerError = providerReadinessError(readiness)
        if (providerError) return { error: providerError }
      } catch (err) {
        logWarn("executor-ipc", "rerun_precheck_failed", { error: errorMessage(err) })
      }

      const runId = `rerun-${++runCounter}-${Date.now()}`
      const safeWorkspace = await assertRunWorkspacePath(workspace)

      // Auto-scaffold missing skills before rerun
      if (projectPath) {
        try {
          workflow = await scaffoldWorkflowWithTelemetry(workflow, projectPath, "executor_rerun")
        } catch (err) {
          return { error: `Skill scaffolding failed: ${String(err)}` }
        }
      }

      if (window.isDestroyed()) {
        logWarn("executor-ipc", "rerun_start_aborted_window_closed", { windowId: window.id, workspace: safeWorkspace })
        return { error: "Window was closed before rerun start" }
      }

      trackWindowExecution(window.id, runId)
      logInfo("executor-ipc", "rerun_started", { runId, fromNodeId, windowId: window.id })

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
            sendWorkflowEvent(window, {
              runId,
              type: "node-error",
              nodeId: "__global",
              error: String(err),
            })
            sendWorkflowEvent(window, {
              runId,
              type: "run-done",
              status: "failed",
            })
          }
        } catch { /* window destroyed between check and send */ }
      }).finally(() => releaseWindowExecution(window.id, runId))

      return runId
    },
  )

  ipcMain.handle(
    "executor:continue",
    async (
      event,
      workflow: Workflow,
      workspace: string,
      projectPath?: string,
      workflowPath?: string,
      webSearchBackend?: "builtin" | "exa",
    ) => {
      const window = resolveWindowFromEvent(event)
      if (!window) return null

      const valErrors = validateWorkflow(workflow)
      if (valErrors.length > 0) {
        return { error: valErrors.join("; ") }
      }

      try {
        const providerId = await resolveWorkflowProviderId(workflow)
        const readiness = await getProviderReadiness(providerId)
        const providerError = providerReadinessError(readiness)
        if (providerError) return { error: providerError }
      } catch (err) {
        logWarn("executor-ipc", "continue_precheck_failed", { error: errorMessage(err) })
      }

      const runId = `resume-${++runCounter}-${Date.now()}`
      const safeWorkspace = await assertRunWorkspacePath(workspace)

      // Auto-scaffold missing skills before continue.
      if (projectPath) {
        try {
          workflow = await scaffoldWorkflowWithTelemetry(workflow, projectPath, "executor_rerun")
        } catch (err) {
          return { error: `Skill scaffolding failed: ${String(err)}` }
        }
      }

      if (window.isDestroyed()) {
        logWarn("executor-ipc", "continue_start_aborted_window_closed", { windowId: window.id, workspace: safeWorkspace })
        return { error: "Window was closed before continue start" }
      }

      trackWindowExecution(window.id, runId)
      logInfo("executor-ipc", "continue_started", { runId, windowId: window.id, workspace: safeWorkspace })

      continueRunFromWorkspace(
        runId,
        workflow,
        safeWorkspace,
        window,
        projectPath,
        workflowPath,
        webSearchBackend,
      ).catch((err) => {
        try {
          if (!window.isDestroyed()) {
            sendWorkflowEvent(window, {
              runId,
              type: "node-error",
              nodeId: "__global",
              error: String(err),
            })
            sendWorkflowEvent(window, {
              runId,
              type: "run-done",
              status: "failed",
            })
          }
        } catch { /* window destroyed between check and send */ }
      }).finally(() => releaseWindowExecution(window.id, runId))

      return runId
    },
  )

  ipcMain.handle("executor:list-runs", async (_e, projectPath: string): Promise<RunResult[]> => {
    const safeProjectPath = await assertProjectPath(projectPath)
    const runsDir = join(safeProjectPath, ".c8c", "runs")
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
        } catch (error) {
          if (errorCode(error) !== "ENOENT") {
            logWarn("executor-ipc", "list_runs_entry_failed", {
              projectPath: safeProjectPath,
              runDirectory: entry.name,
              error: errorMessage(error),
            })
          }
        }
      }
      return results.sort((a, b) => (b.completedAt || b.startedAt) - (a.completedAt || a.startedAt))
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        logWarn("executor-ipc", "list_runs_failed", {
          projectPath: safeProjectPath,
          runsDir,
          error: errorMessage(error),
        })
      }
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
        } catch (error) {
          if (errorCode(error) !== "ENOENT") {
            logWarn("executor-ipc", "load_run_result_report_failed", {
              workspace: safeWorkspace,
              reportPath: meta.reportPath,
              error: errorMessage(error),
            })
          }
        }
      }
      return { ...meta, reportContent }
    } catch (error) {
      logWarn("executor-ipc", "load_run_result_failed", {
        workspace,
        error: errorMessage(error),
      })
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

      const valErrors = validateWorkflow(workflow)
      if (valErrors.length > 0) {
        return { error: valErrors.join("; ") }
      }

      // Auto-scaffold missing skills before batch run
      if (projectPath) {
        try {
          workflow = await scaffoldWorkflowWithTelemetry(workflow, projectPath, "executor_batch")
        } catch (err) {
          return { error: `Skill scaffolding failed: ${String(err)}` }
        }
      }

      if (window.isDestroyed()) {
        logWarn("executor-ipc", "batch_start_aborted_window_closed", { windowId: window.id })
        return { error: "Window was closed before batch start" }
      }

      const batchId = `batch-${++batchCounter}-${Date.now()}`
      const executionId = `batch:${batchId}`
      trackWindowExecution(window.id, executionId)
      logInfo("executor-ipc", "batch_started", { batchId, windowId: window.id, inputs: inputs.length, concurrency, stopOnFailure })

      runBatch(batchId, workflow, inputs, concurrency, stopOnFailure, window, projectPath, workflowPath)
        .catch((err) => {
          const errorMessage = String(err)
          logError("executor-ipc", "batch_unhandled_failure", { batchId, error: errorMessage })
          try {
            if (!window.isDestroyed()) {
              window.webContents.send("batch:event", {
                type: "batch-error",
                batchId,
                error: errorMessage,
              })
            }
          } catch { /* window destroyed between check and send */ }
        })
        .finally(() => releaseWindowExecution(window.id, executionId))

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
