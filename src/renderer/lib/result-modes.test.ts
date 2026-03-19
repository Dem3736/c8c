import { describe, expect, it } from "vitest"
import type { WorkflowTemplate } from "@shared/types"
import {
  filterTemplatesForResultMode,
  getResultMode,
  getResultModeQuickStarts,
  prioritizeTemplatesForResultMode,
  RESULT_MODES,
  splitTemplatesForResultMode,
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
  })

  it("matches AI CMO templates to the marketing mode", () => {
    const template = createTemplate({
      id: "ai-cmo-seo-engine",
      stage: "content",
      pack: {
        id: "ai-cmo",
        label: "AI CMO",
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

  it("prioritizes high-confidence content matches first", () => {
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

    expect(prioritizeTemplatesForResultMode(templates, "courses").map((template) => template.id)).toEqual([
      "content-ready-posts",
      "landing-page-generator",
    ])
  })

  it("falls back to development for unknown mode ids", () => {
    expect(getResultMode("unknown-mode").id).toBe("development")
  })

  it("resolves development quick starts in canonical order", () => {
    const templates = [
      createTemplate({ id: "delivery-plan-phase", name: "Plan" }),
      createTemplate({ id: "delivery-implement-phase", name: "Implement" }),
      createTemplate({ id: "delivery-map-codebase", name: "Map" }),
      createTemplate({ id: "delivery-shape-project", name: "Shape" }),
      createTemplate({ id: "delivery-verify-phase", name: "Verify" }),
    ]

    expect(getResultModeQuickStarts(templates, "development").map((entry) => entry.template.id)).toEqual([
      "delivery-map-codebase",
      "delivery-shape-project",
      "delivery-plan-phase",
      "delivery-implement-phase",
      "delivery-verify-phase",
    ])
  })

  it("separates quick starts from the rest of the selected mode templates", () => {
    const templates = [
      createTemplate({
        id: "delivery-map-codebase",
        name: "Map",
        stage: "research",
        pack: {
          id: "delivery-foundation",
          label: "Delivery Factory",
          journeyStage: "map",
        },
      }),
      createTemplate({
        id: "delivery-shape-project",
        name: "Shape",
        stage: "strategy",
        pack: {
          id: "delivery-foundation",
          label: "Delivery Factory",
          journeyStage: "shape",
        },
      }),
      createTemplate({
        id: "delivery-research-phase",
        name: "Research",
        stage: "research",
        pack: {
          id: "delivery-foundation",
          label: "Delivery Factory",
          journeyStage: "research",
        },
      }),
      createTemplate({
        id: "content-ready-posts",
        name: "Posts",
        stage: "content",
        pack: {
          id: "content-factory-alpha",
          label: "Content Factory",
          journeyStage: "execute",
        },
      }),
    ]

    const split = splitTemplatesForResultMode(templates, "development")

    expect(split.quickStarts.map((entry) => entry.template.id)).toEqual([
      "delivery-map-codebase",
      "delivery-shape-project",
    ])
    expect(split.modeTemplates.map((template) => template.id)).toEqual([
      "delivery-research-phase",
    ])
    expect(split.otherTemplates.map((template) => template.id)).toEqual([
      "content-ready-posts",
    ])
  })
})
