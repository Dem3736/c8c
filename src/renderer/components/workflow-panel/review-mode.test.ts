import { describe, expect, it } from "vitest"
import { resolveWorkflowReviewModes } from "./review-mode"

describe("resolveWorkflowReviewModes", () => {
  it("keeps plain idle review mode when no blocked resume header is shown", () => {
    expect(resolveWorkflowReviewModes({
      showIdleReviewMode: true,
      showBlockedResumeHeader: false,
      selectedPastRunStatus: "completed",
    })).toEqual({
      showStandaloneIdleReviewMode: true,
      showResumeReviewMode: false,
      showAnyReviewMode: true,
    })
  })

  it("prefers blocked review mode over generic idle review when the blocked header is active", () => {
    expect(resolveWorkflowReviewModes({
      showIdleReviewMode: true,
      showBlockedResumeHeader: true,
      selectedPastRunStatus: "blocked",
    })).toEqual({
      showStandaloneIdleReviewMode: false,
      showResumeReviewMode: true,
      showAnyReviewMode: true,
    })
  })

  it("suppresses generic idle review when the blocked header is active without a blocked run", () => {
    expect(resolveWorkflowReviewModes({
      showIdleReviewMode: true,
      showBlockedResumeHeader: true,
      selectedPastRunStatus: "completed",
    })).toEqual({
      showStandaloneIdleReviewMode: false,
      showResumeReviewMode: false,
      showAnyReviewMode: false,
    })
  })
})
