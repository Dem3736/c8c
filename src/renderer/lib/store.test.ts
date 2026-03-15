import { describe, expect, it } from "vitest"
import { doesRunBelongToWorkflowHistory } from "@/features/execution"

describe("doesRunBelongToWorkflowHistory", () => {
  it("matches saved workflow runs by file path only", () => {
    expect(
      doesRunBelongToWorkflowHistory(
        { workflowName: "Deep Research", workflowPath: "/tmp/a.chain" },
        "/tmp/a.chain",
        "Deep Research",
      ),
    ).toBe(true)

    expect(
      doesRunBelongToWorkflowHistory(
        { workflowName: "Deep Research", workflowPath: "/tmp/b.chain" },
        "/tmp/a.chain",
        "Deep Research",
      ),
    ).toBe(false)
  })

  it("falls back to orphaned draft runs only when there is no saved path", () => {
    expect(
      doesRunBelongToWorkflowHistory(
        { workflowName: "Draft Research", workflowPath: "" },
        null,
        "Draft Research",
      ),
    ).toBe(true)

    expect(
      doesRunBelongToWorkflowHistory(
        { workflowName: "Draft Research", workflowPath: "/tmp/a.chain" },
        null,
        "Draft Research",
      ),
    ).toBe(false)
  })
})
