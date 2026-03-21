import { describe, it, expect } from "vitest"
import { yamlToChain } from "./migrate"

describe("yamlToChain", () => {
  it("converts a single-step YAML chain to graph", () => {
    const yaml = {
      description: "Simple chain",
      defaults: { model: "sonnet", maxTurns: 60, timeout_minutes: 30 },
      steps: [
        {
          key: "writer",
          agent: "marketing/writer",
          prompt: "Write copy",
          mode: "rewrite" as const,
          skillPaths: ["/path/to/writer.md"],
        },
      ],
    }

    const result = yamlToChain(yaml, "My Workflow")
    expect(result.version).toBe(1)
    expect(result.name).toBe("My Workflow")
    expect(result.description).toBe("Simple chain")
    expect(result.nodes).toHaveLength(3) // input + skill + output
    expect(result.edges).toHaveLength(2)

    const input = result.nodes.find((n) => n.type === "input")!
    const skill = result.nodes.find((n) => n.type === "skill")!
    const output = result.nodes.find((n) => n.type === "output")!

    expect(input).toBeDefined()
    expect(skill).toBeDefined()
    expect(output).toBeDefined()
    expect((skill.config as any).skillRef).toBe("marketing/writer")
    expect((skill.config as any).prompt).toBe("Write copy")
    expect((skill.config as any).permissionMode).toBe("edit")
    expect((skill.config as any).skillPaths).toEqual(["/path/to/writer.md"])
  })

  it("converts multi-step chain with correct edge wiring", () => {
    const yaml = {
      steps: [
        { key: "step-a", agent: "a/b", prompt: "Do A" },
        { key: "step-b", agent: "c/d", prompt: "Do B" },
        { key: "step-c", agent: "e/f", prompt: "Do C" },
      ],
    }

    const result = yamlToChain(yaml, "Multi")
    expect(result.nodes).toHaveLength(5)
    expect(result.edges).toHaveLength(4)
    expect(result.edges.every((e) => e.type === "default")).toBe(true)
  })

  it("promotes a single per-step model override to workflow defaults", () => {
    const yaml = {
      defaults: { maxTurns: 60 },
      steps: [
        { key: "s1", agent: "a/b", prompt: "Do it", model: "opus", maxTurns: 20 },
      ],
    }

    const result = yamlToChain(yaml, "Override Test")
    const skill = result.nodes.find((n) => n.type === "skill")!
    expect(result.defaults?.model).toBe("opus")
    expect((skill.config as any).model).toBeUndefined()
    expect((skill.config as any).maxTurns).toBe(20)
  })

  it("assigns sequential x positions for migrated nodes", () => {
    const yaml = {
      steps: [
        { key: "s1", agent: "a/b", prompt: "1" },
        { key: "s2", agent: "c/d", prompt: "2" },
      ],
    }

    const result = yamlToChain(yaml, "Layout")
    const xs = result.nodes.map((n) => n.position.x)
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBeGreaterThan(xs[i - 1])
    }
  })
})
