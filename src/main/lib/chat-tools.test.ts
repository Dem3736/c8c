import { describe, expect, it } from "vitest"
import type { SkillCategoryNode, Workflow } from "@shared/types"
import { executeTool, type ToolContext } from "./chat-tools"

function createBaseWorkflow(): Workflow {
  return {
    version: 1,
    name: "test",
    description: "",
    defaults: { model: "sonnet", maxTurns: 10, timeout_minutes: 10, maxParallel: 2 },
    nodes: [
      {
        id: "input-1",
        type: "input",
        position: { x: 0, y: 0 },
        config: { inputType: "auto", required: true },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 300, y: 0 },
        config: { format: "markdown" },
      },
    ],
    edges: [
      { id: "e-input-output", source: "input-1", target: "output-1", type: "default" },
    ],
  }
}

function createContext(): ToolContext {
  const categoryTree: SkillCategoryNode = {
    name: "root",
    path: "",
    count: 0,
    children: [],
    skills: [],
  }

  return {
    workflow: createBaseWorkflow(),
    skills: [],
    categoryTree,
  }
}

describe("chat-tools add_node", () => {
  it("fails fast when after_node_id does not exist", () => {
    const ctx = createContext()
    const snapshot = structuredClone(ctx.workflow)

    const result = executeTool("add_node", ctx, {
      node: {
        type: "skill",
        config: { skillRef: "qa/reviewer", prompt: "review" },
      },
      after_node_id: "skill-1",
    })

    expect(result.workflowMutated).toBe(false)
    expect(result.output).toContain('after_node_id "skill-1" not found')
    expect(ctx.workflow).toEqual(snapshot)
  })

  it("rewires outgoing edges when inserting after an existing node", () => {
    const ctx = createContext()

    const result = executeTool("add_node", ctx, {
      node: {
        type: "skill",
        config: { skillRef: "qa/reviewer", prompt: "review" },
      },
      after_node_id: "input-1",
    })

    expect(result.workflowMutated).toBe(true)
    expect(ctx.workflow.nodes.map((n) => n.id)).toContain("skill-2")
    expect(ctx.workflow.edges).toHaveLength(2)
    expect(ctx.workflow.edges).toEqual(expect.arrayContaining([
      { id: "e-input-1-skill-2", source: "input-1", target: "skill-2", type: "default" },
      { id: "e-skill-2-output-1", source: "skill-2", target: "output-1", type: "default" },
    ]))

    const nodeIds = new Set(ctx.workflow.nodes.map((n) => n.id))
    const hasDanglingEdge = ctx.workflow.edges.some(
      (edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target),
    )
    expect(hasDanglingEdge).toBe(false)
  })

  it("rejects duplicate explicit node id", () => {
    const ctx = createContext()
    const snapshot = structuredClone(ctx.workflow)

    const result = executeTool("add_node", ctx, {
      node: {
        id: "output-1",
        type: "skill",
        config: { skillRef: "qa/reviewer", prompt: "review" },
      },
    })

    expect(result.workflowMutated).toBe(false)
    expect(result.output).toContain('node "output-1" already exists')
    expect(ctx.workflow).toEqual(snapshot)
  })

  it("reports no-op for update_node without config payload", () => {
    const ctx = createContext()
    const snapshot = structuredClone(ctx.workflow)

    const result = executeTool("update_node", ctx, {
      node_id: "input-1",
    })

    expect(result.workflowMutated).toBe(false)
    expect(result.output).toContain("No updates applied")
    expect(ctx.workflow).toEqual(snapshot)
  })
})
