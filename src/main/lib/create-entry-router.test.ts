import { describe, expect, it } from "vitest"
import type { CreateEntryRouteInput, CreateEntryRouteOption, ProjectInspectionSummary } from "@shared/types"
import { applyCreateEntryRouteGuards, buildHeuristicCreateEntryRoute } from "./create-entry-router"

const developmentOptions: CreateEntryRouteOption[] = [
  { templateId: "delivery-map-codebase", label: "Map codebase", stageLabel: "Shape / Map" },
  { templateId: "delivery-shape-project", label: "Shape project", stageLabel: "Shape / Map" },
  { templateId: "delivery-plan-phase", label: "Plan next phase", stageLabel: "Plan" },
  { templateId: "delivery-verify-phase", label: "Verify phase", stageLabel: "Verify" },
  { templateId: "ux-ui-polish-audit", label: "Audit UX/UI polish", stageLabel: "Review" },
  { templateId: "impeccable-ui-pipeline", label: "Polish a UI feature", stageLabel: "Implement" },
  { templateId: "playwright-visual-audit", label: "Run visual UI audit", stageLabel: "Review" },
]

function createInspection(overrides: Partial<ProjectInspectionSummary> = {}): ProjectInspectionSummary {
  return {
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
    ...overrides,
  }
}

function createInput(overrides: Partial<CreateEntryRouteInput> = {}): CreateEntryRouteInput {
  return {
    modeId: "development",
    projectPath: "/tmp/project",
    fallbackTemplateId: "delivery-map-codebase",
    draftPrompt: "",
    requestedResult: "",
    modeConfig: null,
    promptScaffold: null,
    allowedOptions: developmentOptions,
    ...overrides,
  }
}

