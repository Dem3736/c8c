import { describe, expect, it } from "vitest"
import type { HumanTaskSnapshot } from "@shared/types"
import {
  buildInitialHumanTaskAnswers,
  hasMissingRequiredTaskAnswers,
  toContinuationRun,
} from "./task-ui"

function createTask(overrides: Partial<HumanTaskSnapshot> = {}): HumanTaskSnapshot {
  return {
    task: "Review block",
    taskId: "approval-1",
    kind: "approval",
    status: "open",
    workspace: "/tmp/workspace",
    chainId: "chain-1",
    sourceRunId: "run-1",
    nodeId: "approval-1",
    workflowName: "Ship flow",
    workflowPath: "/tmp/project/ship.flow.yaml",
    projectPath: "/tmp/project",
    title: "Ship approval",
    createdAt: 1,
    updatedAt: 10,
    responseRevision: 0,
    request: {
      version: 1,
      kind: "approval",
      title: "Ship approval",
      fields: [
        {
          id: "decision",
          type: "select",
          label: "Decision",
          required: true,
          options: [
            { value: "approve", label: "Approve" },
            { value: "reject", label: "Reject" },
          ],
        },
      ],
      defaults: {
        decision: "approve",
      },
    },
    latestResponse: null,
    ...overrides,
  }
}

describe("task-ui", () => {
  it("hydrates default answers from task defaults", () => {
    expect(buildInitialHumanTaskAnswers(createTask())).toEqual({
      decision: "approve",
    })
  })

  it("prefers latest response answers when present", () => {
    expect(buildInitialHumanTaskAnswers(createTask({
      latestResponse: {
        version: 1,
        taskId: "approval-1",
        resolution: "submitted",
        answers: { decision: "reject" },
        metadata: {
          answeredAt: 10,
          revision: 1,
          idempotencyKey: "task-1",
        },
      },
    }))).toEqual({
      decision: "reject",
    })
  })

  it("detects missing required answers and maps continuation runs", () => {
    const task = createTask()

    expect(hasMissingRequiredTaskAnswers(task, {})).toBe(true)
    expect(hasMissingRequiredTaskAnswers(task, { decision: "approve" })).toBe(false)
    expect(toContinuationRun(task)).toMatchObject({
      runId: "run-1",
      status: "blocked",
      workflowName: "Ship flow",
      workflowPath: "/tmp/project/ship.flow.yaml",
      workspace: "/tmp/workspace",
    })
  })
})
