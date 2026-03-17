import { describe, expect, it } from "vitest"
import type { Workflow } from "@shared/types"
import { workflowSnapshot } from "./workflow-snapshot"

describe("workflowSnapshot", () => {
  it("ignores object property insertion order when serializing workflows", () => {
    const left: Workflow = {
      version: 1,
      name: "Stable",
      defaults: {
        model: "sonnet",
        maxTurns: 10,
      },
      nodes: [
        {
          id: "node-1",
          type: "skill",
          position: { x: 0, y: 0 },
          config: {
            prompt: "Research the topic",
            skillRef: "researcher",
          },
        },
      ],
      edges: [],
    }

    const right: Workflow = {
      version: 1,
      name: "Stable",
      defaults: {
        maxTurns: 10,
        model: "sonnet",
      },
      nodes: [
        {
          id: "node-1",
          type: "skill",
          position: { y: 0, x: 0 },
          config: {
            skillRef: "researcher",
            prompt: "Research the topic",
          },
        },
      ],
      edges: [],
    }

    expect(workflowSnapshot(left)).toBe(workflowSnapshot(right))
  })
})
