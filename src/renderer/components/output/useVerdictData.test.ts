import { describe, expect, it } from "vitest"

import type { EvaluationResult, NodeState } from "@shared/types"
import type { RuntimeStagePresentation } from "@/lib/runtime-flow-labels"
import { deriveVerdictData } from "@/components/output/useVerdictData"

const RESULT_PRESENTATION: RuntimeStagePresentation = {
  kind: "Result",
  group: "Output",
  title: "QA report",
  outcomeLabel: "Delivers",
  outcomeText: "This step delivers a QA report ready to review.",
  artifactLabel: "QA report",
  artifactRoleLabel: "Final",
}

function createCompletedNodeState(overrides?: Partial<NodeState>): NodeState {
  return {
    status: "completed",
    attempts: 1,
    log: [],
    output: {
      content: "# Result\nBody",
      metadata: {
        source: "agent",
        artifact_label: "QA report",
        reason: "SSR race condition in login component.",
        score: 8.5,
      },
    },
    metrics: {
      tokens_in: 10,
      tokens_out: 20,
      cost_usd: 0.42,
      latency_ms: 2_000,
    },
    warnings: [],
    ...overrides,
  }
}

function createEvalResult(overrides?: Partial<EvaluationResult>): EvaluationResult {
  return {
    attempt: 1,
    score: 8.5,
    reason: "Evaluator fallback reason",
    passed: true,
    ...overrides,
  }
}

describe("deriveVerdictData", () => {
  it("prefers structured reason over artifact label for completed results", () => {
    const result = deriveVerdictData({
      nodeStates: {
        result: createCompletedNodeState(),
      },
      evalResults: {
        result: [createEvalResult()],
      },
      selectedResultNodeId: "result",
      selectedResultPresentation: RESULT_PRESENTATION,
      selectedResultBranchLabel: null,
      selectedStagePresentation: RESULT_PRESENTATION,
      selectedStageIndex: 1,
      workflowStepCount: 3,
      completedStageCount: 3,
      failedStageCount: 0,
      reviewingRunHistory: false,
      selectedReviewRun: null,
      executionLoopSummary: null,
      runStatus: "done",
      runOutcome: "completed",
      hasPrimaryContinuation: false,
      isDisplayedResultEmpty: false,
      failedNodeErrors: [],
    })

    expect(result.headline).toBe("SSR race condition in login component.")
    expect(result.surfaceMode).toBe("document")
    expect(result.evidenceItems).toContain("8.5/10")
  })

  it("uses structured failure reason before raw error text", () => {
    const result = deriveVerdictData({
      nodeStates: {
        result: createCompletedNodeState({
          status: "failed",
          output: {
            content: "",
            metadata: {
              source: "agent",
              artifact_label: "QA report",
              reason: "Accessibility review failed on contrast and focus order.",
            },
          },
        }),
      },
      evalResults: {
        result: [createEvalResult({
          passed: false,
          reason: "Evaluator said something less specific",
        })],
      },
      selectedResultNodeId: "result",
      selectedResultPresentation: RESULT_PRESENTATION,
      selectedResultBranchLabel: null,
      selectedStagePresentation: RESULT_PRESENTATION,
      selectedStageIndex: 2,
      workflowStepCount: 3,
      completedStageCount: 1,
      failedStageCount: 1,
      reviewingRunHistory: false,
      selectedReviewRun: null,
      executionLoopSummary: null,
      runStatus: "error",
      runOutcome: "failed",
      hasPrimaryContinuation: false,
      isDisplayedResultEmpty: true,
      failedNodeErrors: [["result", { error: "Raw stack trace line 1\nline 2" }]],
    })

    expect(result.headline).toBe("Accessibility review failed on contrast and focus order.")
    expect(result.tone).toBe("danger")
    expect(result.preservedText).toBe("Previous 1 step remains available.")
  })
})
