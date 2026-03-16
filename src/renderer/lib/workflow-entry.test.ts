import { describe, expect, it } from "vitest"
import type { WorkflowTemplate } from "@shared/types"
import {
  areTemplateContractsSatisfied,
  buildArtifactAttachmentSeedInput,
  buildTemplateRunContext,
  selectArtifactsForTemplateContracts,
} from "./workflow-entry"

function createTemplate(): WorkflowTemplate {
  return {
    id: "delivery-plan-phase",
    name: "Delivery Factory: Plan Phase",
    description: "Plan the next implementation phase.",
    stage: "strategy",
    emoji: "📐",
    headline: "Plan phase",
    how: "Break work into small tasks.",
    input: "Project context",
    output: "Phase plan",
    steps: ["Plan", "Review"],
    pack: {
      id: "delivery-foundation",
      label: "Delivery Factory",
      journeyStage: "plan",
      recommendedNext: [],
    },
    contractIn: [
      { kind: "project_brief", title: "Project Brief" },
      { kind: "roadmap", title: "Roadmap", required: false },
    ],
    contractOut: [
      { kind: "phase_plan", title: "Phase Plan" },
    ],
    workflow: {
      version: 1,
      name: "Delivery Factory: Plan Phase",
      nodes: [],
      edges: [],
    },
  }
}

describe("workflow-entry factory helpers", () => {
  it("builds a reusable template run context", () => {
    const template = createTemplate()
    const context = buildTemplateRunContext({
      template,
      workflowPath: "/tmp/plan-phase.chain",
    })

    expect(context.templateId).toBe("delivery-plan-phase")
    expect(context.pack?.id).toBe("delivery-foundation")
    expect(context.contractOut?.[0]?.kind).toBe("phase_plan")
    expect(context.caseId).toMatch(/^case:delivery-foundation:/)
  })

  it("checks required contracts and selects matching artifacts", () => {
    const template = createTemplate()
    const artifacts = [
      {
        id: "artifact-1",
        kind: "project_brief",
        title: "Project Brief",
        projectPath: "/tmp/project",
        workspace: "/tmp/workspace",
        runId: "run-1",
        relativePath: ".c8c/artifacts/run-1-project-brief.md",
        contentPath: "/tmp/project/.c8c/artifacts/run-1-project-brief.md",
        metadataPath: "/tmp/project/.c8c/artifacts/run-1-project-brief.json",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "artifact-1b",
        kind: "project_brief",
        title: "Project Brief v2",
        projectPath: "/tmp/project",
        workspace: "/tmp/workspace",
        runId: "run-2",
        relativePath: ".c8c/artifacts/run-2-project-brief.md",
        contentPath: "/tmp/project/.c8c/artifacts/run-2-project-brief.md",
        metadataPath: "/tmp/project/.c8c/artifacts/run-2-project-brief.json",
        createdAt: 2,
        updatedAt: 2,
      },
      {
        id: "artifact-2",
        kind: "roadmap",
        title: "Roadmap",
        projectPath: "/tmp/project",
        workspace: "/tmp/workspace",
        runId: "run-1",
        relativePath: ".c8c/artifacts/run-1-roadmap.md",
        contentPath: "/tmp/project/.c8c/artifacts/run-1-roadmap.md",
        metadataPath: "/tmp/project/.c8c/artifacts/run-1-roadmap.json",
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    expect(areTemplateContractsSatisfied(template.contractIn, artifacts)).toBe(true)
    expect(selectArtifactsForTemplateContracts(template.contractIn, artifacts).map((artifact) => artifact.id))
      .toEqual(["artifact-1b", "artifact-2"])

    const context = buildTemplateRunContext({
      template,
      workflowPath: "/tmp/plan-phase.chain",
      sourceArtifacts: artifacts,
    })
    expect(context.caseId).toMatch(/^case:delivery-foundation:/)
    expect(context.sourceArtifactIds).toEqual(["artifact-1", "artifact-1b", "artifact-2"])
  })

  it("inherits case identity from source artifacts when available", () => {
    const template = createTemplate()
    const context = buildTemplateRunContext({
      template,
      workflowPath: "/tmp/plan-phase.chain",
      sourceArtifacts: [
        {
          id: "artifact-1",
          kind: "project_brief",
          title: "Project Brief",
          caseId: "case:delivery-foundation:abc123",
          caseLabel: "Project Brief",
          projectPath: "/tmp/project",
          workspace: "/tmp/workspace",
          runId: "run-1",
          relativePath: ".c8c/artifacts/run-1-project-brief.md",
          contentPath: "/tmp/project/.c8c/artifacts/run-1-project-brief.md",
          metadataPath: "/tmp/project/.c8c/artifacts/run-1-project-brief.json",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    })

    expect(context.caseId).toBe("case:delivery-foundation:abc123")
    expect(context.caseLabel).toBe("Project Brief")
  })

  it("builds seed copy for artifact-driven stages", () => {
    expect(buildArtifactAttachmentSeedInput([])).toContain("Add the context")
    expect(buildArtifactAttachmentSeedInput([
      { kind: "file", path: ".c8c/artifacts/project-brief.md", name: "Project Brief" },
    ])).toContain("attached artifact as the primary context")
    expect(buildArtifactAttachmentSeedInput([
      { kind: "file", path: ".c8c/artifacts/project-brief.md", name: "Project Brief" },
      { kind: "file", path: ".c8c/artifacts/roadmap.md", name: "Roadmap" },
    ])).toContain("attached artifacts as the primary context")
  })
})
