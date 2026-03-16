import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  createWorkflowRunner,
  writeWorkflowApprovalDecision,
  type Workflow,
  type WorkflowEvent,
} from "@c8c/workflow-runner"

const APPROVAL_WORKFLOW: Workflow = {
  version: 1,
  name: "Approval Workflow",
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
    {
      id: "approval-1",
      type: "approval",
      position: { x: 200, y: 0 },
      config: {
        message: "Approve the generated content?",
        show_content: true,
        allow_edit: true,
      },
    },
    { id: "output-1", type: "output", position: { x: 400, y: 0 }, config: {} },
  ],
  edges: [
    { id: "edge-1", source: "input-1", target: "approval-1", type: "default" },
    { id: "edge-2", source: "approval-1", target: "output-1", type: "default" },
  ],
}

async function collectRun(handle: { events: AsyncIterable<WorkflowEvent>; result: Promise<unknown> }) {
  const events: WorkflowEvent[] = []
  const eventsPromise = (async () => {
    for await (const event of handle.events) {
      events.push(event)
    }
  })()

  const summary = await handle.result
  await eventsPromise

  return { summary, events }
}

async function createWorkspace(prefix: string) {
  return mkdtemp(join(tmpdir(), prefix))
}

function createApprovalRunner(workspace: string) {
  return createWorkflowRunner({
    startProviderTask() {
      throw new Error("Provider execution should not be called for approval-only workflow tests")
    },
    workspaceStore: {
      async createRunWorkspace() {
        return workspace
      },
    },
  })
}

describe("openclaw workflow runner compatibility", () => {
  it("suspends at approval nodes and preserves waiting state", async () => {
    const workspace = await createWorkspace("c8c-openclaw-approval-")
    const runner = createApprovalRunner(workspace)

    const handle = await runner.startRun({
      workflow: APPROVAL_WORKFLOW,
      input: { type: "text", value: "Generated draft" },
      approvalBehavior: "suspend",
    })

    const { summary, events } = await collectRun(handle)
    const snapshot = await runner.getSnapshot(handle.runId)

    expect(summary).toMatchObject({ status: "paused", workspace })
    expect(events.some((event) => event.type === "approval-requested" && event.nodeId === "approval-1")).toBe(true)
    expect(snapshot?.state?.nodeStates["approval-1"]?.status).toBe("waiting_approval")
  })

  it("resumes a suspended approval run after approval is persisted", async () => {
    const workspace = await createWorkspace("c8c-openclaw-approve-")
    const runner = createApprovalRunner(workspace)

    const firstHandle = await runner.startRun({
      workflow: APPROVAL_WORKFLOW,
      input: { type: "text", value: "Generated draft" },
      approvalBehavior: "suspend",
    })

    await collectRun(firstHandle)
    await writeWorkflowApprovalDecision(workspace, "approval-1", {
      approved: true,
      editedContent: "Edited draft",
    })

    const resumedHandle = await runner.resumeRun({
      workflow: APPROVAL_WORKFLOW,
      workspace,
      approvalBehavior: "suspend",
    })

    const { summary } = await collectRun(resumedHandle)
    const snapshot = await runner.getSnapshot(resumedHandle.runId)

    expect(summary).toMatchObject({ status: "completed", workspace })
    expect(snapshot?.state?.nodeStates["output-1"]?.output?.content).toBe("Edited draft")
  })

  it("maps explicit approval rejection to a cancelled run", async () => {
    const workspace = await createWorkspace("c8c-openclaw-reject-")
    const runner = createApprovalRunner(workspace)

    const firstHandle = await runner.startRun({
      workflow: APPROVAL_WORKFLOW,
      input: { type: "text", value: "Generated draft" },
      approvalBehavior: "suspend",
    })

    await collectRun(firstHandle)
    await writeWorkflowApprovalDecision(workspace, "approval-1", {
      approved: false,
    })

    const resumedHandle = await runner.resumeRun({
      workflow: APPROVAL_WORKFLOW,
      workspace,
      approvalBehavior: "suspend",
    })

    const { summary } = await collectRun(resumedHandle)

    expect(summary).toMatchObject({ status: "cancelled", workspace })
  })
})
