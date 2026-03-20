import { describe, expect, it } from "vitest"
import type { AppShellWorkflowEntry } from "./app-shell-command-palette"
import { buildFlowStatusRailEntries } from "./flow-status-rail"
import type { WorkflowExecutionState } from "./workflow-execution"

function workflowEntry(overrides: Partial<AppShellWorkflowEntry>): AppShellWorkflowEntry {
  return {
    kind: "workflow",
    id: `workflow:${overrides.workflowPath || "demo"}`,
    workflowPath: "/tmp/demo.flow",
    projectPath: "/tmp/project",
    label: "Demo flow",
    projectLabel: "project",
    metaLabel: "2h",
    active: false,
    updatedAt: 1,
    keywords: [],
    ...overrides,
  }
}

function executionState(overrides: Partial<WorkflowExecutionState>): WorkflowExecutionState {
  return {
    runStatus: "running",
    runOutcome: null,
    runStartedAt: Date.now(),
    completedAt: null,
    lastUpdatedAt: Date.now(),
    runId: "run-1",
    runWorkflowPath: "/tmp/demo.flow",
    workflowName: "Demo flow",
    projectPath: "/tmp/project",
    lastError: null,
    workflowSnapshot: {
      version: 1,
      name: "Demo flow",
      defaults: { model: "sonnet", maxTurns: 10, timeout_minutes: 10, maxParallel: 1 },
      nodes: [
        { id: "input", type: "input", position: { x: 0, y: 0 }, config: {} },
        { id: "review", type: "skill", position: { x: 120, y: 0 }, config: { skillRef: "review", prompt: "Review the code" } },
      ],
      edges: [],
    },
    nodeStates: {
      review: { status: "running", attempts: 0, log: [] },
    },
    activeNodeId: "review",
    inspectedNodeId: null,
    evalResults: {},
    finalContent: "",
    reportPath: null,
    workspace: null,
    selectedPastRun: null,
    runtimeNodes: [],
    runtimeEdges: [],
    runtimeMeta: {},
    artifactRecords: [],
    artifactPersistenceStatus: "idle",
    artifactPersistenceError: null,
    surfaceNotice: null,
    ...overrides,
  }
}

describe("buildFlowStatusRailEntries", () => {
  it("surfaces current stage and status for active flows", () => {
    const entries = buildFlowStatusRailEntries({
      workflowEntries: [
        workflowEntry({ workflowPath: "/tmp/demo.flow", label: "Demo flow", active: true }),
      ],
      executionStates: {
        "/tmp/demo.flow": executionState({ runWorkflowPath: "/tmp/demo.flow" }),
      },
      selectedWorkflowPath: "/tmp/demo.flow",
    })

    expect(entries[0]).toMatchObject({
      workflowPath: "/tmp/demo.flow",
      label: "Demo flow",
      stageLabel: "Review",
      statusLabel: "Running",
      tone: "info",
      selected: true,
      keyHint: 1,
    })
  })

  it("prioritizes blocked flows that need approval", () => {
    const entries = buildFlowStatusRailEntries({
      workflowEntries: [
        workflowEntry({ workflowPath: "/tmp/recent.flow", label: "Recent flow", metaLabel: "3h", updatedAt: 3 }),
        workflowEntry({ workflowPath: "/tmp/blocked.flow", label: "Blocked flow", metaLabel: "1h", updatedAt: 2 }),
      ],
      executionStates: {
        "/tmp/blocked.flow": executionState({
          runWorkflowPath: "/tmp/blocked.flow",
          runStatus: "running",
          nodeStates: {
            review: { status: "waiting_approval", attempts: 1, log: [] },
          },
          activeNodeId: "review",
        }),
      },
      selectedWorkflowPath: null,
    })

    expect(entries[0]).toMatchObject({
      workflowPath: "/tmp/blocked.flow",
      statusLabel: "Waiting for approval",
      approvalPending: true,
      tone: "warning",
    })
  })

  it("fills with recent flows when no runtime state exists", () => {
    const entries = buildFlowStatusRailEntries({
      workflowEntries: [
        workflowEntry({ workflowPath: "/tmp/one.flow", label: "One", metaLabel: "1h", updatedAt: 2 }),
        workflowEntry({ workflowPath: "/tmp/two.flow", label: "Two", metaLabel: "2h", updatedAt: 1 }),
      ],
      executionStates: {},
      selectedWorkflowPath: "/tmp/two.flow",
    })

    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      workflowPath: "/tmp/two.flow",
      selected: true,
      statusLabel: "2h",
    })
  })

  it("keeps active flows ahead of selected idle flows", () => {
    const entries = buildFlowStatusRailEntries({
      workflowEntries: [
        workflowEntry({ workflowPath: "/tmp/selected.flow", label: "Selected flow", active: false, updatedAt: 10 }),
        workflowEntry({ workflowPath: "/tmp/running.flow", label: "Running flow", active: false, updatedAt: 1 }),
      ],
      executionStates: {
        "/tmp/running.flow": executionState({ runWorkflowPath: "/tmp/running.flow" }),
      },
      selectedWorkflowPath: "/tmp/selected.flow",
    })

    expect(entries[0]).toMatchObject({
      workflowPath: "/tmp/running.flow",
      statusLabel: "Running",
    })
    expect(entries[1]).toMatchObject({
      workflowPath: "/tmp/selected.flow",
      selected: true,
    })
  })
})
