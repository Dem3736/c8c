import { describe, expect, it } from "vitest"
import type { ArtifactRecord, HumanTaskSnapshot, Workflow } from "@shared/types"
import { deriveWorkflowBlockedResumeSummary } from "./workflow-blocked-resume"

function createWorkflow(): Workflow {
  return {
    version: 1,
    name: "PDF export preflight",
    description: "",
    defaults: { model: "sonnet", maxTurns: 40, timeout_minutes: 30, maxParallel: 4 },
    nodes: [
      { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: { inputType: "text", required: true } },
      { id: "approval-1", type: "approval", position: { x: 120, y: 0 }, config: { message: "Ship" } },
      { id: "output-1", type: "output", position: { x: 240, y: 0 }, config: { title: "Verification report" } },
    ],
    edges: [
      { id: "edge-1", source: "input-1", target: "approval-1", type: "default" },
      { id: "edge-2", source: "approval-1", target: "output-1", type: "default" },
    ],
  }
}

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
    workflowName: "PDF export preflight",
    workflowPath: "/tmp/project/ship.flow.yaml",
    projectPath: "/tmp/project",
    title: "Ship approval",
    summary: "Review and Check passed; final release decision not yet recorded.",
    createdAt: 1,
    updatedAt: 10,
    responseRevision: 0,
    allowEdit: false,
    request: {
      version: 1,
      kind: "approval",
      title: "Ship approval",
      summary: "Approve the release step.",
      fields: [],
    },
    latestResponse: null,
    ...overrides,
  }
}

function createArtifact(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: "artifact-1",
    kind: "verification_report",
    title: "Verification Report",
    caseId: "case:pdf-export",
    caseLabel: "PDF export preflight",
    projectPath: "/tmp/project",
    workspace: "/tmp/workspace",
    runId: "run-1",
    workflowPath: "/tmp/project/ship.flow.yaml",
    workflowName: "PDF export preflight",
    relativePath: ".c8c/artifacts/verification-report.md",
    contentPath: "/tmp/project/.c8c/artifacts/verification-report.md",
    metadataPath: "/tmp/project/.c8c/artifacts/verification-report.json",
    createdAt: 1,
    updatedAt: 10,
    ...overrides,
  }
}

describe("workflow-blocked-resume", () => {
  it("builds a blocked approval summary with durable context", () => {
    const summary = deriveWorkflowBlockedResumeSummary({
      workflow: createWorkflow(),
      task: createTask(),
      sourceArtifacts: [createArtifact()],
    })

    expect(summary).toMatchObject({
      workLabel: "PDF export preflight",
      currentStepLabel: "Ship",
      statusText: "Blocked: awaiting your approval before Ship.",
      reasonText: "Review and Check passed; final release decision not yet recorded.",
      attachText: "Verification Report",
      latestResultText: "Latest result: Verification Report.",
      primaryActionLabel: "Open approval",
    })
  })

  it("falls back to input-specific copy when a form task blocks continuation", () => {
    const summary = deriveWorkflowBlockedResumeSummary({
      workflow: createWorkflow(),
      task: createTask({
        kind: "form",
        summary: undefined,
        instructions: undefined,
        request: {
          version: 1,
          kind: "form",
          title: "Missing environment input",
          fields: [],
        },
      }),
      sourceArtifacts: [],
    })

    expect(summary.statusText).toBe("Blocked: waiting for input before Ship.")
    expect(summary.reasonText).toBe("Ship is waiting for the missing input before the flow can continue.")
    expect(summary.attachText).toBe("Saved work context is already tied to this step.")
    expect(summary.primaryActionLabel).toBe("Provide input")
  })
})
