import { BrowserWindow } from "electron"
import {
  createWorkflowRunner,
  type WebSearchBackend,
  type WorkflowRunHandle,
  type WorkflowRunSnapshot,
  type WorkflowRunSummary,
} from "@c8c/workflow-runner"
import type { Workflow, WorkflowInput } from "@shared/types"
import { sendWorkflowEvent } from "../workflow-notifications"
import { prepareWorkspaceMcpConfig } from "./mcp-config"
import { resolveNodeProviderId, resolveWorkflowProviderId, startProviderTask } from "./provider-runtime"
import { scanAllSkills } from "./skill-scanner"
import { logInfo, logWarn } from "./structured-log"

const workflowRunner = createWorkflowRunner({
  startProviderTask,
  resolveWorkflowProviderId,
  resolveNodeProviderId,
  prepareWorkspaceMcpConfig,
  scanSkills: scanAllSkills,
  logger: {
    info: logInfo,
    warn: logWarn,
  },
})

const activeHandles = new Map<string, WorkflowRunHandle>()
const pausedRunIds = new Set<string>()

function streamEventsToWindow(window: BrowserWindow, handle: WorkflowRunHandle): void {
  void (async () => {
    for await (const event of handle.events) {
      if (window.isDestroyed()) {
        handle.cancel("window destroyed")
        break
      }

      try {
        sendWorkflowEvent(window, event)
      } catch (error) {
        logWarn("workflow-runner-adapter", "send_workflow_event_failed", {
          runId: handle.runId,
          eventType: event.type,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  })()
}

async function attachWindowAndWait(
  window: BrowserWindow,
  handle: WorkflowRunHandle,
): Promise<WorkflowRunSummary> {
  activeHandles.set(handle.runId, handle)
  streamEventsToWindow(window, handle)
  try {
    return await handle.result
  } finally {
    pausedRunIds.delete(handle.runId)
    activeHandles.delete(handle.runId)
  }
}

export function pauseWorkflowRun(runId: string): boolean {
  const paused = activeHandles.get(runId)?.pause() ?? false
  if (paused) pausedRunIds.add(runId)
  return paused
}

export function resumeWorkflowRun(runId: string): boolean {
  const resumed = activeHandles.get(runId)?.resume() ?? false
  if (resumed) pausedRunIds.delete(runId)
  return resumed
}

export async function resolveApproval(
  runId: string,
  nodeId: string,
  approved: boolean,
  editedContent?: string,
): Promise<boolean> {
  return workflowRunner.resolveApproval({
    runId,
    nodeId,
    approved,
    editedContent,
  })
}

export function cancelWorkflowRun(runId: string): boolean {
  const handle = activeHandles.get(runId)
  if (!handle) return false
  pausedRunIds.delete(runId)
  handle.cancel("cancelled by desktop adapter")
  return true
}

export async function getWorkflowRunSnapshot(runId: string): Promise<(WorkflowRunSnapshot & { paused: boolean }) | null> {
  const snapshot = await workflowRunner.getSnapshot(runId)
  if (!snapshot) return null
  return {
    ...snapshot,
    paused: pausedRunIds.has(runId),
  }
}

export async function runWorkflow(
  runId: string,
  workflow: Workflow,
  input: WorkflowInput,
  window: BrowserWindow,
  projectPath?: string,
  workflowPath?: string,
  webSearchBackend?: WebSearchBackend,
): Promise<WorkflowRunSummary> {
  const handle = await workflowRunner.startRun({
    runId,
    workflow,
    input,
    projectPath,
    workflowPath,
    webSearchBackend,
  })
  return attachWindowAndWait(window, handle)
}

export async function rerunFromNode(
  runId: string,
  fromNodeId: string,
  workflow: Workflow,
  workspace: string,
  window: BrowserWindow,
  projectPath?: string,
  workflowPath?: string,
  webSearchBackend?: WebSearchBackend,
): Promise<void> {
  const handle = await workflowRunner.rerunFromNode({
    runId,
    fromNodeId,
    workflow,
    workspace,
    projectPath,
    workflowPath,
    webSearchBackend,
  })
  await attachWindowAndWait(window, handle)
}

export async function continueRunFromWorkspace(
  runId: string,
  workflow: Workflow,
  workspace: string,
  window: BrowserWindow,
  projectPath?: string,
  workflowPath?: string,
  webSearchBackend?: WebSearchBackend,
): Promise<void> {
  const handle = await workflowRunner.resumeRun({
    runId,
    workflow,
    workspace,
    projectPath,
    workflowPath,
    webSearchBackend,
  })
  await attachWindowAndWait(window, handle)
}

export type { WorkflowRunSummary }
