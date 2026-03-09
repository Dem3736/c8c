import { useEffect, useCallback, useRef } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  runStatusAtom,
  runIdAtom,
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
  approvalRequestAtom,
  webSearchBackendAtom,
} from "@/lib/store"
import type { EvaluationResult } from "@/lib/store"
import type { WorkflowEvent, NodeState, InputNodeConfig } from "@shared/types"
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
  const [, setRunId] = useAtom(runIdAtom)
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
  const setApprovalRequest = useSetAtom(approvalRequestAtom)
  const [workflow] = useAtom(currentWorkflowAtom)
  const [inputValue] = useAtom(inputValueAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)

  const runIdRef = useRef<string | null>(null)
  const pendingRunRef = useRef(false)
  const pendingEventsRef = useRef<WorkflowEvent[]>([])
  const listRunsRequestRef = useRef(0)
  const selectedProjectRef = useRef(selectedProject)
  selectedProjectRef.current = selectedProject

  const clearRunTracking = useCallback(() => {
    runIdRef.current = null
    pendingRunRef.current = false
    pendingEventsRef.current = []
  }, [])

  const processWorkflowEvent = useCallback((event: WorkflowEvent) => {
    switch (event.type) {
      case "node-start":
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
        setApprovalRequest({
          runId: event.runId,
          nodeId: event.nodeId,
          content: event.content,
          message: event.message,
          allowEdit: event.allowEdit,
        })
        break

      case "run-done":
        clearRunTracking()
        if (event.status === "completed") {
          toast.success("Run complete", {
            description: "Result is ready in Output.",
          })
        } else if (event.status === "failed" || event.status === "interrupted") {
          toast.error("Run failed", {
            description: "Check Output steps and logs for details.",
          })
        }
        setRunStatus(
          event.status === "completed" ? "done"
          : event.status === "cancelled" ? "idle"
          : "error"
        )
        setRunId(null)
        setActiveNodeId(null)
        setApprovalRequest(null)
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
  }, [clearRunTracking, setActiveNodeId, setNodeStates, setRunStatus, setRunId, setEvalResults, setRuntimeNodes, setRuntimeEdges, setRuntimeMeta, setApprovalRequest, setReportPath, setWorkspace, setPastRuns])

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
    if (runStatus === "running") return
    if (!workflow.nodes.length) return

    const inputNode = workflow.nodes.find((node) => node.type === "input")
    const inputConfig = (inputNode?.config || {}) as InputNodeConfig
    const resolvedInput = resolveWorkflowInput(inputValue, {
      inputType: inputConfig.inputType,
      required: inputConfig.required,
      defaultValue: inputConfig.defaultValue,
    })
    if (!resolvedInput.valid) return

    // Initialize node states
    const initialStates: Record<string, NodeState> = {}
    for (const node of workflow.nodes) {
      initialStates[node.id] = { status: "pending", attempts: 0, log: [] }
    }
    setNodeStates(initialStates)
    setEvalResults({})
    setRuntimeNodes([])
    setRuntimeEdges([])
    setRuntimeMeta({})
    setRunStatus("running")
    setActiveNodeId(null)
    setApprovalRequest(null)
    setFinalContent("")
    setReportPath(null)

    clearRunTracking()
    pendingRunRef.current = true
    setRunId(null)

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
        setRunStatus("idle")
        clearRunTracking()
        setRunId(null)
        setNodeStates({})
        setEvalResults({})
        setRuntimeNodes([])
        setRuntimeEdges([])
        setRuntimeMeta({})
        return
      }
      if (typeof result === "object" && "error" in result) {
        toast.error("Could not start run", {
          description: result.error,
        })
        setRunStatus("idle")
        clearRunTracking()
        setRunId(null)
        setNodeStates({})
        setEvalResults({})
        setRuntimeNodes([])
        setRuntimeEdges([])
        setRuntimeMeta({})
        return
      }
      runIdRef.current = result // filter to this run only
      setRunId(result)
      const bufferedEvents = pendingEventsRef.current
      pendingRunRef.current = false
      pendingEventsRef.current = []
      for (const event of bufferedEvents) {
        if (event.runId === result) {
          processWorkflowEvent(event)
        }
      }
    } catch (err) {
      console.error("[useChainExecution] runChain failed:", err)
      toast.error("Could not start run", {
        description: String(err),
      })
      setRunStatus("idle")
      clearRunTracking()
      setRunId(null)
      setApprovalRequest(null)
      setNodeStates({})
      setEvalResults({})
      setRuntimeNodes([])
      setRuntimeEdges([])
      setRuntimeMeta({})
    }
  }, [runStatus, workflow, inputValue, selectedProject, selectedWorkflowPath, webSearchBackend, setNodeStates, setEvalResults, setRuntimeNodes, setRuntimeEdges, setRuntimeMeta, setRunStatus, setActiveNodeId, setRunId, setFinalContent, setApprovalRequest, setReportPath, clearRunTracking, processWorkflowEvent])

  const cancel = useCallback(async () => {
    const currentRunId = runIdRef.current
    if (currentRunId) {
      try {
        await window.api.cancelRun(currentRunId)
      } catch (err) {
        console.error("[useChainExecution] cancelRun failed:", err)
        toast.error("Could not cancel run", {
          description: String(err),
        })
        return
      }
    }
    clearRunTracking()
    setRunStatus("idle")
    setRunId(null)
    setActiveNodeId(null)
    setApprovalRequest(null)
    setNodeStates({})
    setEvalResults({})
    setRuntimeNodes([])
    setRuntimeEdges([])
    setRuntimeMeta({})
    setReportPath(null)
    setWorkspace(null)
  }, [setRunStatus, setRunId, setActiveNodeId, setNodeStates, setEvalResults, setRuntimeNodes, setRuntimeEdges, setRuntimeMeta, setApprovalRequest, setReportPath, setWorkspace, clearRunTracking])

  const rerunFrom = useCallback(async (fromNodeId: string) => {
    if (runStatus === "running") return
    if (!workspace || !workflow.nodes.length) return

    const initialStates: Record<string, NodeState> = {}
    for (const node of workflow.nodes) {
      initialStates[node.id] = { status: "pending", attempts: 0, log: [] }
    }
    setNodeStates(initialStates)
    setEvalResults({})
    setRuntimeNodes([])
    setRuntimeEdges([])
    setRuntimeMeta({})
    setRunStatus("running")
    setActiveNodeId(null)
    setApprovalRequest(null)
    setFinalContent("")
    setReportPath(null)

    clearRunTracking()
    pendingRunRef.current = true
    setRunId(null)

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
      if (id) {
        runIdRef.current = id
        setRunId(id)
        const bufferedEvents = pendingEventsRef.current
        pendingRunRef.current = false
        pendingEventsRef.current = []
        for (const event of bufferedEvents) {
          if (event.runId === id) {
            processWorkflowEvent(event)
          }
        }
        return
      }
      toast.error("Could not restart from selected node")
    } catch (err) {
      console.error("[useChainExecution] rerunFrom failed:", err)
      toast.error("Could not restart from selected node", {
        description: String(err),
      })
    }

    clearRunTracking()
    setRunStatus("idle")
    setRunId(null)
    setApprovalRequest(null)
    setNodeStates({})
    setEvalResults({})
    setRuntimeNodes([])
    setRuntimeEdges([])
    setRuntimeMeta({})
  }, [runStatus, workspace, workflow, selectedProject, selectedWorkflowPath, webSearchBackend, setNodeStates, setEvalResults, setRuntimeNodes, setRuntimeEdges, setRuntimeMeta, setRunStatus, setActiveNodeId, setRunId, setApprovalRequest, setFinalContent, setReportPath, clearRunTracking, processWorkflowEvent])

  return { runStatus, nodeStates, activeNodeId, evalResults, workspace, run, cancel, rerunFrom }
}
