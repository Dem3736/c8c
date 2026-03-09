import { describe, it, expect } from "vitest"
import { computeLayout } from "./useCanvasLayout"
import type { Workflow } from "@shared/types"

const minimalWorkflow: Workflow = {
  version: 1,
  name: "test",
  description: "",
  defaults: {},
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
    {
      id: "skill-1",
      type: "skill",
      position: { x: 0, y: 0 },
      config: { skillRef: "writing/blogger", prompt: "Write a blog post" },
    },
    { id: "output-1", type: "output", position: { x: 0, y: 0 }, config: {} },
  ],
  edges: [
    { id: "e1", source: "input-1", target: "skill-1", type: "default" },
    { id: "e2", source: "skill-1", target: "output-1", type: "default" },
  ],
}

describe("computeLayout", () => {
  it("converts workflow nodes to React Flow nodes with positions", () => {
    const { nodes, edges } = computeLayout(minimalWorkflow, {})
    expect(nodes).toHaveLength(3)
    for (const node of nodes) {
      expect(typeof node.position.x).toBe("number")
      expect(typeof node.position.y).toBe("number")
    }
    const inputNode = nodes.find((n) => n.id === "input-1")!
    const skillNode = nodes.find((n) => n.id === "skill-1")!
    const outputNode = nodes.find((n) => n.id === "output-1")!
    expect(inputNode.position.x).toBeLessThan(skillNode.position.x)
    expect(skillNode.position.x).toBeLessThan(outputNode.position.x)
  })

  it("converts workflow edges to React Flow edges with correct types", () => {
    const { edges } = computeLayout(minimalWorkflow, {})
    expect(edges).toHaveLength(2)
    expect(edges[0]).toMatchObject({
      id: "e1",
      source: "input-1",
      target: "skill-1",
    })
  })

  it("maps edge types to style classes", () => {
    const workflowWithEval: Workflow = {
      ...minimalWorkflow,
      nodes: [
        ...minimalWorkflow.nodes,
        {
          id: "eval-1",
          type: "evaluator",
          position: { x: 0, y: 0 },
          config: { criteria: "test", threshold: 7, maxRetries: 3 },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "skill-1", type: "default" },
        { id: "e2", source: "skill-1", target: "eval-1", type: "default" },
        { id: "e3", source: "eval-1", target: "output-1", type: "pass" },
        { id: "e4", source: "eval-1", target: "skill-1", type: "fail" },
      ],
    }
    const { edges } = computeLayout(workflowWithEval, {})
    const passEdge = edges.find((e) => e.id === "e3")!
    const failEdge = edges.find((e) => e.id === "e4")!
    expect(passEdge.data?.edgeType).toBe("pass")
    expect(failEdge.data?.edgeType).toBe("fail")
  })

  it("passes node status from nodeStates to node data", () => {
    const nodeStates = {
      "skill-1": { status: "running" as const, attempts: 1, log: [] },
    }
    const { nodes } = computeLayout(minimalWorkflow, nodeStates)
    const skillNode = nodes.find((n) => n.id === "skill-1")!
    expect(skillNode.data.status).toBe("running")
  })

  it("passes active flag to node data", () => {
    const { nodes } = computeLayout(minimalWorkflow, {}, "skill-1")
    const skillNode = nodes.find((n) => n.id === "skill-1")!
    expect(skillNode.data.isActive).toBe(true)
    const inputNode = nodes.find((n) => n.id === "input-1")!
    expect(inputNode.data.isActive).toBe(false)
  })
})
