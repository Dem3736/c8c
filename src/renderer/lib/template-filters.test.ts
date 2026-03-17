import { describe, expect, it } from "vitest"
import type { WorkflowTemplate } from "@shared/types"
import {
  buildTemplateSearchText,
  isMarketingTemplate,
  templateMatchesLibraryFilter,
} from "./template-filters"

function createTemplate(overrides: Partial<WorkflowTemplate> = {}): WorkflowTemplate {
  return {
    id: "generic-template",
    name: "Generic Template",
    description: "A generic template.",
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

describe("template-filters", () => {
  it("treats AI CMO and content factory packs as marketing templates", () => {
    const template = createTemplate({
      id: "ai-cmo-growth-thesis",
      stage: "strategy",
      pack: {
        id: "ai-cmo",
        label: "AI CMO",
        journeyStage: "intake",
      },
    })

    expect(isMarketingTemplate(template)).toBe(true)
    expect(templateMatchesLibraryFilter(template, "marketing")).toBe(true)
  })

  it("detects GTM and marketing skill-based templates", () => {
    const template = createTemplate({
      id: "cold-outreach-pipeline",
      stage: "outreach",
      workflow: {
        version: 1,
        name: "Cold Outreach Pipeline",
        nodes: [
          {
            id: "skill-1",
            type: "skill",
            position: { x: 0, y: 0 },
            config: {
              skillRef: "gtm/email-generation",
              prompt: "Write emails",
            },
          },
        ],
        edges: [],
      },
    })

    expect(isMarketingTemplate(template)).toBe(true)
    expect(buildTemplateSearchText(template)).toContain("marketing")
  })

  it("does not mark non-marketing technical templates as marketing", () => {
    const template = createTemplate({
      id: "full-stack-code-audit",
      stage: "code",
      name: "Full Stack Code Audit",
      workflow: {
        version: 1,
        name: "Full Stack Code Audit",
        nodes: [
          {
            id: "skill-1",
            type: "skill",
            position: { x: 0, y: 0 },
            config: {
              skillRef: "dev/code-reviewer",
              prompt: "Audit code",
            },
          },
        ],
        edges: [],
      },
    })

    expect(isMarketingTemplate(template)).toBe(false)
    expect(templateMatchesLibraryFilter(template, "marketing")).toBe(false)
    expect(templateMatchesLibraryFilter(template, "code")).toBe(true)
  })
})
