import { describe, expect, it } from "vitest"
import type { Workflow } from "@shared/types"
import {
  addEdgeToWorkflow,
  addSkillNodeToWorkflow,
  moveMiddleNodeByDirection,
  removeEdgeFromWorkflow,
  removeNodeAndRewireWorkflow,
} from "./workflow-mutations"

function createWorkflow(): Workflow {
  return {
    version: 1,
    name: "Test",
    defaults: { model: "sonnet" },
    nodes: [
      { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
      {
        id: "skill-1",
        type: "skill",
        position: { x: 200, y: 0 },
        config: { skillRef: "test/skill", prompt: "run" },
      },
      { id: "output-1", type: "output", position: { x: 400, y: 0 }, config: {} },
    ],
    edges: [
      { id: "e-input-skill", source: "input-1", target: "skill-1", type: "default" },
      { id: "e-skill-output", source: "skill-1", target: "output-1", type: "default" },
    ],
  }
}

describe("workflow edge mutations", () => {
  it("adds a valid edge and prevents duplicates", () => {
    const workflow = createWorkflow()
    const result = addEdgeToWorkflow(workflow, "input-1", "output-1", "default")
    expect(result.workflow.edges).toHaveLength(3)

    const duplicateAttempt = addEdgeToWorkflow(result.workflow, "input-1", "output-1", "default")
    expect(duplicateAttempt.workflow.edges).toHaveLength(3)
    expect(duplicateAttempt.error).toBeDefined()
  })

  it("does not allow output -> input connections", () => {
    const workflow = createWorkflow()
    const result = addEdgeToWorkflow(workflow, "output-1", "input-1", "default")
    expect(result.workflow.edges).toHaveLength(2)
    expect(result.error).toBeDefined()
  })

  it("removes an existing edge by id", () => {
    const workflow = createWorkflow()
    const next = removeEdgeFromWorkflow(workflow, "e-input-skill")
    expect(next.edges).toHaveLength(1)
    expect(next.edges[0].id).toBe("e-skill-output")
  })

  it("prevents adding default edges that create cycles", () => {
    const workflow: Workflow = {
      ...createWorkflow(),
      nodes: [
        { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
        {
          id: "skill-1",
          type: "skill",
          position: { x: 120, y: 0 },
          config: { skillRef: "test/a", prompt: "a" },
        },
        {
          id: "skill-2",
          type: "skill",
          position: { x: 240, y: 0 },
          config: { skillRef: "test/b", prompt: "b" },
        },
        { id: "output-1", type: "output", position: { x: 360, y: 0 }, config: {} },
      ],
      edges: [
        { id: "e-input-s1", source: "input-1", target: "skill-1", type: "default" },
        { id: "e-s1-s2", source: "skill-1", target: "skill-2", type: "default" },
        { id: "e-s2-output", source: "skill-2", target: "output-1", type: "default" },
      ],
    }

    const result = addEdgeToWorkflow(workflow, "skill-2", "skill-1", "default")
    expect(result.workflow.edges).toHaveLength(3)
    expect(result.error).toBeDefined()
  })

  it("rewires removal without creating self-loops and preserves branch edge types", () => {
    const workflow: Workflow = {
      version: 1,
      name: "Evaluator flow",
      defaults: { model: "sonnet" },
      nodes: [
        { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
        {
          id: "skill-1",
          type: "skill",
          position: { x: 120, y: 0 },
          config: { skillRef: "test/skill", prompt: "run" },
        },
        {
          id: "eval-1",
          type: "evaluator",
          position: { x: 240, y: 0 },
          config: { criteria: "score", threshold: 7, maxRetries: 2, retryFrom: "skill-1" },
        },
        { id: "output-1", type: "output", position: { x: 360, y: 0 }, config: {} },
      ],
      edges: [
        { id: "e-input-skill", source: "input-1", target: "skill-1", type: "default" },
        { id: "e-skill-eval", source: "skill-1", target: "eval-1", type: "default" },
        { id: "e-eval-output", source: "eval-1", target: "output-1", type: "pass" },
        { id: "fail-eval-skill", source: "eval-1", target: "skill-1", type: "fail" },
      ],
    }

    const next = removeNodeAndRewireWorkflow(workflow, "eval-1")

    expect(next.nodes.some((node) => node.id === "eval-1")).toBe(false)
    expect(next.edges.some((edge) => edge.source === "skill-1" && edge.target === "skill-1")).toBe(false)
    expect(next.edges.some((edge) => edge.source === "skill-1" && edge.target === "output-1" && edge.type === "pass")).toBe(true)
  })

  it("clears evaluator retryFrom when referenced node is removed", () => {
    const workflow: Workflow = {
      version: 1,
      name: "Retry flow",
      defaults: { model: "sonnet" },
      nodes: [
        { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
        {
          id: "skill-1",
          type: "skill",
          position: { x: 120, y: 0 },
          config: { skillRef: "test/skill", prompt: "run" },
        },
        {
          id: "eval-1",
          type: "evaluator",
          position: { x: 240, y: 0 },
          config: { criteria: "score", threshold: 7, maxRetries: 2, retryFrom: "skill-1" },
        },
        { id: "output-1", type: "output", position: { x: 360, y: 0 }, config: {} },
      ],
      edges: [
        { id: "e-input-skill", source: "input-1", target: "skill-1", type: "default" },
        { id: "e-skill-eval", source: "skill-1", target: "eval-1", type: "default" },
        { id: "e-eval-output", source: "eval-1", target: "output-1", type: "pass" },
      ],
    }

    const next = removeNodeAndRewireWorkflow(workflow, "skill-1")
    const evaluator = next.nodes.find((node) => node.id === "eval-1")
    expect(evaluator?.type).toBe("evaluator")
    expect((evaluator?.config as { retryFrom?: string }).retryFrom).toBeUndefined()
  })

  it("keeps node ids unique for rapid inserts with same timestamp", () => {
    const workflow = createWorkflow()
    const skill = {
      type: "skill" as const,
      name: "Research Skill",
      description: "do research",
      category: "research",
      path: "/tmp/research.md",
    }

    const first = addSkillNodeToWorkflow(workflow, skill, 1700000000000)
    const second = addSkillNodeToWorkflow(first, skill, 1700000000000)
    const skillNodes = second.nodes.filter((node) => node.type === "skill")
    const ids = new Set(skillNodes.map((node) => node.id))

    expect(ids.size).toBe(skillNodes.length)
  })

  it("promotes a discovered skill model to workflow defaults instead of the node config", () => {
    const workflow: Workflow = {
      ...createWorkflow(),
      defaults: {},
    }

    const skill = {
      type: "skill" as const,
      name: "Codex Skill",
      description: "ship it",
      category: "coding",
      path: "/tmp/codex-skill.md",
      model: "gpt-5-codex",
    }

    const next = addSkillNodeToWorkflow(workflow, skill, 1700000000000)
    const addedSkill = next.nodes.find((node) => node.id !== "skill-1" && node.type === "skill")

    expect(next.defaults?.provider).toBe("codex")
    expect(next.defaults?.model).toBe("gpt-5-codex")
    expect((addedSkill?.config as { model?: string }).model).toBeUndefined()
  })

  it("does not flatten fan-out topology when reordering in list mode", () => {
    const workflow: Workflow = {
      version: 1,
      name: "Fanout flow",
      defaults: { model: "sonnet" },
      nodes: [
        { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
        { id: "splitter-1", type: "splitter", position: { x: 120, y: 0 }, config: { strategy: "split", maxBranches: 2 } },
        { id: "skill-a", type: "skill", position: { x: 240, y: -80 }, config: { skillRef: "test/a", prompt: "a" } },
        { id: "skill-b", type: "skill", position: { x: 240, y: 80 }, config: { skillRef: "test/b", prompt: "b" } },
        { id: "merger-1", type: "merger", position: { x: 360, y: 0 }, config: { strategy: "concatenate" } },
        { id: "output-1", type: "output", position: { x: 480, y: 0 }, config: {} },
      ],
      edges: [
        { id: "e-input-splitter", source: "input-1", target: "splitter-1", type: "default" },
        { id: "e-splitter-a", source: "splitter-1", target: "skill-a", type: "default" },
        { id: "e-splitter-b", source: "splitter-1", target: "skill-b", type: "default" },
        { id: "e-a-merger", source: "skill-a", target: "merger-1", type: "default" },
        { id: "e-b-merger", source: "skill-b", target: "merger-1", type: "default" },
        { id: "e-merger-output", source: "merger-1", target: "output-1", type: "default" },
      ],
    }

    const next = moveMiddleNodeByDirection(workflow, "skill-a", "down")
    expect(next).toEqual(workflow)
  })
})
