import { describe, expect, it, vi } from "vitest"
import type { RunResult, Workflow } from "@shared/types"
import {
  assembleInputWithAttachments,
  createCancelledExecutionState,
  createEmptyWorkflowExecutionState,
  createExecutionStartState,
  reduceWorkflowExecutionEvent,
} from "./workflow-execution"

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
        position: { x: 100, y: 0 },
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

function createPastRun(): RunResult {
  return {
    runId: "past-run",
    status: "completed",
    workflowName: "Previous flow",
    startedAt: 10,
    completedAt: 20,
    reportPath: "/tmp/report.md",
    workspace: "/tmp/workspace",
  }
}

describe("workflow execution state", () => {
  it("creates a fresh starting state while preserving persistent selections", () => {
    const workflow = createWorkflow()
    const previousState = {
      ...createEmptyWorkflowExecutionState(),
      workspace: "/tmp/existing-workspace",
      selectedPastRun: createPastRun(),
    }

    const nextState = createExecutionStartState(
      previousState,
      workflow,
      "/tmp/research.chain",
      "/tmp/project",
      123,
    )

    expect(nextState.runStatus).toBe("starting")
    expect(nextState.runStartedAt).toBe(123)
    expect(nextState.workflowName).toBe("Research flow")
    expect(nextState.runWorkflowPath).toBe("/tmp/research.chain")
    expect(nextState.projectPath).toBe("/tmp/project")
    expect(nextState.workspace).toBe("/tmp/existing-workspace")
    expect(nextState.selectedPastRun).toEqual(previousState.selectedPastRun)
    expect(nextState.nodeStates).toEqual({
      input: { status: "pending", attempts: 0, log: [] },
      output: { status: "pending", attempts: 0, log: [] },
    })
    expect(nextState.workflowSnapshot).toEqual(workflow)
    expect(nextState.workflowSnapshot).not.toBe(workflow)
  })

  it("writes output node content into finalContent", () => {
    const workflow = createWorkflow()
    const previousState = createExecutionStartState(
      createEmptyWorkflowExecutionState(),
      workflow,
      "/tmp/research.chain",
      "/tmp/project",
      123,
    )

    const transition = reduceWorkflowExecutionEvent(
      previousState,
      {
        type: "node-done",
        runId: "run-1",
        nodeId: "output",
        output: {
          content: "Final answer",
          metadata: { source: "node-output" },
        },
      },
      workflow,
    )

    expect(transition.nextState.finalContent).toBe("Final answer")
    expect(transition.nextState.nodeStates.output.status).toBe("completed")
    expect(transition.effects).toEqual({})
  })

  it("updates runtime graph state and adds pending states for new nodes", () => {
    const workflow = createWorkflow()
    const previousState = {
      ...createExecutionStartState(
        createEmptyWorkflowExecutionState(),
        workflow,
        "/tmp/research.chain",
        "/tmp/project",
        123,
      ),
      nodeStates: {
        input: { status: "completed" as const, attempts: 1, log: [] },
        stale: { status: "failed" as const, attempts: 1, log: [], error: "old" },
      },
    }

    const transition = reduceWorkflowExecutionEvent(previousState, {
      type: "nodes-expanded",
      runId: "run-1",
      newNodeIds: ["branch-1"],
      runtimeMeta: {
        "branch-1": {
          subtaskKey: "a",
          branchIndex: 0,
          totalBranches: 1,
          templateId: "template",
        },
      },
      nodes: [
        workflow.nodes[0],
        {
          id: "branch-1",
          type: "skill",
          position: { x: 50, y: 50 },
          config: {
            skillRef: "researcher",
            prompt: "Investigate",
          },
        },
      ],
      edges: [
        {
          id: "edge-branch",
          source: "input",
          target: "branch-1",
          type: "default",
        },
      ],
    })

    expect(Object.keys(transition.nextState.nodeStates)).toEqual(["input", "branch-1"])
    expect(transition.nextState.nodeStates["branch-1"]).toEqual({
      status: "pending",
      attempts: 0,
      log: [],
    })
    expect(transition.nextState.runtimeNodes).toHaveLength(2)
    expect(transition.nextState.runtimeEdges).toHaveLength(1)
    expect(transition.nextState.runtimeMeta["branch-1"]?.templateId).toBe("template")
  })

  it("produces approval side effects separately from state", () => {
    const workflow = createWorkflow()
    const previousState = createExecutionStartState(
      createEmptyWorkflowExecutionState(),
      workflow,
      "/tmp/research.chain",
      "/tmp/project",
      123,
    )

    const transition = reduceWorkflowExecutionEvent(previousState, {
      type: "approval-requested",
      runId: "run-1",
      nodeId: "input",
      content: "Need approval",
      message: "Review this",
      allowEdit: true,
    })

    expect(transition.nextState.nodeStates.input.status).toBe("waiting_approval")
    expect(transition.effects.approvalRequest).toEqual({
      runId: "run-1",
      nodeId: "input",
      content: "Need approval",
      message: "Review this",
      allowEdit: true,
    })
  })

  it("tracks human-task lifecycle events in node state", () => {
    const workflow = createWorkflow()
    const previousState = createExecutionStartState(
      createEmptyWorkflowExecutionState(),
      workflow,
      "/tmp/research.chain",
      "/tmp/project",
      123,
    )

    const created = reduceWorkflowExecutionEvent(previousState, {
      type: "human-task-created",
      runId: "run-1",
      nodeId: "input",
      taskId: "human-input",
      title: "Review draft",
    })

    expect(created.nextState.nodeStates.input.status).toBe("waiting_human")
    expect(created.nextState.nodeStates.input.humanTask).toEqual({
      taskId: "human-input",
      status: "open",
    })

    const resolved = reduceWorkflowExecutionEvent(created.nextState, {
      type: "human-task-resolved",
      runId: "run-1",
      nodeId: "input",
      taskId: "human-input",
      resolution: "submitted",
    })

    expect(resolved.nextState.nodeStates.input.humanTask).toEqual({
      taskId: "human-input",
      status: "answered",
    })
  })

  it("marks a run as finished and requests history refresh", () => {
    const previousState = {
      ...createEmptyWorkflowExecutionState(),
      runStatus: "running" as const,
      runStartedAt: 100,
      runId: "run-1",
      runWorkflowPath: "/tmp/research.chain",
      activeNodeId: "output",
      reportPath: "/tmp/old-report.md",
    }

    const transition = reduceWorkflowExecutionEvent(
      previousState,
      {
        type: "run-done",
        runId: "run-1",
        status: "completed",
        reportPath: "/tmp/new-report.md",
        workspace: "/tmp/run-workspace",
      },
      undefined,
      999,
    )

    expect(transition.nextState.runStatus).toBe("done")
    expect(transition.nextState.runOutcome).toBe("completed")
    expect(transition.nextState.completedAt).toBe(999)
    expect(transition.nextState.runId).toBeNull()
    expect(transition.nextState.activeNodeId).toBeNull()
    expect(transition.nextState.reportPath).toBe("/tmp/new-report.md")
    expect(transition.nextState.workspace).toBe("/tmp/run-workspace")
    expect(transition.effects.refreshPastRuns).toBe(true)
    expect(transition.effects.runFinished).toBe(true)
  })

  it("treats blocked runs as a finished outcome", () => {
    const transition = reduceWorkflowExecutionEvent(
      {
        ...createEmptyWorkflowExecutionState(),
        runStatus: "running",
        runId: "run-1",
      },
      {
        type: "run-done",
        runId: "run-1",
        status: "blocked",
        workspace: "/tmp/run-workspace",
      },
      undefined,
      999,
    )

    expect(transition.nextState.runStatus).toBe("done")
    expect(transition.nextState.runOutcome).toBe("blocked")
    expect(transition.effects.runFinished).toBe(true)
  })

  it("returns a separate failure message for global run errors", () => {
    const transition = reduceWorkflowExecutionEvent(createEmptyWorkflowExecutionState(), {
      type: "node-error",
      runId: "run-1",
      nodeId: "__global",
      error: "Workflow crashed",
    })

    expect(transition.nextState.runStatus).toBe("error")
    expect(transition.nextState.lastError).toBe("Workflow crashed")
    expect(transition.effects.runFailedMessage).toBe("Workflow crashed")
  })

  it("marks in-flight nodes as skipped when cancelling locally", () => {
    const previousState = {
      ...createEmptyWorkflowExecutionState(),
      runStatus: "cancelling" as const,
      runId: "run-1",
      runWorkflowPath: "/tmp/research.chain",
      activeNodeId: "output",
      nodeStates: {
        input: { status: "completed" as const, attempts: 1, log: [] },
        branch: { status: "running" as const, attempts: 0, log: [] },
        approval: { status: "waiting_approval" as const, attempts: 0, log: [] },
        review: { status: "waiting_human" as const, attempts: 0, log: [] },
      },
    }

    const nextState = createCancelledExecutionState(previousState)

    expect(nextState.runStatus).toBe("done")
    expect(nextState.runOutcome).toBe("cancelled")
    expect(nextState.runId).toBeNull()
    expect(nextState.activeNodeId).toBeNull()
    expect(nextState.nodeStates.branch.status).toBe("skipped")
    expect(nextState.nodeStates.approval.status).toBe("skipped")
    expect(nextState.nodeStates.review.status).toBe("skipped")
    expect(nextState.nodeStates.input.status).toBe("completed")
  })
})

describe("assembleInputWithAttachments", () => {
  it("loads attachment content and appends it to the base input", async () => {
    const api = {
      readFileContent: vi.fn().mockResolvedValue({
        content: "file body",
        truncated: true,
      }),
      loadRunResult: vi.fn().mockResolvedValue({
        reportContent: "prior run output",
      }),
    }

    const result = await assembleInputWithAttachments(
      "Base prompt",
      [
        { kind: "file", path: "/tmp/file.txt", name: "file.txt" },
        { kind: "run", runId: "run-1", workspace: "/tmp/run-1", workflowName: "Deep Research" },
        { kind: "text", label: "Notes", content: "Plain text note" },
      ],
      "/tmp/project",
      api,
    )

    expect(api.readFileContent).toHaveBeenCalledWith("/tmp/file.txt", "/tmp/project")
    expect(api.loadRunResult).toHaveBeenCalledWith("/tmp/run-1")
    expect(result).toContain("Base prompt")
    expect(result).toContain("## Attached File: file.txt")
    expect(result).toContain("[truncated]")
    expect(result).toContain("## Previous Run Output: Deep Research")
    expect(result).toContain("prior run output")
    expect(result).toContain("## Notes")
    expect(result).toContain("Plain text note")
  })
})
