import { afterEach, describe, expect, it, vi } from "vitest"
import { clampSidebarWidth, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from "./useSidebarResize"
import {
  buildSidebarWorkflowSummary,
  formatRelativeTime,
  historicalRunVisual,
  latestRunByWorkflowPath,
  projectFolderName,
  resolveProjectRowSelectionState,
  workflowHasActiveRunStatus,
} from "./projectSidebarUtils"

describe("projectSidebarUtils", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns consistent visual metadata for historical runs", () => {
    expect(historicalRunVisual("completed")).toMatchObject({
      label: "completed",
      progress: 100,
      barClass: "bg-status-success",
      dotClass: "border-status-success/30 bg-status-success",
    })
    expect(historicalRunVisual("unknown")).toMatchObject({
      label: "no runs yet",
      progress: 0,
      dotClass: "border-muted-foreground/20 bg-muted-foreground/45",
    })
  })

  it("formats project folder names from paths", () => {
    expect(projectFolderName("/tmp/demo")).toBe("demo")
    expect(projectFolderName("demo")).toBe("demo")
  })

  it("selects another project before toggling its workflow list", () => {
    expect(resolveProjectRowSelectionState("/tmp/beta", "/tmp/alpha", false)).toEqual({
      shouldSelectProject: true,
      nextExpanded: true,
    })
    expect(resolveProjectRowSelectionState("/tmp/beta", "/tmp/alpha", true)).toEqual({
      shouldSelectProject: true,
      nextExpanded: false,
    })
    expect(resolveProjectRowSelectionState("/tmp/beta", "/tmp/beta", true)).toEqual({
      shouldSelectProject: false,
      nextExpanded: false,
    })
  })

  it("formats relative timestamps", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000)
    expect(formatRelativeTime(1_000_000)).toBe("now")
    expect(formatRelativeTime(1_000_000 - 5 * 60_000)).toBe("5m")
    expect(formatRelativeTime(1_000_000 - 2 * 60 * 60_000)).toBe("2h")
  })

  it("detects active run statuses", () => {
    expect(workflowHasActiveRunStatus("running")).toBe(true)
    expect(workflowHasActiveRunStatus("paused")).toBe(true)
    expect(workflowHasActiveRunStatus("idle")).toBe(false)
  })

  it("tracks the latest visible run per workflow path", () => {
    const latestByPath = latestRunByWorkflowPath([
      { workflowPath: "/tmp/a.chain", status: "completed" },
      { workflowPath: "/tmp/a.chain", status: "failed" },
      { workflowPath: "/tmp/b.chain", status: "failed" },
      { workflowPath: undefined, status: "completed" },
    ] as any)

    expect(latestByPath.get("/tmp/a.chain")?.status).toBe("completed")
    expect(latestByPath.get("/tmp/b.chain")?.status).toBe("failed")
    expect(latestByPath.size).toBe(2)
  })

  it("builds compact sidebar summary for active workflow runs", () => {
    const summary = buildSidebarWorkflowSummary({
      executionState: {
        runStatus: "running",
        runOutcome: null,
        runStartedAt: Date.now(),
        completedAt: null,
        lastUpdatedAt: Date.now(),
        runId: "run-1",
        runWorkflowPath: "/tmp/demo.chain",
        workflowName: "Demo",
        projectPath: "/tmp",
        lastError: null,
        workflowSnapshot: {
          version: 1,
          name: "Demo",
          defaults: { model: "sonnet", maxTurns: 10, timeout_minutes: 10, maxParallel: 1 },
          nodes: [
            { id: "input", type: "input", position: { x: 0, y: 0 }, config: {} },
            {
              id: "shape",
              type: "skill",
              position: { x: 120, y: 0 },
              config: { skillRef: "shape", prompt: "Shape the change" },
            },
          ],
          edges: [],
        },
        nodeStates: {
          shape: { status: "running", attempts: 0, log: [] },
        },
        activeNodeId: "shape",
        inspectedNodeId: null,
        evalResults: {},
        finalContent: "",
        reportPath: null,
        workspace: null,
        selectedPastRun: null,
        runtimeNodes: [],
        runtimeEdges: [],
        runtimeMeta: {},
        artifactRecords: [],
        artifactPersistenceStatus: "idle",
        artifactPersistenceError: null,
        surfaceNotice: null,
      },
    } as any)

    expect(summary.detailLabel).toBe("Shape")
  })

  it("keeps recent finished rows quiet when there is no active run", () => {
    expect(buildSidebarWorkflowSummary({})).toEqual({
      detailLabel: null,
    })
  })
})

describe("useSidebarResize", () => {
  it("clamps sidebar width to supported bounds", () => {
    expect(clampSidebarWidth(SIDEBAR_MIN_WIDTH - 50)).toBe(SIDEBAR_MIN_WIDTH)
    expect(clampSidebarWidth(SIDEBAR_MAX_WIDTH + 50)).toBe(SIDEBAR_MAX_WIDTH)
    expect(clampSidebarWidth(320)).toBe(320)
  })
})
