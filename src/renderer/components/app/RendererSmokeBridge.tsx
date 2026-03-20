import { useAtom, useAtomValue } from "jotai"
import { useEffect, useCallback } from "react"
import {
  currentWorkflowAtom,
  firstLaunchAtom,
  mainViewAtom,
  projectWorkflowsCacheAtom,
  projectsAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  viewModeAtom,
  workflowSavedSnapshotAtom,
  workflowsAtom,
  desktopRuntimeAtom,
} from "@/lib/store"
import { approvalRequestsAtom, workflowExecutionStatesAtom } from "@/features/execution"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { createEmptyWorkflowExecutionState } from "@/lib/workflow-execution"
import type {
  ElectronSmokeExecutionSeedInput,
  ElectronSmokeMainViewInput,
  ElectronSmokeUiState,
  ElectronSmokeWorkflowOpenInput,
} from "@shared/electron-smoke"

function hasGlobalSettingsHeading() {
  return Array.from(document.querySelectorAll("h1")).some((heading) => heading.textContent?.trim() === "Global Settings")
}

function ensureRendererSmokeHarness() {
  const existing = window.__C8C_RENDERER_SMOKE__ ?? {}
  window.__C8C_RENDERER_SMOKE__ = existing
  return existing
}

export function RendererSmokeBridge({
  commandPaletteOpen,
  sidebarOpen,
  flowStatusRailLabels,
  availableWorkflowNames,
}: {
  commandPaletteOpen: boolean
  sidebarOpen: boolean
  flowStatusRailLabels: string[]
  availableWorkflowNames: string[]
}) {
  const [mainView, setMainView] = useAtom(mainViewAtom)
  const [viewMode, setViewMode] = useAtom(viewModeAtom)
  const [firstLaunch] = useAtom(firstLaunchAtom)
  const [projects, setProjects] = useAtom(projectsAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [currentWorkflow, setCurrentWorkflow] = useAtom(currentWorkflowAtom)
  const [projectWorkflowsCache, setProjectWorkflowsCache] = useAtom(projectWorkflowsCacheAtom)
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setWorkflowExecutionStates] = useAtom(workflowExecutionStatesAtom)
  const [approvalRequests, setApprovalRequests] = useAtom(approvalRequestsAtom)
  const desktopRuntime = useAtomValue(desktopRuntimeAtom)

  const openWorkflow = useCallback(async ({
    projectPath,
    workflowPath,
    viewMode: nextViewMode = "list",
  }: ElectronSmokeWorkflowOpenInput) => {
    const [loadedWorkflow, projectWorkflows] = await Promise.all([
      window.api.loadWorkflow(workflowPath),
      window.api.listProjectWorkflows(projectPath),
    ])

    setProjects((previous) => (previous.includes(projectPath) ? previous : [...previous, projectPath]))
    setSelectedProject(projectPath)
    setProjectWorkflowsCache((previous) => ({
      ...previous,
      [projectPath]: projectWorkflows,
    }))
    setWorkflows(projectWorkflows)
    setSelectedWorkflowPath(workflowPath)
    setCurrentWorkflow(loadedWorkflow)
    setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
    setMainView("thread")
    setViewMode(nextViewMode)
    return true
  }, [
    setCurrentWorkflow,
    setMainView,
    setProjectWorkflowsCache,
    setProjects,
    setSelectedProject,
    setSelectedWorkflowPath,
    setViewMode,
    setWorkflowSavedSnapshot,
    setWorkflows,
  ])

  const setSmokeMainView = useCallback(async ({
    mainView: nextMainView,
    projectPath,
  }: ElectronSmokeMainViewInput) => {
    if (projectPath) {
      setProjects((previous) => (previous.includes(projectPath) ? previous : [...previous, projectPath]))
      setSelectedProject(projectPath)
    }
    if (nextMainView === "thread" || nextMainView === "workflow_create") {
      setViewMode("list")
    }
    setMainView(nextMainView)
    return true
  }, [
    setMainView,
    setProjects,
    setSelectedProject,
    setViewMode,
  ])

  const seedExecutionState = useCallback(async ({
    workflowKey,
    state,
    approvalRequests: nextApprovalRequests,
  }: ElectronSmokeExecutionSeedInput) => {
    const workflowSnapshotValue = state.workflowSnapshot === undefined
      ? currentWorkflow
      : state.workflowSnapshot

    setWorkflowExecutionStates((previous) => ({
      ...previous,
      [workflowKey]: {
        ...createEmptyWorkflowExecutionState(),
        ...state,
        runWorkflowPath: state.runWorkflowPath ?? workflowKey,
        workflowName: state.workflowName ?? workflowSnapshotValue?.name ?? currentWorkflow.name ?? "",
        projectPath: state.projectPath ?? selectedProject ?? null,
        workflowSnapshot: workflowSnapshotValue,
        lastUpdatedAt: Date.now(),
      },
    }))

    if (nextApprovalRequests) {
      setApprovalRequests(nextApprovalRequests)
    }

    return true
  }, [
    currentWorkflow,
    selectedProject,
    setApprovalRequests,
    setWorkflowExecutionStates,
  ])

  useEffect(() => {
    if (!__TEST_MODE__) return

    const harness = ensureRendererSmokeHarness()
    harness.getUiState = (): ElectronSmokeUiState => ({
      mainView,
      viewMode,
      firstLaunch,
      projectCount: projects.length,
      selectedProject,
      selectedWorkflowPath,
      currentWorkflowName: currentWorkflow.name || "",
      commandPaletteOpen,
      commandPaletteVisible: Boolean(document.querySelector('[aria-label="Command palette"]')),
      sidebarOpen,
      sidebarVisible: Boolean(document.querySelector('[aria-label="Project sidebar"]')),
      applicationShellVisible: Boolean(document.querySelector('[role="application"][aria-label="c8c"]')),
      desktopPlatform: desktopRuntime.platform,
      primaryModifierKey: desktopRuntime.primaryModifierKey,
      flowStatusRailVisible: flowStatusRailLabels.length > 0,
      flowStatusRailLabels,
      availableWorkflowNames,
      approvalDialogOpen: approvalRequests.length > 0 && Boolean(document.querySelector('[data-approval-dialog="true"]')),
      settingsPageVisible: mainView === "settings" && hasGlobalSettingsHeading(),
    })
    harness.openWorkflow = openWorkflow
    harness.setMainView = setSmokeMainView
    harness.seedExecutionState = seedExecutionState

    return () => {
      if (window.__C8C_RENDERER_SMOKE__ !== harness) return
      delete harness.getUiState
      delete harness.openWorkflow
      delete harness.setMainView
      delete harness.seedExecutionState
    }
  }, [
    approvalRequests.length,
    commandPaletteOpen,
    currentWorkflow.name,
    desktopRuntime.platform,
    desktopRuntime.primaryModifierKey,
    firstLaunch,
    availableWorkflowNames,
    flowStatusRailLabels,
    mainView,
    openWorkflow,
    projects.length,
    setSmokeMainView,
    seedExecutionState,
    selectedProject,
    selectedWorkflowPath,
    sidebarOpen,
    viewMode,
  ])

  return null
}
