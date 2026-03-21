import type { RunStatus } from "@shared/types"

interface ResolveWorkflowReviewModesParams {
  showIdleReviewMode: boolean
  showBlockedResumeHeader: boolean
  selectedPastRunStatus: RunStatus | null | undefined
}

export function resolveWorkflowReviewModes({
  showIdleReviewMode,
  showBlockedResumeHeader,
  selectedPastRunStatus,
}: ResolveWorkflowReviewModesParams) {
  const showStandaloneIdleReviewMode = showIdleReviewMode && !showBlockedResumeHeader
  const showResumeReviewMode = showBlockedResumeHeader && selectedPastRunStatus === "blocked"

  return {
    showStandaloneIdleReviewMode,
    showResumeReviewMode,
    showAnyReviewMode: showStandaloneIdleReviewMode || showResumeReviewMode,
  }
}
