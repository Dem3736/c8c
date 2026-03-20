import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { listProjectCaseStates, upsertCaseState } from "./case-store"

describe("case-store", () => {
  let projectDir: string

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "case-store-project-"))
  })

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  it("persists and lists durable case state", async () => {
    const saved = await upsertCaseState({
      projectPath: projectDir,
      caseId: "case:delivery-foundation:abc123",
      workLabel: "Seller photo upload",
      caseLabel: "Seller photo upload",
      factoryId: "pack:delivery-pack",
      factoryLabel: "Delivery Factory",
      workflowPath: join(projectDir, ".c8c", "review.chain"),
      workflowName: "Review seller photo upload",
      continuationStatus: "ready",
      nextStepLabel: "Ship approved work",
      artifactIds: ["artifact-1", "artifact-2"],
      lastGate: {
        family: "approval",
        outcome: "passed",
        summaryText: "Approval recorded. Ship can continue.",
        reasonText: "The latest approval decision was recorded.",
        stepLabel: "Ship",
        happenedAt: 10,
      },
      updatedAt: 20,
    })

    expect(saved).toMatchObject({
      caseId: "case:delivery-foundation:abc123",
      workLabel: "Seller photo upload",
      continuationStatus: "ready",
      nextStepLabel: "Ship approved work",
    })

    const listed = await listProjectCaseStates(projectDir)
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({
      caseId: "case:delivery-foundation:abc123",
      artifactIds: ["artifact-1", "artifact-2"],
      lastGate: {
        outcome: "passed",
        summaryText: "Approval recorded. Ship can continue.",
      },
    })
  })

  it("merges artifact ids and preserves createdAt on upsert", async () => {
    const first = await upsertCaseState({
      projectPath: projectDir,
      caseId: "case:delivery-foundation:merge",
      workLabel: "Checkout polish",
      artifactIds: ["artifact-1"],
      continuationStatus: "completed",
      updatedAt: 30,
    })

    const second = await upsertCaseState({
      projectPath: projectDir,
      caseId: "case:delivery-foundation:merge",
      artifactIds: ["artifact-2", "artifact-1"],
      continuationStatus: "ready",
      updatedAt: 40,
    })

    expect(second.createdAt).toBe(first.createdAt)
    expect(second.artifactIds).toEqual(["artifact-2", "artifact-1"])
    expect(second.continuationStatus).toBe("ready")
  })
})
