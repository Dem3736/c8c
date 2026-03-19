import { describe, expect, it } from "vitest"
import { resolveGuidedStartTemplateId } from "./guided-start"

describe("guided-start", () => {
  it("keeps the default map entry when no extra context is provided", () => {
    expect(resolveGuidedStartTemplateId({
      modeId: "development",
      fallbackTemplateId: "delivery-map-codebase",
      projectPath: "/tmp/chain-runner",
    })).toBe("delivery-map-codebase")
  })

  it("starts with shape project for a feature brief", () => {
    expect(resolveGuidedStartTemplateId({
      modeId: "development",
      fallbackTemplateId: "delivery-map-codebase",
      projectPath: "/tmp/chain-runner",
      draftPrompt: "Add seller photo upload with a 5MB limit and resize to 1200px.",
    })).toBe("delivery-shape-project")
  })

  it("starts with map codebase when repo context is explicit", () => {
    expect(resolveGuidedStartTemplateId({
      modeId: "development",
      fallbackTemplateId: "delivery-map-codebase",
      projectPath: "/tmp/chain-runner",
      modeConfig: {
        project_goal: "",
        source_context: "Repository path: /tmp/chain-runner",
        quality_bar: "",
        strategist_checkpoints: "",
      },
    })).toBe("delivery-map-codebase")
  })

  it("does not override non-development modes", () => {
    expect(resolveGuidedStartTemplateId({
      modeId: "content",
      fallbackTemplateId: "segment-research-gate",
      draftPrompt: "Research the AI sales market.",
    })).toBe("segment-research-gate")
  })
})
