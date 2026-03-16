import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  approvalTaskId,
  createWorkflowRunner,
  getWorkflowHilTask,
  listWorkflowHilTasks,
  resolveWorkflowHilTaskByRef,
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

  it("persists approval checkpoints as HIL tasks that can be listed and resolved", async () => {
    const workspace = await createWorkspace("c8c-openclaw-hil-")
    const runner = createApprovalRunner(workspace)

    const firstHandle = await runner.startRun({
      workflow: APPROVAL_WORKFLOW,
      input: { type: "text", value: "Generated draft" },
      approvalBehavior: "suspend",
    })

    await collectRun(firstHandle)

    const tasks = (await listWorkflowHilTasks([dirname(workspace)])).filter((task) => task.workspace === workspace)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      status: "open",
      workspace,
      nodeId: "approval-1",
    })

    const task = await getWorkflowHilTask(workspace, approvalTaskId("approval-1"))
    expect(task?.request.kind).toBe("approval")
    expect(task?.state.allowEdit).toBe(true)

    const resolved = await resolveWorkflowHilTaskByRef(tasks[0].task, {
      data: {
        approved: true,
        editedContent: "Edited from HIL task",
      },
      idempotencyKey: "test-key",
      answeredBy: "vitest",
      source: "cli",
    })

    expect(resolved.state.status).toBe("resolved")
    expect(resolved.latestResponse?.data.editedContent).toBe("Edited from HIL task")

    const secondWrite = await resolveWorkflowHilTaskByRef(tasks[0].task, {
      data: {
        approved: true,
        editedContent: "Ignored duplicate",
      },
      idempotencyKey: "test-key",
      answeredBy: "vitest",
      source: "cli",
    })

    expect(secondWrite.latestResponse?.metadata.revision).toBe(1)
    expect(secondWrite.latestResponse?.data.editedContent).toBe("Edited from HIL task")

    const resumedHandle = await runner.resumeRun({
      workflow: APPROVAL_WORKFLOW,
      workspace,
      approvalBehavior: "suspend",
    })

    const { summary } = await collectRun(resumedHandle)
    expect(summary).toMatchObject({ status: "completed", workspace })
  })
})
