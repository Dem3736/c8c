import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, rm, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { initRunPidManifest, loadRunPidManifest, recordRunPidStart } from "./run-pid-manifest"
import { recoverRuntimeState } from "./run-recovery"

describe("run-recovery", () => {
  let root: string
  let workspace: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "run-recovery-root-"))
    workspace = join(root, "run-1")
    await mkdir(workspace, { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("marks stale running run-result as interrupted and clears missing active PIDs", async () => {
    await writeFile(
      join(workspace, "run-result.json"),
      JSON.stringify({
        runId: "run-1",
        status: "running",
        workflowName: "Test",
        startedAt: Date.now() - 1_000,
        completedAt: 0,
        reportPath: "",
        workspace,
      }, null, 2),
      "utf-8",
    )

    await initRunPidManifest(workspace, "run-1", "run")
    await recordRunPidStart(workspace, "run-1", "run", 99_999_999, "skill", "skill-1")

    const summary = await recoverRuntimeState([root])
    expect(summary.staleRunsUpdated).toBe(1)
    expect(summary.manifestsProcessed).toBe(1)
    expect(summary.orphanPidsMissing).toBe(1)

    const runResultRaw = await readFile(join(workspace, "run-result.json"), "utf-8")
    const runResult = JSON.parse(runResultRaw) as { status: string; completedAt: number }
    expect(runResult.status).toBe("interrupted")
    expect(runResult.completedAt).toBeGreaterThan(0)

    const manifest = await loadRunPidManifest(workspace)
    expect(manifest?.status).toBe("interrupted")
    expect(manifest?.processes[0]?.active).toBe(false)
  })
})
