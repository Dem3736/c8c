import { describe, expect, it, vi } from "vitest"
import type { RunResult, Workflow } from "@shared/types"
import {
  prepareWorkflowForExecution,
  resolveContinuationWorkflow,
  resolveExecutionInput,
  resolveExecutionStartResult,
} from "./commands"

function createWorkflow(): Workflow {
  return {
    version: 1,
    name: "Deep Research",
    defaults: {
      provider: "claude",
      allowedTools: ["Read"],
      disallowedTools: ["Bash(curl:*)"],
    },
    nodes: [
      {
        id: "input",
        type: "input",
        position: { x: 0, y: 0 },
        config: {
          inputType: "auto",
          required: true,
          defaultValue: "https://example.com",
        },
      },
      {
        id: "research",
        type: "skill",
        position: { x: 120, y: 0 },
        config: {
          skillRef: "researcher",
          prompt: "Research the topic",
        },
      },
    ],
    edges: [
      {
        id: "edge-1",
        source: "input",
        target: "research",
        type: "default",
      },
    ],
  }
}

function createRunResult(workflowPath?: string): RunResult {
  return {
    runId: "run-1",
    status: "completed",
    workflowName: "Deep Research",
    workflowPath,
    startedAt: 10,
    completedAt: 20,
    reportPath: "/tmp/report.md",
    workspace: "/tmp/workspace",
  }
}

describe("execution commands helpers", () => {
  it("resolves workflow input using node config defaults", () => {
    const resolved = resolveExecutionInput(createWorkflow(), "")

    expect(resolved.valid).toBe(true)
    expect(resolved.usedDefault).toBe(true)
    expect(resolved.type).toBe("url")
    expect(resolved.value).toBe("https://example.com")
  })

  it("prepares a research workflow with permission mode and backend preset", () => {
    const { workflowForRun, workflowForExecution } = prepareWorkflowForExecution(
      createWorkflow(),
      "exa",
      "edit",
    )

    expect(workflowForRun.defaults?.permissionMode).toBe("edit")
    expect(workflowForExecution.defaults?.disallowedTools).toEqual(expect.arrayContaining([
      "WebSearch",
      "WebFetch",
      "ToolSearch",
      "Bash(curl:*)",
      "Bash(wget:*)",
    ]))
    expect(workflowForExecution.defaults?.allowedTools).toEqual(expect.arrayContaining([
      "Read",
      "mcp__exa__web_search_exa",
      "mcp__exa__crawling_exa",
    ]))
  })

  it("normalizes execution start results", () => {
    expect(resolveExecutionStartResult("run-1", "fallback")).toEqual({
      startedRunId: "run-1",
      errorMessage: null,
    })

    expect(resolveExecutionStartResult({ error: "boom" }, "fallback")).toEqual({
      startedRunId: null,
      errorMessage: "boom",
    })

    expect(resolveExecutionStartResult(null, "fallback")).toEqual({
      startedRunId: null,
      errorMessage: "fallback",
    })
  })

  it("loads the continuation workflow when a workflow path is present", async () => {
    const nextWorkflow = {
      ...createWorkflow(),
      name: "Loaded workflow",
    }
    const loadWorkflow = vi.fn().mockResolvedValue(nextWorkflow)
    const onWorkflowLoaded = vi.fn()

    const result = await resolveContinuationWorkflow(
      createRunResult("/tmp/research.chain"),
      createWorkflow(),
      null,
      loadWorkflow,
      onWorkflowLoaded,
    )

    expect(loadWorkflow).toHaveBeenCalledWith("/tmp/research.chain")
    expect(onWorkflowLoaded).toHaveBeenCalledWith(nextWorkflow, "/tmp/research.chain")
    expect(result).toEqual({
      workflowForRun: nextWorkflow,
      workflowPathForRun: "/tmp/research.chain",
    })
  })

  it("reuses the current workflow when continuing a run without a workflow path", async () => {
    const workflow = createWorkflow()
    const loadWorkflow = vi.fn()
    const onWorkflowLoaded = vi.fn()

    const result = await resolveContinuationWorkflow(
      createRunResult(),
      workflow,
      "/tmp/current.chain",
      loadWorkflow,
      onWorkflowLoaded,
    )

    expect(loadWorkflow).not.toHaveBeenCalled()
    expect(onWorkflowLoaded).not.toHaveBeenCalled()
    expect(result).toEqual({
      workflowForRun: workflow,
      workflowPathForRun: "/tmp/current.chain",
    })
  })
})
