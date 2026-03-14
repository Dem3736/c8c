import { useEffect, useCallback, useRef } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  runStatusAtom,
  runStartedAtAtom,
  runIdAtom,
  runWorkflowPathAtom,
  nodeStatesAtom,
  activeNodeIdAtom,
  currentWorkflowAtom,
  inputValueAtom,
  finalContentAtom,
  reportPathAtom,
  workspaceAtom,
  pastRunsAtom,
  evalResultsAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  runtimeNodesAtom,
  runtimeEdgesAtom,
  runtimeMetaAtom,
  approvalRequestsAtom,
  webSearchBackendAtom,
} from "@/lib/store"
import type { EvaluationResult } from "@/lib/store"
import type { Workflow, WorkflowEvent, NodeState, InputNodeConfig, RunResult } from "@shared/types"
import { resolveWorkflowInput } from "@/lib/input-type"
import { applyWebSearchBackendPreset } from "@/lib/web-search-backend"
import { toast } from "sonner"

function isResearchLikeWorkflow(workflow: { name: string; description?: string; nodes: Array<{ type: string; config: Record<string, unknown> }> }): boolean {
  const header = `${workflow.name} ${workflow.description || ""}`.toLowerCase()
  if (header.includes("research")) return true
  return workflow.nodes.some((node) => {
    if (node.type !== "skill") return false
    const skillRef = typeof node.config.skillRef === "string" ? node.config.skillRef.toLowerCase() : ""
    const prompt = typeof node.config.prompt === "string" ? node.config.prompt.toLowerCase() : ""
    return skillRef.includes("research") || prompt.includes("research")
  })
}

