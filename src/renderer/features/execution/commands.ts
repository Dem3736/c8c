import { resolveWorkflowInput } from "@/lib/input-type"
import { applyWebSearchBackendPreset, type WebSearchBackend } from "@/lib/web-search-backend"
import type { InputNodeConfig, PermissionMode, RunResult, Workflow } from "@shared/types"

export type ExecutionStartResult = string | { error: string } | null | undefined

export interface ResolvedExecutionStart {
  startedRunId: string | null
  errorMessage: string | null
}

export interface ResolvedContinuationWorkflow {
  workflowForRun: Workflow
  workflowPathForRun: string | null
}

function isResearchLikeWorkflow(workflow: {
  name: string
  description?: string
  nodes: Array<{ type: string; config: Record<string, unknown> }>
}): boolean {
  const header = `${workflow.name} ${workflow.description || ""}`.toLowerCase()
  if (header.includes("research")) return true
  return workflow.nodes.some((node) => {
    if (node.type !== "skill") return false
    const skillRef = typeof node.config.skillRef === "string" ? node.config.skillRef.toLowerCase() : ""
    const prompt = typeof node.config.prompt === "string" ? node.config.prompt.toLowerCase() : ""
    return skillRef.includes("research") || prompt.includes("research")
  })
}

function withExecutionMode(workflow: Workflow, executionMode: PermissionMode): Workflow {
  return {
    ...workflow,
    defaults: {
      ...workflow.defaults,
      permissionMode: executionMode,
    },
  }
}

export function resolveExecutionInput(workflow: Workflow, inputValue: string) {
  const inputNode = workflow.nodes.find((node) => node.type === "input")
  const inputConfig = (inputNode?.config || {}) as InputNodeConfig
  return resolveWorkflowInput(inputValue, {
    inputType: inputConfig.inputType,
    required: inputConfig.required,
    defaultValue: inputConfig.defaultValue,
  })
}

export function prepareWorkflowForExecution(
  workflow: Workflow,
  webSearchBackend: WebSearchBackend,
  executionMode?: PermissionMode,
) {
  const workflowForRun = executionMode
    ? withExecutionMode(workflow, executionMode)
    : workflow
  const looksResearch = isResearchLikeWorkflow(workflowForRun as unknown as {
    name: string
    description?: string
    nodes: Array<{ type: string; config: Record<string, unknown> }>
  })

  return {
    workflowForRun,
    workflowForExecution: applyWebSearchBackendPreset(
      workflowForRun,
      looksResearch ? "research" : "operations",
      webSearchBackend,
    ),
  }
}

export function resolveExecutionStartResult(
  result: ExecutionStartResult,
  unavailableMessage: string,
): ResolvedExecutionStart {
  if (typeof result === "string") {
    return {
      startedRunId: result,
      errorMessage: null,
    }
  }

  if (result && typeof result === "object" && "error" in result) {
    return {
      startedRunId: null,
      errorMessage: result.error,
    }
  }

  return {
    startedRunId: null,
    errorMessage: unavailableMessage,
  }
}

export async function resolveContinuationWorkflow(
  runToContinue: RunResult,
  workflow: Workflow,
  selectedWorkflowPath: string | null,
  loadWorkflow: (path: string) => Promise<Workflow>,
  onWorkflowLoaded: (workflow: Workflow, workflowPath: string) => void,
): Promise<ResolvedContinuationWorkflow> {
  if (!runToContinue.workflowPath) {
    return {
      workflowForRun: workflow,
      workflowPathForRun: selectedWorkflowPath ?? null,
    }
  }

  const workflowForRun = await loadWorkflow(runToContinue.workflowPath)
  onWorkflowLoaded(workflowForRun, runToContinue.workflowPath)

  return {
    workflowForRun,
    workflowPathForRun: runToContinue.workflowPath,
  }
}
