import { describe, expect, it } from "vitest"
import type { WorkflowTemplate } from "@shared/types"
import {
  filterTemplatesForResultMode,
  getResultMode,
  prioritizeTemplatesForResultMode,
  RESULT_MODES,
  templateMatchesResultMode,
} from "./result-modes"

function createTemplate(overrides: Partial<WorkflowTemplate> = {}): WorkflowTemplate {
  return {
    id: "generic-template",
    name: "Generic Template",
    description: "A generic workflow.",
    stage: "content",
    emoji: "T",
    headline: "Generic flow",
    how: "Do some work.",
    input: "Input",
    output: "Output",
    steps: ["Step one"],
    workflow: {
      version: 1,
      name: "Generic Template",
      nodes: [],
      edges: [],
    },
    ...overrides,
  }
}

describe("result-modes", () => {
  it("ships the expected built-in modes", () => {
    expect(RESULT_MODES.map((mode) => mode.id)).toEqual([
      "development",
      "content",
      "courses",
    ])
  })

  it("matches delivery pack templates to development mode", () => {
    const template = createTemplate({
      id: "delivery-map-codebase",
      stage: "research",
      pack: {
        id: "delivery-foundation",
        label: "Delivery Factory",
        journeyStage: "map",
        entrypoint: true,
      },
    })

    expect(templateMatchesResultMode(template, "development")).toBe(true)
    expect(templateMatchesResultMode(template, "content")).toBe(false)
  })

  it("matches content factory templates to content mode", () => {
    const template = createTemplate({
      id: "content-ready-posts",
      stage: "content",
      pack: {
        id: "content-factory-alpha",
        label: "Content Factory",
        journeyStage: "execute",
      },
    })

    expect(templateMatchesResultMode(template, "content")).toBe(true)
    expect(templateMatchesResultMode(template, "development")).toBe(false)
  })

  it("keeps course-oriented templates available through the courses mode", () => {
    const templates = [
      createTemplate({
        id: "landing-page-generator",
        stage: "content",
        name: "Landing Page Generator",
        description: "Build a launch page for an offer.",
      }),
      createTemplate({
        id: "full-stack-code-audit",
        stage: "code",
        name: "Full Stack Code Audit",
        description: "Inspect code paths.",
      }),
    ]

    expect(filterTemplatesForResultMode(templates, "courses").map((template) => template.id)).toEqual([
      "landing-page-generator",
    ])
  })

  it("prioritizes high-confidence mode matches first", () => {
    const templates = [
      createTemplate({
        id: "landing-page-generator",
        stage: "content",
        name: "Landing Page Generator",
      }),
      createTemplate({
        id: "content-ready-posts",
        stage: "content",
        pack: {
          id: "content-factory-alpha",
          label: "Content Factory",
          journeyStage: "execute",
        },
      }),
    ]

    expect(prioritizeTemplatesForResultMode(templates, "content").map((template) => template.id)).toEqual([
      "content-ready-posts",
      "landing-page-generator",
    ])
  })

  it("falls back to development for unknown mode ids", () => {
    expect(getResultMode("unknown-mode").id).toBe("development")
  })
})
