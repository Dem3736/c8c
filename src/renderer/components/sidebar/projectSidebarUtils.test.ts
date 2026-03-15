import { afterEach, describe, expect, it, vi } from "vitest"
import { clampSidebarWidth, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from "./useSidebarResize"
import {
  formatRelativeTime,
  historicalRunVisual,
  latestRunByWorkflowPath,
  projectFolderName,
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
    })
    expect(historicalRunVisual("unknown")).toMatchObject({
      label: "no runs yet",
      progress: 0,
    })
  })

  it("formats project folder names from paths", () => {
    expect(projectFolderName("/tmp/demo")).toBe("demo")
    expect(projectFolderName("demo")).toBe("demo")
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
})

describe("useSidebarResize", () => {
  it("clamps sidebar width to supported bounds", () => {
    expect(clampSidebarWidth(SIDEBAR_MIN_WIDTH - 50)).toBe(SIDEBAR_MIN_WIDTH)
    expect(clampSidebarWidth(SIDEBAR_MAX_WIDTH + 50)).toBe(SIDEBAR_MAX_WIDTH)
    expect(clampSidebarWidth(320)).toBe(320)
  })
})
