import { describe, expect, it } from "vitest"
import {
  buildAppShellActionEntries,
  buildAppShellCommandSections,
  buildAppShellProjectEntries,
  buildAppShellWorkflowEntries,
  buildAppShellStartEntry,
} from "./app-shell-command-palette"
import { createEmptyWorkflowExecutionState } from "@/lib/workflow-execution"

describe("app-shell-command-palette", () => {
  it("sorts active and selected-project workflows first", () => {
    const runningState = {
      ...createEmptyWorkflowExecutionState(),
      runStatus: "running" as const,
    }

    const entries = buildAppShellWorkflowEntries({
      projects: ["/tmp/alpha", "/tmp/beta"],
      selectedProject: "/tmp/alpha",
      projectWorkflowsCache: {
        "/tmp/alpha": [
          { name: "Alpha recent", path: "/tmp/alpha/recent.chain", updatedAt: 20 },
        ],
        "/tmp/beta": [
          { name: "Beta active", path: "/tmp/beta/active.chain", updatedAt: 10 },
          { name: "Beta stale", path: "/tmp/beta/stale.chain", updatedAt: 1 },
        ],
      },
      workflowExecutionStates: {
        "/tmp/beta/active.chain": runningState,
      },
    })

    expect(entries.map((entry) => entry.label)).toEqual([
      "Beta active",
      "Alpha recent",
      "Beta stale",
    ])
  })

  it("builds a project-aware start entry for intent-like queries", () => {
    const entry = buildAppShellStartEntry({
      query: "ux ui polish",
      selectedProject: "/tmp/vibecon",
      projects: ["/tmp/vibecon"],
    })

    expect(entry).toMatchObject({
      kind: "start",
      label: "Review it: ux ui polish",
      projectPath: "/tmp/vibecon",
      projectLabel: "vibecon",
      requiresProjectSelection: false,
    })
  })

  it("groups intent queries into start new and existing matches", () => {
    const actions = buildAppShellActionEntries()
    const projects = ["/tmp/vibecon", "/tmp/other"]
    const workflows = buildAppShellWorkflowEntries({
      projects,
      selectedProject: "/tmp/vibecon",
      projectWorkflowsCache: {
        "/tmp/vibecon": [
          { name: "UX/UI Polish Audit", path: "/tmp/vibecon/ui.chain", updatedAt: 5 },
        ],
        "/tmp/other": [
          { name: "UX UI Polish Audit", path: "/tmp/other/ui.chain", updatedAt: 4 },
        ],
      },
      workflowExecutionStates: {},
    })

    const sections = buildAppShellCommandSections({
      query: "ux ui polish",
      actions,
      projectEntries: buildAppShellProjectEntries({
        projects,
        selectedProject: "/tmp/vibecon",
      }),
      workflows,
      selectedProject: "/tmp/vibecon",
      projects,
    })

    expect(sections.map((section) => section.label)).toEqual([
      "Start new",
      "Open in current project",
      "Open in other projects",
    ])
    expect(sections[0]?.entries[0]).toMatchObject({
      kind: "start",
      label: "Review it: ux ui polish",
    })
  })

  it("keeps navigation queries focused on actions", () => {
    const sections = buildAppShellCommandSections({
      query: "settings",
      actions: buildAppShellActionEntries(),
      projectEntries: buildAppShellProjectEntries({
        projects: ["/tmp/vibecon"],
        selectedProject: "/tmp/vibecon",
      }),
      workflows: [],
      selectedProject: "/tmp/vibecon",
      projects: ["/tmp/vibecon"],
    })

    expect(sections.map((section) => section.label)).toEqual(["Actions"])
    expect(sections[0]?.entries.map((entry) => entry.label)).toEqual(["Settings"])
  })

  it("surfaces attach skill as an action", () => {
    const sections = buildAppShellCommandSections({
      query: "attach",
      actions: buildAppShellActionEntries(),
      projectEntries: buildAppShellProjectEntries({
        projects: ["/tmp/vibecon"],
        selectedProject: "/tmp/vibecon",
      }),
      workflows: [],
      selectedProject: "/tmp/vibecon",
      projects: ["/tmp/vibecon"],
    })

    expect(sections.map((section) => section.label)).toEqual(["Actions"])
    expect(sections[0]?.entries.map((entry) => entry.label)).toEqual(["Attach skill"])
  })

  it("surfaces project matches as switch targets", () => {
    const projects = ["/tmp/vibecon", "/tmp/content-os"]
    const sections = buildAppShellCommandSections({
      query: "content",
      actions: buildAppShellActionEntries(),
      projectEntries: buildAppShellProjectEntries({
        projects,
        selectedProject: "/tmp/vibecon",
      }),
      workflows: [],
      selectedProject: "/tmp/vibecon",
      projects,
    })

    expect(sections.map((section) => section.label)).toEqual(["Switch project"])
    expect(sections[0]?.entries[0]).toMatchObject({
      kind: "project",
      label: "content-os",
    })
  })
})