export function useChainExecution() {
  const [runStatus, setRunStatus] = useAtom(runStatusAtom)
  const setRunStartedAt = useSetAtom(runStartedAtAtom)
  const [runId, setRunId] = useAtom(runIdAtom)
  const [, setRunWorkflowPath] = useAtom(runWorkflowPathAtom)
  const [nodeStates, setNodeStates] = useAtom(nodeStatesAtom)
  const [activeNodeId, setActiveNodeId] = useAtom(activeNodeIdAtom)
  const setFinalContent = useSetAtom(finalContentAtom)
  const setReportPath = useSetAtom(reportPathAtom)
  const [workspace, setWorkspace] = useAtom(workspaceAtom)
  const setPastRuns = useSetAtom(pastRunsAtom)
  const [evalResults, setEvalResults] = useAtom(evalResultsAtom)
  const setRuntimeNodes = useSetAtom(runtimeNodesAtom)
  const setRuntimeEdges = useSetAtom(runtimeEdgesAtom)
  const setRuntimeMeta = useSetAtom(runtimeMetaAtom)
  const setApprovalRequests = useSetAtom(approvalRequestsAtom)
  const [workflow, setCurrentWorkflow] = useAtom(currentWorkflowAtom)
  const [inputValue] = useAtom(inputValueAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)

  const runIdRef = useRef<string | null>(null)
  const pendingRunRef = useRef(false)
  const pendingEventsRef = useRef<WorkflowEvent[]>([])
  const listRunsRequestRef = useRef(0)
  const selectedProjectRef = useRef(selectedProject)
  selectedProjectRef.current = selectedProject

  useEffect(() => {
    runIdRef.current = runId
  }, [runId])

  const clearRunTracking = useCallback(() => {
    runIdRef.current = null
    pendingRunRef.current = false
    pendingEventsRef.current = []
  }, [])

  const beginExecution = useCallback((targetWorkflow: Workflow, workflowPathForRun: string | null) => {
    const initialStates: Record<string, NodeState> = {}
    for (const node of targetWorkflow.nodes) {
      initialStates[node.id] = { status: "pending", attempts: 0, log: [] }
    }
    setNodeStates(initialStates)
    setEvalResults({})
    setRuntimeNodes([])
    setRuntimeEdges([])
    setRuntimeMeta({})
    setRunStatus("starting")
    setRunStartedAt(Date.now())
    setRunWorkflowPath(workflowPathForRun)
    setActiveNodeId(null)
    setApprovalRequests([])
    setFinalContent("")
    setReportPath(null)

    clearRunTracking()
    pendingRunRef.current = true
    setRunId(null)
  }, [
    clearRunTracking,
    setActiveNodeId,
    setApprovalRequests,
    setEvalResults,
    setFinalContent,
    setNodeStates,
    setReportPath,
    setRunId,
    setRunStatus,
    setRunWorkflowPath,
    setRuntimeEdges,
    setRuntimeMeta,
    setRuntimeNodes,
  ])

  const rollbackExecutionStart = useCallback(() => {
    clearRunTracking()
    setRunStatus("idle")
    setRunStartedAt(null)
    setRunWorkflowPath(null)
    setRunId(null)
    setApprovalRequests([])
    setNodeStates({})
    setEvalResults({})
    setRuntimeNodes([])
    setRuntimeEdges([])
    setRuntimeMeta({})
  }, [
    clearRunTracking,
    setApprovalRequests,
    setEvalResults,
    setNodeStates,
    setRunId,
    setRunStatus,
    setRunWorkflowPath,
    setRuntimeEdges,
    setRuntimeMeta,
    setRuntimeNodes,
  ])

  const processWorkflowEvent = useCallback((event: WorkflowEvent) => {
    switch (event.type) {
      case "node-start":
        setRunStatus("running")
        setActiveNodeId(event.nodeId)
        setNodeStates((prev) => ({
          ...prev,
          [event.nodeId]: {
            ...prev[event.nodeId],
            status: "running",
            log: prev[event.nodeId]?.log || [],
            attempts: prev[event.nodeId]?.attempts || 0,
          },
        }))
        break

      case "node-log":
        setNodeStates((prev) => ({
          ...prev,
          [event.nodeId]: {
            ...prev[event.nodeId],
            log: [...(prev[event.nodeId]?.log || []), event.entry],
          },
        }))
        break

      case "node-done":
        setNodeStates((prev) => ({
          ...prev,
          [event.nodeId]: {
            ...prev[event.nodeId],
            status: "completed",
            output: event.output,
          },
        }))
        break

      case "node-error":
        if (event.nodeId === "__global") {
          setRunStatus("error")
          setActiveNodeId(null)
          toast.error("Run failed", {
            description: event.error || "Workflow execution failed.",
          })
        } else {
          setNodeStates((prev) => ({
            ...prev,
            [event.nodeId]: {
              ...prev[event.nodeId],
              status: "failed",
              error: event.error,
            },
          }))
        }
        break

      case "eval-result":
        setEvalResults((prev) => ({
          ...prev,
          [event.nodeId]: [
            ...(prev[event.nodeId] || []),
            {
              attempt: event.attempt,
              score: event.score,
              reason: event.reason,
              passed: event.passed,
              fix_instructions: event.fix_instructions,
              criteria: event.criteria,
            },
          ],
        }))
        break

      case "nodes-expanded":
        setNodeStates((prev) => {
          const next = { ...prev }
          for (const id of event.newNodeIds) {
            if (!next[id]) {
              next[id] = { status: "pending", attempts: 0, log: [] }
            }
          }
          return next
        })
        setRuntimeNodes(event.nodes)
        setRuntimeEdges(event.edges)
        setRuntimeMeta(event.runtimeMeta)
        break

      case "approval-requested":
        setNodeStates((prev) => ({
          ...prev,
          [event.nodeId]: {
            ...prev[event.nodeId],
            status: "waiting_approval",
          },
        }))
        setApprovalRequests((prev) => [
          ...prev,
          {
            runId: event.runId,
            nodeId: event.nodeId,
            content: event.content,
            message: event.message,
            allowEdit: event.allowEdit,
          },
        ])
        break

      case "run-done":
        clearRunTracking()
        setRunWorkflowPath(null)
        // No toasts here — OutputPanel shows inline completion/error banners
        setRunStatus(
          event.status === "completed" ? "done"
          : event.status === "cancelled" ? "done"
          : "error"
        )
        setRunId(null)
        setActiveNodeId(null)
        setApprovalRequests([])
        if (event.reportPath) {
          setReportPath(event.reportPath)
        }
        if (event.workspace) {
          setWorkspace(event.workspace)
        }
        // Refresh past runs list
        if (selectedProjectRef.current) {
          const requestId = ++listRunsRequestRef.current
          window.api.listRuns(selectedProjectRef.current).then((runs) => {
            if (listRunsRequestRef.current !== requestId) return
            setPastRuns(runs)
          }).catch((err) => {
            if (listRunsRequestRef.current !== requestId) return
            console.error("[useChainExecution] listRuns after run-done failed:", err)
          })
        }
        break
    }
  }, [clearRunTracking, setActiveNodeId, setNodeStates, setRunStatus, setRunId, setRunWorkflowPath, setEvalResults, setRuntimeNodes, setRuntimeEdges, setRuntimeMeta, setApprovalRequests, setReportPath, setWorkspace, setPastRuns])

  const finishStartWithRunId = useCallback((startedRunId: string) => {
    runIdRef.current = startedRunId
    setRunId(startedRunId)
    const bufferedEvents = pendingEventsRef.current
    pendingRunRef.current = false
    pendingEventsRef.current = []
    for (const event of bufferedEvents) {
      if (event.runId === startedRunId) {
        processWorkflowEvent(event)
      }
    }
  }, [processWorkflowEvent, setRunId])

  useEffect(() => {
    const unsubscribe = window.api.onWorkflowEvent((event: WorkflowEvent) => {
      const currentRunId = runIdRef.current
      if (currentRunId) {
        if (event.runId !== currentRunId) return
        processWorkflowEvent(event)
        return
      }
      if (pendingRunRef.current) {
        pendingEventsRef.current.push(event)
      }
    })

    return unsubscribe
  }, [processWorkflowEvent])

  // Load past runs when project changes + restore latest result
  useEffect(() => {
    if (selectedProject) {
      const requestId = ++listRunsRequestRef.current
      window.api.listRuns(selectedProject).then((runs) => {
        if (listRunsRequestRef.current !== requestId) return
        setPastRuns(runs)
        // Auto-restore the latest completed run if UI is idle
        if (runStatus === "idle" && runs.length > 0) {
          const latest = runs.find((r) => r.status === "completed")
          if (latest?.workspace) {
            window.api.loadRunResult(latest.workspace).then((result) => {
              if (listRunsRequestRef.current !== requestId) return
              if (result?.reportContent) {
                setFinalContent(result.reportContent)
                setReportPath(result.reportPath || null)
              }
            })
          }
        }
      }).catch((err) => {
        if (listRunsRequestRef.current !== requestId) return
        console.error("[useChainExecution] listRuns on project change failed:", err)
      })
    }
  }, [selectedProject, runStatus, setPastRuns, setFinalContent, setReportPath])

  // Extract final content from output node when run completes
  useEffect(() => {
    if (runStatus === "done") {
      const outputNode = workflow.nodes.find((n) => n.type === "output")
      if (outputNode) {
        const outputState = nodeStates[outputNode.id]
        if (outputState?.output?.content) {
          setFinalContent(outputState.output.content)
        }
      }
    }
  }, [runStatus, workflow.nodes, nodeStates, setFinalContent])

  const run = useCallback(async () => {
    if (runStatus === "running" || runStatus === "paused") return
    if (!workflow.nodes.length) return

    const inputNode = workflow.nodes.find((node) => node.type === "input")
    const inputConfig = (inputNode?.config || {}) as InputNodeConfig
    const resolvedInput = resolveWorkflowInput(inputValue, {
      inputType: inputConfig.inputType,
      required: inputConfig.required,
      defaultValue: inputConfig.defaultValue,
    })
    if (!resolvedInput.valid) return

    beginExecution(workflow, selectedWorkflowPath ?? null)

    const looksResearch = isResearchLikeWorkflow(workflow as unknown as { name: string; description?: string; nodes: Array<{ type: string; config: Record<string, unknown> }> })
    const workflowForExecution = applyWebSearchBackendPreset(
      workflow,
      looksResearch ? "research" : "general",
      webSearchBackend,
    )
    try {
      const result = await window.api.runChain(
        workflowForExecution,
        { type: resolvedInput.type, value: resolvedInput.value },
        selectedProject ?? undefined,
        selectedWorkflowPath ?? undefined,
        webSearchBackend,
      )
      if (!result) {
        toast.error("Could not start run", {
          description: "No active window is available for execution.",
        })
        rollbackExecutionStart()
        return
      }
      if (typeof result === "object" && "error" in result) {
        toast.error("Could not start run", {
          description: result.error,
        })
        rollbackExecutionStart()
        return
      }
      finishStartWithRunId(result)
    } catch (err) {
      console.error("[useChainExecution] runChain failed:", err)
      toast.error("Could not start run", {
        description: String(err),
      })
      rollbackExecutionStart()
    }
  }, [
    beginExecution,
    finishStartWithRunId,
    inputValue,
    rollbackExecutionStart,
    runStatus,
    selectedProject,
    selectedWorkflowPath,
    webSearchBackend,
    workflow,
  ])

  const cancel = useCallback(async () => {
    setRunStatus("cancelling")
    const currentRunId = runIdRef.current
    if (currentRunId) {
      try {
        await window.api.cancelRun(currentRunId)
      } catch (err) {
        console.error("[useChainExecution] cancelRun failed:", err)
        toast.error("Could not cancel run", {
          description: String(err),
        })
        setRunStatus("running")
        return
      }
    }
    clearRunTracking()
    // Preserve partial results — keep nodeStates, evalResults, and runtime graph
    // so completed node outputs remain visible in OutputPanel.
    setRunStatus("done")
    setRunWorkflowPath(null)
    setRunId(null)
    setActiveNodeId(null)
    setApprovalRequests([])
    // Mark any still-running nodes as skipped
    setNodeStates((prev) => {
      const next = { ...prev }
      for (const [nodeId, state] of Object.entries(next)) {
        if (state.status === "running" || state.status === "queued" || state.status === "waiting_approval") {
          next[nodeId] = { ...state, status: "skipped" }
        }
      }
      return next
    })
  }, [setRunStatus, setRunWorkflowPath, setRunId, setActiveNodeId, setNodeStates, setApprovalRequests, clearRunTracking])

  const rerunFrom = useCallback(async (fromNodeId: string) => {
    if (runStatus === "running" || runStatus === "paused") return
    if (!workspace || !workflow.nodes.length) return

    beginExecution(workflow, selectedWorkflowPath ?? null)

    const looksResearch = isResearchLikeWorkflow(workflow as unknown as { name: string; description?: string; nodes: Array<{ type: string; config: Record<string, unknown> }> })
    const workflowForExecution = applyWebSearchBackendPreset(
      workflow,
      looksResearch ? "research" : "general",
      webSearchBackend,
    )

    try {
      const id = await window.api.rerunFrom(
        fromNodeId,
        workflowForExecution,
        workspace,
        selectedProject ?? undefined,
        selectedWorkflowPath ?? undefined,
        webSearchBackend,
      )
      if (id && typeof id === "string") {
        finishStartWithRunId(id)
        return
      }
      if (id && typeof id === "object" && "error" in id) {
        toast.error("Could not restart from selected node", {
          description: id.error,
        })
        rollbackExecutionStart()
        return
      }
      toast.error("Could not restart from selected node")
    } catch (err) {
      console.error("[useChainExecution] rerunFrom failed:", err)
      toast.error("Could not restart from selected node", {
        description: String(err),
      })
    }

    rollbackExecutionStart()
  }, [
    beginExecution,
    finishStartWithRunId,
    rollbackExecutionStart,
    runStatus,
    selectedProject,
    selectedWorkflowPath,
    webSearchBackend,
    workflow,
    workspace,
  ])

  const continueRun = useCallback(async (runToContinue: RunResult) => {
    if (runStatus === "running" || runStatus === "paused") return
    if (!runToContinue.workspace) {
      toast.error("Could not continue run", {
        description: "Run workspace is missing.",
      })
      return
    }

    let workflowForRun = workflow
    let workflowPathForRun = selectedWorkflowPath ?? null

    if (runToContinue.workflowPath) {
      try {
        workflowForRun = await window.api.loadWorkflow(runToContinue.workflowPath)
        workflowPathForRun = runToContinue.workflowPath
        setCurrentWorkflow(workflowForRun)
        setSelectedWorkflowPath(runToContinue.workflowPath)
      } catch (err) {
        toast.error("Could not continue run", {
          description: `Failed to load workflow file: ${String(err)}`,
        })
        return
      }
    }

    if (!workflowForRun.nodes.length) {
      toast.error("Could not continue run", {
        description: "Workflow has no steps.",
      })
      return
    }

    beginExecution(workflowForRun, workflowPathForRun)
    setWorkspace(runToContinue.workspace)

    const looksResearch = isResearchLikeWorkflow(workflowForRun as unknown as { name: string; description?: string; nodes: Array<{ type: string; config: Record<string, unknown> }> })
    const workflowForExecution = applyWebSearchBackendPreset(
      workflowForRun,
      looksResearch ? "research" : "general",
      webSearchBackend,
    )

    try {
      const result = await window.api.continueRun(
        workflowForExecution,
        runToContinue.workspace,
        selectedProject ?? undefined,
        workflowPathForRun ?? undefined,
        webSearchBackend,
      )

      if (typeof result === "string") {
        finishStartWithRunId(result)
        return
      }

      if (result && typeof result === "object" && "error" in result) {
        toast.error("Could not continue run", {
          description: result.error,
        })
        rollbackExecutionStart()
        return
      }

      toast.error("Could not continue run", {
        description: "No active window is available for execution.",
      })
    } catch (err) {
      console.error("[useChainExecution] continueRun failed:", err)
      toast.error("Could not continue run", {
        description: String(err),
      })
    }

    rollbackExecutionStart()
  }, [
    beginExecution,
    finishStartWithRunId,
    rollbackExecutionStart,
    runStatus,
    selectedProject,
    selectedWorkflowPath,
    setCurrentWorkflow,
    setSelectedWorkflowPath,
    setWorkspace,
    webSearchBackend,
    workflow,
  ])

  return { runStatus, nodeStates, activeNodeId, evalResults, workspace, run, cancel, rerunFrom, continueRun }
}
