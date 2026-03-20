import { describe, expect, it } from "vitest"
import type { Workflow } from "@shared/types"
import { applyWebSearchBackendPreset, resolveTemplateWorkflow } from "./web-search-backend"

function makeWorkflow(): Workflow {
  return {
    version: 1,
    name: "Deep Research",
    description: "",
    defaults: {
      model: "sonnet",
      maxTurns: 60,
    },
    nodes: [
      { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
      {
        id: "researcher-1",
        type: "skill",
        position: { x: 300, y: 0 },
        config: { skillRef: "researcher", prompt: "Research this topic." },
      },
      { id: "output-1", type: "output", position: { x: 600, y: 0 }, config: {} },
    ],
    edges: [
      { id: "e1", source: "input-1", target: "researcher-1", type: "default" },
      { id: "e2", source: "researcher-1", target: "output-1", type: "default" },
    ],
  }
}

describe("applyWebSearchBackendPreset", () => {
  it("adds built-in web tools to disallowed list for exa backend", () => {
    const workflow = makeWorkflow()
    const next = applyWebSearchBackendPreset(workflow, "research", "exa")
    expect(next.defaults?.disallowedTools).toEqual(
      expect.arrayContaining([
        "WebSearch",
        "WebFetch",
        "ToolSearch",
        "Bash(curl:*)",
        "Bash(wget:*)",
      ]),
    )
  })

  it("adds exa tools to allowed list when workflow already uses allowlist", () => {
    const workflow = makeWorkflow()
    workflow.defaults = {
      ...(workflow.defaults || {}),
      allowedTools: ["Read"],
    }
    const next = applyWebSearchBackendPreset(workflow, "research", "exa")
    expect(next.defaults?.allowedTools).toEqual(
      expect.arrayContaining(["Read", "mcp__exa__web_search_exa", "mcp__exa__crawling_exa"]),
    )
  })

  it("removes built-in disallowed tools for builtin backend", () => {
    const workflow = makeWorkflow()
    workflow.defaults = {
      ...(workflow.defaults || {}),
      disallowedTools: ["Read", "WebSearch", "ToolSearch", "Bash(curl:*)", "Bash(wget:*)"],
    }
    const next = applyWebSearchBackendPreset(workflow, "research", "builtin")
    expect(next.defaults?.disallowedTools).toEqual(["Read"])
  })

  it("removes exa-only tools from allowed list for builtin backend", () => {
    const workflow = makeWorkflow()
    workflow.defaults = {
      ...(workflow.defaults || {}),
      allowedTools: ["Read", "mcp__exa__web_search_exa", "mcp__exa__crawling_exa"],
    }
    const next = applyWebSearchBackendPreset(workflow, "research", "builtin")
    expect(next.defaults?.allowedTools).toEqual(["Read"])
  })

  it("does not change non-research templates", () => {
    const workflow = makeWorkflow()
    const next = applyWebSearchBackendPreset(workflow, "content", "exa")
    expect(next).toEqual(workflow)
  })
})

describe("resolveTemplateWorkflow", () => {
  it("uses template display name as workflow name", () => {
    const workflow = { ...makeWorkflow(), name: "new-flow" }
    const next = resolveTemplateWorkflow({
      name: "Deep Research",
      stage: "research",
      workflow,
    }, "builtin")

    expect(next.name).toBe("Deep Research")
    expect(workflow.name).toBe("new-flow")
  })
})
