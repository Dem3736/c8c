import { describe, expect, it, vi } from "vitest"
import type { ActiveWorkflowRun, RunResult, Workflow } from "@shared/types"
import { createWorkflowExecutionController } from "./controller"

function createWorkflow(): Workflow {
  return {
    version: 1,
    name: "Research flow",
    nodes: [
      {
        id: "input",
        type: "input",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "output",
        type: "output",
        position: { x: 120, y: 0 },
        config: {},
      },
    ],
    edges: [
      {
        id: "edge-1",
        source: "input",
        target: "output",
        type: "default",
      },
    ],
  }
}

function createRunResult(): RunResult {
  return {
    runId: "past-run",
    status: "completed",
    workflowName: "Research flow",
    startedAt: 10,
    completedAt: 20,
    reportPath: "/tmp/report.md",
    workspace: "/tmp/workspace",
  }
}

function createHarness() {
  let approvalRequests: Array<{
    runId: string
    nodeId: string
    content: string
    message?: string
    allowEdit: boolean
  }> = []
  let pastRuns: RunResult[] = []

  const deps = {
    commitExecutionState: vi.fn(),
    updateApprovalRequests: vi.fn((update) => {
      approvalRequests = typeof update === "function" ? update(approvalRequests) : update
    }),
    setPastRuns: vi.fn((runs: RunResult[]) => {
      pastRuns = runs
    }),
    listRuns: vi.fn().mockResolvedValue([createRunResult()]),
    onRunFailed: vi.fn(),
    onError: vi.fn(),
  }

  const controller = createWorkflowExecutionController(deps)
  controller.sync({ workflowExecutionStates: {}, selectedProject: "/tmp/project" })

  return {
    controller,
    deps,
    getApprovalRequests: () => approvalRequests,
    getPastRuns: () => pastRuns,
  }
}

describe("WorkflowExecutionController", () => {
  it("buffers workflow events until the started run id is attached", () => {
    const { controller } = createHarness()
    const workflowKey = controller.beginExecution(createWorkflow(), "/tmp/research.chain", "/tmp/project")

    controller.processWorkflowEvent({
      type: "node-start",
      runId: "run-1",
      nodeId: "input",
    })

    expect(controller.getExecutionState(workflowKey).runStatus).toBe("starting")

    controller.finishStartWithRunId("run-1", workflowKey)

    expect(controller.getExecutionState(workflowKey).runId).toBe("run-1")
    expect(controller.getExecutionState(workflowKey).runStatus).toBe("running")
    expect(controller.getExecutionState(workflowKey).activeNodeId).toBe("input")
    expect(controller.getExecutionState(workflowKey).nodeStates.input.status).toBe("running")
  })

  it("clears approvals and refreshes history when a run completes", async () => {
    const { controller, deps, getApprovalRequests, getPastRuns } = createHarness()
    const workflowKey = controller.beginExecution(createWorkflow(), "/tmp/research.chain", "/tmp/project")
    controller.finishStartWithRunId("run-1", workflowKey)

    controller.processWorkflowEvent({
      type: "approval-requested",
      runId: "run-1",
      nodeId: "input",
      content: "Need approval",
      message: "Review this output",
      allowEdit: true,
    })

    expect(getApprovalRequests()).toHaveLength(1)

    controller.processWorkflowEvent({
      type: "run-done",
      runId: "run-1",
      status: "completed",
      reportPath: "/tmp/final-report.md",
      workspace: "/tmp/final-workspace",
    })

    await Promise.resolve()

    expect(getApprovalRequests()).toEqual([])
    expect(deps.listRuns).toHaveBeenCalledWith("/tmp/project")
    expect(getPastRuns()).toEqual([createRunResult()])
    expect(controller.getExecutionState(workflowKey).runStatus).toBe("done")
    expect(controller.getExecutionState(workflowKey).runOutcome).toBe("completed")
    expect(controller.getExecutionState(workflowKey).reportPath).toBe("/tmp/final-report.md")
    expect(controller.getExecutionState(workflowKey).workspace).toBe("/tmp/final-workspace")
  })

  it("rehydrates an active run snapshot for renderer resync", () => {
    const { controller } = createHarness()
    const snapshot: ActiveWorkflowRun = {
      kind: "run",
      runId: "run-active",
      workflowName: "Research flow",
      workflowPath: "/tmp/research.chain",
      projectPath: "/tmp/project",
      workspace: "/tmp/workspace",
      status: "running",
      startedAt: 100,
      updatedAt: 120,
      nodeStates: {
        input: { status: "completed", attempts: 1, log: [] },
        output: { status: "running", attempts: 1, log: [] },
      },
      runtimeNodes: createWorkflow().nodes,
      runtimeEdges: createWorkflow().edges,
      runtimeMeta: {},
    }

    controller.rehydrateActiveRun(snapshot)

    const state = controller.getExecutionState("/tmp/research.chain")
    expect(state.runId).toBe("run-active")
    expect(state.runStatus).toBe("running")
    expect(state.workspace).toBe("/tmp/workspace")
    expect(state.activeNodeId).toBe("output")
    expect(state.nodeStates.output.status).toBe("running")
  })
})
