import { describe, expect, it } from "vitest"
import type { CreateEntryRouteResult, WorkflowTemplate } from "@shared/types"
import { buildTemplateStartState, buildTemplateStartStateFromRoute } from "./template-start"

function createTemplate(inputType: "text" | "directory"): WorkflowTemplate {
  return {
    id: inputType === "directory" ? "delivery-map-codebase" : "delivery-shape-project",
    name: "Dev Process",
    description: "Start a development process.",
    stage: "research",
    emoji: "🧩",
    headline: "Start here",
    how: "Use a starting point.",
    input: "Provide the source context.",
    output: "Get a first result.",
    steps: ["Input", "Run"],
    workflow: {
      version: 1,
      name: "Dev Process",
      description: "",
      defaults: { model: "sonnet", maxTurns: 120, timeout_minutes: 30, maxParallel: 8 },
      nodes: [
        {
          id: "input",
          type: "input",
          position: { x: 0, y: 0 },
          config: {
            inputType,
            label: "Input",
            placeholder: "",
            required: true,
          },
        },
        {
          id: "output",
          type: "output",
          position: { x: 200, y: 0 },
          config: {
            label: "Output",
            title: "Result",
          },
        },
      ],
      edges: [],
    },
  }
}

describe("buildTemplateStartState", () => {
  it("overrides the entry contract when a requested result is present", () => {
    const state = buildTemplateStartState({
      template: createTemplate("text"),
      workflowPath: "/tmp/example.chain",
      projectPath: "/tmp/project",
      requestedResult: "Ship the feature plan",
    })

    expect(state.entryState.contractLabel).toBe("Requested result")
    expect(state.entryState.contractText).toBe("Ship the feature plan")
    expect(state.initialInputValue).toBe("Ship the feature plan")
    expect(state.initialAttachments).toEqual([])
  })

  it("keeps directory templates repo-first and moves requested result into attachments", () => {
    const state = buildTemplateStartState({
      template: createTemplate("directory"),
      workflowPath: "/tmp/example.chain",
      projectPath: "/tmp/project",
      requestedResult: "Audit the codebase",
    })

    expect(state.entryState.contractLabel).toBe("Requested result")
    expect(state.initialInputValue).toBe("/tmp/project")
    expect(state.initialAttachments).toEqual([
      {
        kind: "text",
        label: "Requested result",
        content: "Audit the codebase",
      },
    ])
  })

  it("respects an explicit route seed", () => {
    const routeResult: CreateEntryRouteResult = {
      recommendedTemplateId: "delivery-shape-project",
      alternateTemplateIds: ["delivery-map-codebase"],
      reason: "Recommended because this looks like a brief-first request.",
      projectInspection: {
        projectPath: "/tmp/project",
        git: {
          isRepo: false,
          branch: null,
          hasUncommittedDiff: false,
        },
        manifests: [],
        codeDirs: [],
        fileDensity: "empty",
        fileCountEstimate: 0,
        projectKind: "greenfield_empty",
      },
      seed: {
        primaryInputMode: "text",
        primaryInputValue: "Shape the VIBECON landing page",
        attachments: [],
      },
      confidence: 0.91,
      source: "agent",
    }

    const state = buildTemplateStartStateFromRoute({
      template: createTemplate("directory"),
      workflowPath: "/tmp/example.chain",
      projectPath: "/tmp/project",
      requestedResult: "Shape the VIBECON landing page",
      routeResult,
    })

    expect(state.entryState.contractLabel).toBe("Requested result")
    expect(state.entryState.routing).toEqual({
      source: "agent",
      reason: "Recommended because this looks like a brief-first request.",
      confidence: 0.91,
    })
    expect(state.initialInputValue).toBe("Shape the VIBECON landing page")
    expect(state.initialAttachments).toEqual([])
  })
})
