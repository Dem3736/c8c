import { describe, expect, it } from "vitest"
import { buildRunProgressSummary } from "./run-progress"
import type { Workflow } from "@shared/types"

function createWorkflow(): Workflow {
  return {
    version: 1,
    name: "Impeccable UI Pipeline",
    nodes: [
      {
        id: "input",
        type: "input",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "audit",
        type: "skill",
        position: { x: 120, y: 0 },
        config: {
          skillRef: "audit",
          prompt: "Audit the UI",
        },
      },
      {
        id: "normalize",
        type: "skill",
        position: { x: 240, y: 0 },
        config: {
          skillRef: "normalize",
          prompt: "Normalize the output",
        },
      },
    ],
    edges: [
      { id: "edge-1", source: "input", target: "audit", type: "default" },
      { id: "edge-2", source: "audit", target: "normalize", type: "default" },
    ],
  }
}

describe("buildRunProgressSummary", () => {
  it("marks cancelled runs as stopped instead of completed", () => {
    const summary = buildRunProgressSummary({
      workflow: createWorkflow(),
      runtimeNodes: [],
      runtimeMeta: {},
      nodeStates: {
        audit: { status: "skipped", attempts: 0, log: [] },
        normalize: { status: "pending", attempts: 0, log: [] },
      },
      runStatus: "done",
      runOutcome: "cancelled",
      activeNodeId: null,
    })

    expect(summary.phaseLabel).toBe("Stopped")
    expect(summary.tone).toBe("warning")
  })
})