describe("buildHeuristicCreateEntryRoute", () => {
  it("routes greenfield briefs to shape project", () => {
    const route = buildHeuristicCreateEntryRoute(
      createInput({
        draftPrompt: "Build a landing page for VIBECON with pricing and speaker sections.",
        requestedResult: "Create the initial product shape for the landing page.",
      }),
      createInspection({
        projectKind: "greenfield_empty",
      }),
      developmentOptions,
    )

    expect(route.recommendedTemplateId).toBe("delivery-shape-project")
    expect(route.seed.primaryInputMode).toBe("text")
    expect(route.seed.primaryInputValue).toContain("Create the initial product shape")
  })

  it("routes repo-oriented requests to map codebase", () => {
    const route = buildHeuristicCreateEntryRoute(
      createInput({
        requestedResult: "Map this existing repository before changing the landing flow.",
      }),
      createInspection({
        projectKind: "existing_repo",
        git: { isRepo: true, branch: "main", hasUncommittedDiff: false },
        manifests: ["package.json"],
        codeDirs: ["src", "components"],
        fileDensity: "active",
        fileCountEstimate: 42,
      }),
      developmentOptions,
    )

    expect(route.recommendedTemplateId).toBe("delivery-map-codebase")
    expect(route.seed.primaryInputMode).toBe("directory")
    expect(route.seed.primaryInputValue).toBe("/tmp/project")
    expect(route.seed.attachments).toEqual([
      {
        kind: "text",
        label: "Requested result",
        content: "Map this existing repository before changing the landing flow.",
      },
    ])
  })

  it("unlocks review entry only when review context is present", () => {
    const route = buildHeuristicCreateEntryRoute(
      createInput({
        draftPrompt: "Review the current branch before merge.",
        requestedResult: "Check branch feature/pdf-export before merge.",
      }),
      createInspection({
        projectKind: "review_ready",
        git: { isRepo: true, branch: "feature/pdf-export", hasUncommittedDiff: true },
        fileDensity: "active",
        fileCountEstimate: 12,
      }),
      developmentOptions,
    )

    expect(route.recommendedTemplateId).toBe("delivery-verify-phase")
    expect(route.seed.primaryInputMode).toBe("branch_or_diff")
    expect(route.seed.primaryInputValue).toBe("feature/pdf-export")
  })

  it("forces map-first when an existing repo request explicitly asks for a map", () => {
    const input = createInput({
      draftPrompt: "давай составим карту проекта",
      requestedResult: "давай составим карту проекта",
    })
    const inspection = createInspection({
      projectKind: "existing_repo",
      git: { isRepo: true, branch: "main", hasUncommittedDiff: false },
      manifests: ["package.json"],
      codeDirs: ["src", "app"],
      fileDensity: "active",
      fileCountEstimate: 42,
    })
    const heuristicRoute = buildHeuristicCreateEntryRoute(input, inspection, developmentOptions)
    const guardedRoute = applyCreateEntryRouteGuards(
      input,
      inspection,
      {
        recommendedTemplateId: "delivery-shape-project",
        alternateTemplateIds: ["delivery-map-codebase"],
        reason: "Recommended because this looks like a brief-first request.",
        confidence: 0.81,
      },
      heuristicRoute,
    )

    expect(guardedRoute?.recommendedTemplateId).toBe("delivery-map-codebase")
    expect(guardedRoute?.source).toBe("heuristic")
    expect(guardedRoute?.reason).toContain("inspect or map an existing codebase first")
  })

  it("routes UI review-and-polish requests to the UI polish pipeline", () => {
    const route = buildHeuristicCreateEntryRoute(
      createInput({
        draftPrompt: "давай проведем ревью UI и заполишим его",
        requestedResult: "давай проведем ревью UI и заполишим его",
      }),
      createInspection({
        projectKind: "review_ready",
        git: { isRepo: true, branch: "main", hasUncommittedDiff: true },
        manifests: ["package.json"],
        codeDirs: ["src", "app"],
        fileDensity: "active",
        fileCountEstimate: 42,
      }),
      developmentOptions,
    )

    expect(route.recommendedTemplateId).toBe("impeccable-ui-pipeline")
    expect(route.source).toBe("heuristic")
    expect(route.reason).toContain("UI review-and-polish request")
  })

  it("routes repo-wide UX/UI audit requests to the audit pipeline", () => {
    const route = buildHeuristicCreateEntryRoute(
      createInput({
        draftPrompt: "сделай ux/ui аудит проекта",
        requestedResult: "сделай ux/ui аудит проекта",
      }),
      createInspection({
        projectKind: "existing_repo",
        git: { isRepo: true, branch: "main", hasUncommittedDiff: false },
        manifests: ["package.json"],
        codeDirs: ["src", "app"],
        fileDensity: "active",
        fileCountEstimate: 42,
      }),
      developmentOptions,
    )

    expect(route.recommendedTemplateId).toBe("ux-ui-polish-audit")
    expect(route.source).toBe("heuristic")
    expect(route.reason).toContain("repo-wide UX/UI audit")
    expect(route.seed.primaryInputMode).toBe("directory")
  })

  it("routes browser-based visual audit requests to Playwright visual audit", () => {
    const route = buildHeuristicCreateEntryRoute(
      createInput({
        draftPrompt: "сделай визуальный аудит основных экранов в браузере через playwright",
        requestedResult: "сделай визуальный аудит основных экранов в браузере через playwright",
      }),
      createInspection({
        projectKind: "existing_repo",
        git: { isRepo: true, branch: "main", hasUncommittedDiff: false },
        manifests: ["package.json"],
        codeDirs: ["src", "app"],
        fileDensity: "active",
        fileCountEstimate: 42,
      }),
      developmentOptions,
    )

    expect(route.recommendedTemplateId).toBe("playwright-visual-audit")
    expect(route.source).toBe("heuristic")
    expect(route.reason).toContain("browser-based visual audit")
    expect(route.seed.primaryInputMode).toBe("text")
  })

  it("respects explicit plan mode when the user wants planning without implementation", () => {
    const route = buildHeuristicCreateEntryRoute(
      createInput({
        draftPrompt: "VIBECON landing page with hero, speakers, agenda, and pricing",
        requestedResult: "Let's plan the landing page without implementing it yet.",
        helpModeHint: "plan",
      }),
      createInspection({
        projectKind: "greenfield_empty",
      }),
      developmentOptions,
    )

    expect(route.recommendedTemplateId).toBe("delivery-plan-phase")
    expect(route.reason).toContain("plan mode")
  })

  it("respects explicit review mode when a review-ready project is selected", () => {
    const route = buildHeuristicCreateEntryRoute(
      createInput({
        draftPrompt: "landing page ready for final check",
        requestedResult: "Review this before ship.",
        helpModeHint: "review",
      }),
      createInspection({
        projectKind: "review_ready",
        git: { isRepo: true, branch: "feature/vibecon", hasUncommittedDiff: true },
        fileDensity: "active",
        fileCountEstimate: 42,
      }),
      developmentOptions,
    )

    expect(route.recommendedTemplateId).toBe("delivery-verify-phase")
    expect(route.reason).toContain("review mode")
  })
})
