import { describe, expect, it } from "vitest"
import type { ArtifactRecord, HumanTaskSummary } from "@shared/types"
import { startWorkflowCreateContinuationResourceLoad } from "./useWorkflowCreateContinuation"

function flushMicrotasks() {
  return new Promise<void>((resolve) => queueMicrotask(resolve))
}

function createArtifact(id: string): ArtifactRecord {
  return {
    id,
    kind: "requirements_spec",
    title: `Artifact ${id}`,
    projectPath: "/tmp/project",
    workspace: "/tmp/workspace",
    runId: `run-${id}`,
    relativePath: `.c8c/artifacts/${id}.md`,
    contentPath: `/tmp/project/.c8c/artifacts/${id}.md`,
    metadataPath: `/tmp/project/.c8c/artifacts/${id}.json`,
    createdAt: 1,
    updatedAt: 1,
  }
}

function createTask(id: string): HumanTaskSummary {
  return {
    task: `Task ${id}`,
    taskId: `task-${id}`,
    kind: "approval",
    status: "open",
    workspace: "/tmp/workspace",
    chainId: `chain-${id}`,
    sourceRunId: `run-${id}`,
    nodeId: `approval-${id}`,
    workflowName: `Workflow ${id}`,
    workflowPath: `/tmp/project/${id}.flow.yaml`,
    projectPath: "/tmp/project",
    title: `Approve ${id}`,
    createdAt: 1,
    updatedAt: 1,
    responseRevision: 0,
    allowEdit: true,
  }
}

function deferred<T>() {
  let resolvePromise: ((value: T) => void) | null = null
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })

  return {
    promise,
    resolve(value: T) {
      resolvePromise?.(value)
    },
  }
}

describe("useWorkflowCreateContinuation loader", () => {
  it("clears stale resources immediately when switching projects", () => {
    const requestIdRef = { current: 0 }
    const state = {
      artifacts: [createArtifact("stale")],
      humanTasks: [createTask("stale")],
      loading: false,
    }

    startWorkflowCreateContinuationResourceLoad({
      projectPath: "/tmp/project-beta",
      requestIdRef,
      readResources: async () => ({
        artifacts: [createArtifact("fresh")],
        humanTasks: [createTask("fresh")],
      }),
      onReset: () => {
        state.artifacts = []
        state.humanTasks = []
      },
      onLoaded: (resources) => {
        state.artifacts = resources.artifacts
        state.humanTasks = resources.humanTasks
      },
      onLoadingChange: (loading) => {
        state.loading = loading
      },
    })

    expect(state.artifacts).toEqual([])
    expect(state.humanTasks).toEqual([])
    expect(state.loading).toBe(true)
  })

  it("ignores stale results from an older project request", async () => {
    const requestIdRef = { current: 0 }
    const alpha = deferred<{ artifacts: ArtifactRecord[]; humanTasks: HumanTaskSummary[] }>()
    const beta = deferred<{ artifacts: ArtifactRecord[]; humanTasks: HumanTaskSummary[] }>()
    const state = {
      artifacts: [] as ArtifactRecord[],
      humanTasks: [] as HumanTaskSummary[],
      loading: false,
    }

    startWorkflowCreateContinuationResourceLoad({
      projectPath: "/tmp/project-alpha",
      requestIdRef,
      readResources: () => alpha.promise,
      onReset: () => {
        state.artifacts = []
        state.humanTasks = []
      },
      onLoaded: (resources) => {
        state.artifacts = resources.artifacts
        state.humanTasks = resources.humanTasks
      },
      onLoadingChange: (loading) => {
        state.loading = loading
      },
    })

    startWorkflowCreateContinuationResourceLoad({
      projectPath: "/tmp/project-beta",
      requestIdRef,
      readResources: () => beta.promise,
      onReset: () => {
        state.artifacts = []
        state.humanTasks = []
      },
      onLoaded: (resources) => {
        state.artifacts = resources.artifacts
        state.humanTasks = resources.humanTasks
      },
      onLoadingChange: (loading) => {
        state.loading = loading
      },
    })

    alpha.resolve({
      artifacts: [createArtifact("alpha")],
      humanTasks: [createTask("alpha")],
    })
    await flushMicrotasks()

    expect(state.artifacts).toEqual([])
    expect(state.humanTasks).toEqual([])
    expect(state.loading).toBe(true)

    beta.resolve({
      artifacts: [createArtifact("beta")],
      humanTasks: [createTask("beta")],
    })
    await flushMicrotasks()

    expect(state.artifacts.map((artifact) => artifact.id)).toEqual(["beta"])
    expect(state.humanTasks.map((task) => task.taskId)).toEqual(["task-beta"])
    expect(state.loading).toBe(false)
  })
})
