import { describe, expect, it } from "vitest"
import type { CreateEntryRouteInput, CreateEntryRouteOption, ProjectInspectionSummary } from "@shared/types"
import { applyCreateEntryRouteGuards, buildHeuristicCreateEntryRoute } from "./create-entry-router"

const developmentOptions: CreateEntryRouteOption[] = [
  { templateId: "delivery-map-codebase", label: "Map codebase", intentLabel: "Do it" },
  { templateId: "delivery-shape-project", label: "Shape project", intentLabel: "Do it" },
  { templateId: "delivery-plan-phase", label: "Plan next phase", intentLabel: "Plan it" },
  { templateId: "full-stack-code-audit", label: "Audit codebase risks", intentLabel: "Review it" },
  { templateId: "delivery-review-phase", label: "Review phase", intentLabel: "Review it" },
  { templateId: "delivery-verify-phase", label: "Verify phase", intentLabel: "Review it" },
  { templateId: "ux-ui-polish-audit", label: "Audit UX/UI polish", intentLabel: "Review it" },
  { templateId: "impeccable-ui-pipeline", label: "Polish a UI feature", intentLabel: "Do it" },
  { templateId: "playwright-visual-audit", label: "Run visual UI audit", intentLabel: "Review it" },
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

  it("routes broad repo review requests to a code audit instead of an internal verify stage", () => {
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

    expect(route.recommendedTemplateId).toBe("full-stack-code-audit")
    expect(route.seed.primaryInputMode).toBe("directory")
    expect(route.seed.primaryInputValue).toBe("/tmp/project")
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
      developmentOptions,
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

  it("routes security verification requests to the code audit path and preserves the request", () => {
    const route = buildHeuristicCreateEntryRoute(
      createInput({
        draftPrompt: "lets verify security",
        requestedResult: "lets verify security",
        helpModeHint: "review",
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

    expect(route.recommendedTemplateId).toBe("full-stack-code-audit")
    expect(route.seed.primaryInputMode).toBe("directory")
    expect(route.seed.attachments).toEqual([
      {
        kind: "text",
        label: "Requested result",
        content: "lets verify security",
      },
    ])
  })

  it("does not route greenfield security intent into a code audit without repo context", () => {
    const route = buildHeuristicCreateEntryRoute(
      createInput({
        draftPrompt: "lets verify security for the product idea before we build it",
        requestedResult: "lets verify security for the product idea before we build it",
      }),
      createInspection({
        projectKind: "greenfield_empty",
        git: { isRepo: false, branch: null, hasUncommittedDiff: false },
        manifests: [],
        codeDirs: [],
        fileDensity: "empty",
        fileCountEstimate: 0,
      }),
      developmentOptions,
    )

    expect(route.recommendedTemplateId).toBe("delivery-shape-project")
    expect(route.seed.primaryInputMode).toBe("text")
    expect(route.seed.primaryInputValue).toBe("lets verify security for the product idea before we build it")
  })

  it("treats do mode as a hard constraint instead of routing to review entries", () => {
    const route = buildHeuristicCreateEntryRoute(
      createInput({
        draftPrompt: "lets verify security",
        requestedResult: "lets verify security",
        helpModeHint: "do",
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

    expect(route.recommendedTemplateId).toBe("delivery-map-codebase")
    expect(route.reason).toContain("do mode")
  })

  it("returns clarification instead of forcing review mode onto a greenfield project", () => {
    const route = buildHeuristicCreateEntryRoute(
      createInput({
        draftPrompt: "review the product idea",
        requestedResult: "review the product idea",
        helpModeHint: "review",
      }),
      createInspection({
        projectKind: "greenfield_empty",
      }),
      developmentOptions,
    )

    expect(route.clarification?.kind).toBe("help_mode")
    expect(route.clarification?.options.find((option) => option.value === "review")?.disabled).toBe(true)
    expect(route.reason).toContain("Review needs existing work")
  })

  it("asks for intent when the request mixes doing the work with planning it", () => {
    const route = buildHeuristicCreateEntryRoute(
      createInput({
        draftPrompt: "plan and implement usage-based billing for settings",
        requestedResult: "plan and implement usage-based billing for settings",
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

    expect(route.clarification?.kind).toBe("help_mode")
    expect(route.clarification?.options.map((option) => option.value)).toEqual(["do", "plan"])
    expect(route.reason).toContain("different kinds of help")
  })

  it("asks for intent when the request mixes review with fixing the work", () => {
    const route = buildHeuristicCreateEntryRoute(
      createInput({
        draftPrompt: "review the onboarding flow and fix anything confusing",
        requestedResult: "review the onboarding flow and fix anything confusing",
      }),
      createInspection({
        projectKind: "review_ready",
        git: { isRepo: true, branch: "feature/onboarding", hasUncommittedDiff: true },
        manifests: ["package.json"],
        codeDirs: ["src", "app"],
        fileDensity: "active",
        fileCountEstimate: 42,
      }),
      developmentOptions,
    )

    expect(route.clarification?.kind).toBe("help_mode")
    expect(route.clarification?.options.map((option) => option.value)).toEqual(["do", "review"])
    expect(route.reason).toContain("different kinds of help")
  })

  it("keeps existing-repo feature changes on the current-app path by default", () => {
    const route = buildHeuristicCreateEntryRoute(
      createInput({
        draftPrompt: "add usage-based billing to settings",
        requestedResult: "add usage-based billing to settings",
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

    expect(route.recommendedTemplateId).toBe("delivery-map-codebase")
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

    expect(route.recommendedTemplateId).toBe("full-stack-code-audit")
    expect(route.reason).toContain("review mode")
  })

  it("forces agent recommendations back to the selected intent when they disagree", () => {
    const heuristicRoute = buildHeuristicCreateEntryRoute(
      createInput({
        draftPrompt: "plan the change",
        requestedResult: "plan the change",
        helpModeHint: "plan",
      }),
      createInspection({
        projectKind: "existing_repo",
        git: { isRepo: true, branch: "main", hasUncommittedDiff: false },
        manifests: ["package.json"],
        codeDirs: ["src"],
        fileDensity: "active",
        fileCountEstimate: 8,
      }),
      developmentOptions,
    )

    const guardedRoute = applyCreateEntryRouteGuards(
      createInput({
        draftPrompt: "plan the change",
        requestedResult: "plan the change",
        helpModeHint: "plan",
      }),
      createInspection({
        projectKind: "existing_repo",
        git: { isRepo: true, branch: "main", hasUncommittedDiff: false },
        manifests: ["package.json"],
        codeDirs: ["src"],
        fileDensity: "active",
        fileCountEstimate: 8,
      }),
      developmentOptions,
      {
        recommendedTemplateId: "full-stack-code-audit",
        alternateTemplateIds: ["delivery-plan-phase"],
        reason: "Recommended because security review seems useful.",
        confidence: 0.84,
      },
      heuristicRoute,
    )

    expect(guardedRoute?.recommendedTemplateId).toBe("delivery-plan-phase")
    expect(guardedRoute?.reason).toContain("plan was selected")
  })
})
