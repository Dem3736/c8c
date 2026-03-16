import { describe, expect, it } from "vitest"
import { parseTemplate } from "./parse"

describe("parseTemplate", () => {
  it("parses factory-pack metadata from snake_case fields", () => {
    const template = parseTemplate([
      "id: delivery-map",
      "version: 1",
      "name: Delivery Map",
      "description: map a codebase",
      "stage: research",
      "emoji: \"\\U0001F5FA\"",
      "headline: Map codebase",
      "how: Build a repo map",
      "input: Repository path",
      "output: Codebase map",
      "use_when: You need orientation before planning.",
      "steps:",
      "  - Inspect the repository",
      "pack:",
      "  id: delivery-foundation",
      "  label: Delivery Factory",
      "  journey_stage: map",
      "  entrypoint: true",
      "  recommended_next:",
      "    - delivery-shape",
      "contract_in:",
      "  - kind: project_brief",
      "    required: false",
      "contract_out:",
      "  - kind: codebase_map",
      "    title: Codebase Map",
      "execution_policy:",
      "  profile_id: delivery_map",
      "  summary: Evidence-first orientation",
      "  tags:",
      "    - evidence_first",
      "nodes:",
      "  - id: input-1",
      "    type: input",
      "    position: { x: 0, y: 0 }",
      "    config: {}",
      "  - id: output-1",
      "    type: output",
      "    position: { x: 100, y: 0 }",
      "    config: {}",
      "edges: []",
      "",
    ].join("\n"))

    expect(template.useWhen).toBe("You need orientation before planning.")
    expect(template.pack).toEqual({
      id: "delivery-foundation",
      label: "Delivery Factory",
      journeyStage: "map",
      entrypoint: true,
      recommendedNext: ["delivery-shape"],
    })
    expect(template.contractIn).toEqual([{ kind: "project_brief", required: false }])
    expect(template.contractOut).toEqual([{ kind: "codebase_map", title: "Codebase Map" }])
    expect(template.executionPolicy).toEqual({
      profileId: "delivery_map",
      summary: "Evidence-first orientation",
      description: undefined,
      tags: ["evidence_first"],
      notes: undefined,
    })
  })

  it("preserves provenance overrides while parsing extended metadata", () => {
    const template = parseTemplate([
      "id: original-id",
      "version: 1",
      "name: Override Test",
      "stage: strategy",
      "emoji: \"\\U0001F4DD\"",
      "headline: Test",
      "how: Test parser",
      "input: Input",
      "output: Output",
      "steps:",
      "  - Step one",
      "pack:",
      "  id: sample-pack",
      "  label: Sample Pack",
      "  journeyStage: plan",
      "nodes:",
      "  - id: input-1",
      "    type: input",
      "    position: { x: 0, y: 0 }",
      "    config: {}",
      "  - id: output-1",
      "    type: output",
      "    position: { x: 100, y: 0 }",
      "    config: {}",
      "edges: []",
      "",
    ].join("\n"), {
      id: "plugin:sample-pack:override-test",
      source: "plugin",
      pluginId: "sample-pack",
    })

    expect(template.id).toBe("plugin:sample-pack:override-test")
    expect(template.source).toBe("plugin")
    expect(template.pluginId).toBe("sample-pack")
    expect(template.pack?.journeyStage).toBe("plan")
  })
})
