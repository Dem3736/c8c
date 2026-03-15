import { useEffect, useCallback, useRef } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  activeExecutionProviderAtom,
  activeNodeIdAtom,
  approvalRequestsAtom,
  createEmptyWorkflowExecutionState,
  currentWorkflowAtom,
  defaultProviderAtom,
  evalResultsAtom,
  inputAttachmentsAtom,
  inputValueAtom,
  nodeStatesAtom,
  pastRunsAtom,
  runIdAtom,
  runStatusAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  toWorkflowExecutionKey,
  updateWorkflowExecutionStateAtom,
  webSearchBackendAtom,
  workflowExecutionStatesAtom,
  workspaceAtom,
  type WorkflowExecutionState,
} from "@/lib/store"
import type { Workflow, WorkflowEvent, NodeState, InputNodeConfig, PermissionMode, RunResult } from "@shared/types"
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

function isRunInFlight(status: WorkflowExecutionState["runStatus"]): boolean {
  return status === "starting" || status === "running" || status === "paused" || status === "cancelling"
}

function withExecutionMode(workflow: Workflow, executionMode: PermissionMode): Workflow {
  return {
    ...workflow,
    defaults: {
      ...workflow.defaults,
      permissionMode: executionMode,
    },
  }
}

export function useChainExecution() {
  const [runStatus] = useAtom(runStatusAtom)
  const [runId] = useAtom(runIdAtom)
  const [nodeStates] = useAtom(nodeStatesAtom)
  const [activeNodeId] = useAtom(activeNodeIdAtom)
  const [workspace] = useAtom(workspaceAtom)
  const setPastRuns = useSetAtom(pastRunsAtom)
  const [evalResults] = useAtom(evalResultsAtom)
  const setApprovalRequests = useSetAtom(approvalRequestsAtom)
  const [workflow, setCurrentWorkflow] = useAtom(currentWorkflowAtom)
  const [inputValue] = useAtom(inputValueAtom)
  const [attachments] = useAtom(inputAttachmentsAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
  const [workflowExecutionStates] = useAtom(workflowExecutionStatesAtom)
  const [defaultProvider] = useAtom(defaultProviderAtom)
  const updateWorkflowExecutionState = useSetAtom(updateWorkflowExecutionStateAtom)
  const setActiveExecutionProvider = useSetAtom(activeExecutionProviderAtom)

  const workflowExecutionStatesRef = useRef(workflowExecutionStates)
  const runWorkflowKeysRef = useRef(new Map<string, string>())
  const bufferedEventsRef = useRef(new Map<string, WorkflowEvent[]>())
  const previousExecutionSnapshotsRef = useRef(new Map<string, WorkflowExecutionState>())
  const workflowSnapshotsRef = useRef(new Map<string, Workflow>())
  const listRunsRequestRef = useRef(0)
  const selectedProjectRef = useRef(selectedProject)

  workflowExecutionStatesRef.current = workflowExecutionStates
  selectedProjectRef.current = selectedProject

  const removeApprovalRequestsForRun = useCallback((runIdToClear: string | null | undefined) => {
    if (!runIdToClear) return
    setApprovalRequests((prev) => prev.filter((request) => request.runId !== runIdToClear))
  }, [setApprovalRequests])

  const clearRunTracking = useCallback((runIdToClear: string | null | undefined) => {
    if (!runIdToClear) return
    runWorkflowKeysRef.current.delete(runIdToClear)
    bufferedEventsRef.current.delete(runIdToClear)
    removeApprovalRequestsForRun(runIdToClear)
  }, [removeApprovalRequestsForRun])

  const updateExecutionForKey = useCallback((
    workflowKey: string,
    update: WorkflowExecutionState | ((previous: WorkflowExecutionState) => WorkflowExecutionState),
  ) => {
    updateWorkflowExecutionState({ key: workflowKey, update })
  }, [updateWorkflowExecutionState])

  const beginExecution = useCallback((
    targetWorkflow: Workflow,
    workflowPathForRun: string | null,
    projectPathForRun: string | null,
  ) => {
    const workflowKey = toWorkflowExecutionKey(workflowPathForRun)
    const previousState = workflowExecutionStatesRef.current[workflowKey] ?? createEmptyWorkflowExecutionState()
    previousExecutionSnapshotsRef.current.set(workflowKey, previousState)
    workflowSnapshotsRef.current.set(workflowKey, structuredClone(targetWorkflow))

    const initialStates: Record<string, NodeState> = {}
    for (const node of targetWorkflow.nodes) {
      initialStates[node.id] = { status: "pending", attempts: 0, log: [] }
    }

    updateExecutionForKey(workflowKey, (previous) => ({
      ...previous,
      runStatus: "starting",
      runOutcome: null,
      runStartedAt: Date.now(),
      completedAt: null,
      runId: null,
      runWorkflowPath: workflowPathForRun,
      workflowName: targetWorkflow.name?.trim() || "Untitled workflow",
      projectPath: projectPathForRun,
      lastError: null,
      workflowSnapshot: structuredClone(targetWorkflow),
      nodeStates: initialStates,
      activeNodeId: null,
      evalResults: {},
      finalContent: "",
      reportPath: null,
      runtimeNodes: [],
      runtimeEdges: [],
      runtimeMeta: {},
    }))

    return workflowKey
  }, [updateExecutionForKey])

  const rollbackExecutionStart = useCallback((workflowKey: string) => {
    const previousState = previousExecutionSnapshotsRef.current.get(workflowKey) ?? createEmptyWorkflowExecutionState()
    previousExecutionSnapshotsRef.current.delete(workflowKey)
    workflowSnapshotsRef.current.delete(workflowKey)
    updateExecutionForKey(workflowKey, previousState)
  }, [updateExecutionForKey])

  const processWorkflowEvent = useCallback((event: WorkflowEvent) => {
    const workflowKey = runWorkflowKeysRef.current.get(event.runId)
    if (!workflowKey) {
      const buffered = bufferedEventsRef.current.get(event.runId) ?? []
      buffered.push(event)
      bufferedEventsRef.current.set(event.runId, buffered)
      return
    }

    const workflowSnapshot = workflowSnapshotsRef.current.get(workflowKey)

    switch (event.type) {
      case "node-start":
        updateExecutionForKey(workflowKey, (previous) => ({
          ...previous,
          runStatus: "running",
          activeNodeId: event.nodeId,
          nodeStates: {
            ...previous.nodeStates,
            [event.nodeId]: {
              ...previous.nodeStates[event.nodeId],
              status: "running",
              log: previous.nodeStates[event.nodeId]?.log || [],
              attempts: previous.nodeStates[event.nodeId]?.attempts || 0,
            },
          },
        }))
        break

      case "node-log":
        updateExecutionForKey(workflowKey, (previous) => ({
          ...previous,
          nodeStates: {
            ...previous.nodeStates,
            [event.nodeId]: {
              ...previous.nodeStates[event.nodeId],
              log: [...(previous.nodeStates[event.nodeId]?.log || []), event.entry],
            },
          },
        }))
        break

      case "node-done":
        updateExecutionForKey(workflowKey, (previous) => {
          const isOutputNode = workflowSnapshot?.nodes.some((node) => node.id === event.nodeId && node.type === "output") ?? false
          return {
            ...previous,
            finalContent: isOutputNode && event.output?.content ? event.output.content : previous.finalContent,
            nodeStates: {
              ...previous.nodeStates,
              [event.nodeId]: {
                ...previous.nodeStates[event.nodeId],
                status: "completed",
                output: event.output,
              },
            },
          }
        })
        break

      case "node-error":
        if (event.nodeId === "__global") {
          updateExecutionForKey(workflowKey, (previous) => ({
            ...previous,
            runStatus: "error",
            activeNodeId: null,
            lastError: event.error || "Workflow execution failed.",
          }))
          toast.error("Run failed", {
            description: event.error || "Workflow execution failed.",
          })
          break
        }

        updateExecutionForKey(workflowKey, (previous) => ({
          ...previous,
          lastError: event.error || previous.lastError,
          nodeStates: {
            ...previous.nodeStates,
            [event.nodeId]: {
              ...previous.nodeStates[event.nodeId],
              status: "failed",
              error: event.error,
            },
          },
        }))
        break

      case "eval-result":
        updateExecutionForKey(workflowKey, (previous) => ({
          ...previous,
          evalResults: {
            ...previous.evalResults,
            [event.nodeId]: [
              ...(previous.evalResults[event.nodeId] || []),
              {
                attempt: event.attempt,
                score: event.score,
                reason: event.reason,
                passed: event.passed,
                fix_instructions: event.fix_instructions,
                criteria: event.criteria,
              },
            ],
          },
        }))
        break

      case "nodes-expanded": {
        const graphNodeIds = new Set(event.nodes.map((node) => node.id))
        updateExecutionForKey(workflowKey, (previous) => {
          const nextNodeStates = { ...previous.nodeStates }
          for (const nodeId of Object.keys(nextNodeStates)) {
            if (!graphNodeIds.has(nodeId)) {
              delete nextNodeStates[nodeId]
            }
          }
          for (const nodeId of event.newNodeIds) {
            if (!nextNodeStates[nodeId]) {
              nextNodeStates[nodeId] = { status: "pending", attempts: 0, log: [] }
            }
          }
          return {
            ...previous,
            nodeStates: nextNodeStates,
            runtimeNodes: event.nodes,
            runtimeEdges: event.edges,
            runtimeMeta: event.runtimeMeta,
          }
        })
        break
      }

      case "approval-requested":
        updateExecutionForKey(workflowKey, (previous) => ({
          ...previous,
          nodeStates: {
            ...previous.nodeStates,
            [event.nodeId]: {
              ...previous.nodeStates[event.nodeId],
              status: "waiting_approval",
            },
          },
        }))
        setApprovalRequests((previous) => [
          ...previous.filter((request) => !(request.runId === event.runId && request.nodeId === event.nodeId)),
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
        clearRunTracking(event.runId)
        previousExecutionSnapshotsRef.current.delete(workflowKey)
        workflowSnapshotsRef.current.delete(workflowKey)
        updateExecutionForKey(workflowKey, (previous) => ({
          ...previous,
          runStatus: event.status === "completed" || event.status === "cancelled" ? "done" : "error",
          runOutcome: event.status,
          runStartedAt: null,
          completedAt: Date.now(),
          runId: null,
          runWorkflowPath: null,
          activeNodeId: null,
          reportPath: event.reportPath || previous.reportPath,
          workspace: event.workspace || previous.workspace,
        }))
        if (selectedProjectRef.current) {
          const requestId = ++listRunsRequestRef.current
          window.api.listRuns(selectedProjectRef.current).then((runs) => {
            if (listRunsRequestRef.current !== requestId) return
            setPastRuns(runs)
          }).catch((error) => {
            if (listRunsRequestRef.current !== requestId) return
            console.error("[useChainExecution] listRuns after run-done failed:", error)
          })
        }
        break
    }
  }, [clearRunTracking, setApprovalRequests, setPastRuns, updateExecutionForKey])

  const finishStartWithRunId = useCallback((startedRunId: string, workflowKey: string) => {
    runWorkflowKeysRef.current.set(startedRunId, workflowKey)
    previousExecutionSnapshotsRef.current.delete(workflowKey)
    updateExecutionForKey(workflowKey, (previous) => ({
      ...previous,
      runId: startedRunId,
    }))

    const bufferedEvents = bufferedEventsRef.current.get(startedRunId) ?? []
    bufferedEventsRef.current.delete(startedRunId)
    for (const event of bufferedEvents) {
      processWorkflowEvent(event)
    }
  }, [processWorkflowEvent, updateExecutionForKey])

  useEffect(() => {
    const unsubscribe = window.api.onWorkflowEvent((event: WorkflowEvent) => {
      processWorkflowEvent(event)
    })

    return unsubscribe
  }, [processWorkflowEvent])

  useEffect(() => {
    if (!selectedProject) return

    const requestId = ++listRunsRequestRef.current
    window.api.listRuns(selectedProject).then((runs) => {
      if (listRunsRequestRef.current !== requestId) return
      setPastRuns(runs)
    }).catch((error) => {
      if (listRunsRequestRef.current !== requestId) return
      console.error("[useChainExecution] listRuns on project change failed:", error)
    })
  }, [selectedProject, setPastRuns])

  const run = useCallback(async (executionMode: PermissionMode = "edit") => {
    if (isRunInFlight(runStatus)) return
    if (!workflow.nodes.length) return

    const inputNode = workflow.nodes.find((node) => node.type === "input")
    const inputConfig = (inputNode?.config || {}) as InputNodeConfig
    const resolvedInput = resolveWorkflowInput(inputValue, {
      inputType: inputConfig.inputType,
      required: inputConfig.required,
      defaultValue: inputConfig.defaultValue,
    })
    if (!resolvedInput.valid) return

    let assembledValue = resolvedInput.value
    if (attachments.length > 0) {
      const sections = await Promise.all(
        attachments.map(async (attachment) => {
          if (attachment.kind === "file") {
            try {
              const result = await window.api.readFileContent(attachment.path, selectedProject!)
              return `## Attached File: ${attachment.name}\nPath: ${attachment.path}\n\`\`\`\n${result.content}${result.truncated ? "\n[truncated]" : ""}\n\`\`\``
            } catch {
              return `## Attached File: ${attachment.name}\n\n[Could not read file]`
            }
          }
          if (attachment.kind === "run") {
            try {
              const result = await window.api.loadRunResult(attachment.workspace)
              return `## Previous Run Output: ${attachment.workflowName}\nRun workspace: ${attachment.workspace}\n\n${result?.reportContent || "[No output available]"}`
            } catch {
              return `## Previous Run Output: ${attachment.workflowName}\n\n[Could not load run output]`
            }
          }
          return `## ${attachment.label}\n\n${attachment.content}`
        }),
      )
      assembledValue = [resolvedInput.value, "\n---\n# Attachments\n", ...sections].join("\n\n")
    }

    const workflowForRun = withExecutionMode(workflow, executionMode)
    const workflowKey = beginExecution(workflowForRun, selectedWorkflowPath ?? null, selectedProject ?? null)
    setActiveExecutionProvider(workflowForRun.defaults?.provider || defaultProvider)
    const looksResearch = isResearchLikeWorkflow(workflow as unknown as { name: string; description?: string; nodes: Array<{ type: string; config: Record<string, unknown> }> })
    const workflowForExecution = applyWebSearchBackendPreset(
      workflowForRun,
      looksResearch ? "research" : "operations",
      webSearchBackend,
    )

    try {
      const result = await window.api.runChain(
        workflowForExecution,
        { type: resolvedInput.type, value: assembledValue },
        selectedProject ?? undefined,
        selectedWorkflowPath ?? undefined,
        webSearchBackend,
      )
      if (!result) {
        toast.error("Could not start run", {
          description: "No active window is available for execution.",
        })
        rollbackExecutionStart(workflowKey)
        return
      }
      if (typeof result === "object" && "error" in result) {
        toast.error("Could not start run", {
          description: result.error,
        })
        rollbackExecutionStart(workflowKey)
        return
      }
      finishStartWithRunId(result, workflowKey)
    } catch (error) {
      console.error("[useChainExecution] runChain failed:", error)
      toast.error("Could not start run", {
        description: String(error),
      })
      rollbackExecutionStart(workflowKey)
    }
  }, [
    attachments,
    beginExecution,
    defaultProvider,
    finishStartWithRunId,
    inputValue,
    rollbackExecutionStart,
    runStatus,
    selectedProject,
    selectedWorkflowPath,
    setActiveExecutionProvider,
    webSearchBackend,
    workflow,
  ])

  const cancel = useCallback(async () => {
    const workflowKey = toWorkflowExecutionKey(selectedWorkflowPath)
    if (!isRunInFlight(runStatus)) return

    updateExecutionForKey(workflowKey, (previous) => ({
      ...previous,
      runStatus: "cancelling",
    }))

    if (runId) {
      try {
        await window.api.cancelRun(runId)
      } catch (error) {
        console.error("[useChainExecution] cancelRun failed:", error)
        toast.error("Could not cancel run", {
          description: String(error),
        })
        updateExecutionForKey(workflowKey, (previous) => ({
          ...previous,
          runStatus: "running",
        }))
        return
      }
    }

    clearRunTracking(runId)
    previousExecutionSnapshotsRef.current.delete(workflowKey)
    workflowSnapshotsRef.current.delete(workflowKey)
    updateExecutionForKey(workflowKey, (previous) => {
      const nextNodeStates = { ...previous.nodeStates }
      for (const [nodeId, state] of Object.entries(nextNodeStates)) {
        if (state.status === "running" || state.status === "queued" || state.status === "waiting_approval") {
          nextNodeStates[nodeId] = { ...state, status: "skipped" }
        }
      }
      return {
        ...previous,
        runStatus: "done",
        runStartedAt: null,
        runId: null,
        runWorkflowPath: null,
        activeNodeId: null,
        nodeStates: nextNodeStates,
      }
    })
  }, [clearRunTracking, runId, runStatus, selectedWorkflowPath, updateExecutionForKey])

  const rerunFrom = useCallback(async (fromNodeId: string) => {
    if (isRunInFlight(runStatus)) return
    if (!workspace || !workflow.nodes.length) return

    const workflowKeyForRun = toWorkflowExecutionKey(selectedWorkflowPath ?? null)
    const workflowForRun = workflowExecutionStatesRef.current[workflowKeyForRun]?.workflowSnapshot ?? workflow
    const workflowKey = beginExecution(workflowForRun, selectedWorkflowPath ?? null, selectedProject ?? null)
    setActiveExecutionProvider(workflowForRun.defaults?.provider || defaultProvider)
    const looksResearch = isResearchLikeWorkflow(workflowForRun as unknown as { name: string; description?: string; nodes: Array<{ type: string; config: Record<string, unknown> }> })
    const workflowForExecution = applyWebSearchBackendPreset(
      workflowForRun,
      looksResearch ? "research" : "operations",
      webSearchBackend,
    )

    try {
      const result = await window.api.rerunFrom(
        fromNodeId,
        workflowForExecution,
        workspace,
        selectedProject ?? undefined,
        selectedWorkflowPath ?? undefined,
        webSearchBackend,
      )
      if (typeof result === "string") {
        finishStartWithRunId(result, workflowKey)
        return
      }
      if (result && typeof result === "object" && "error" in result) {
        toast.error("Could not restart from selected node", {
          description: result.error,
        })
        rollbackExecutionStart(workflowKey)
        return
      }
      toast.error("Could not restart from selected node")
    } catch (error) {
      console.error("[useChainExecution] rerunFrom failed:", error)
      toast.error("Could not restart from selected node", {
        description: String(error),
      })
    }

    rollbackExecutionStart(workflowKey)
  }, [
    beginExecution,
    defaultProvider,
    finishStartWithRunId,
    rollbackExecutionStart,
    runStatus,
    selectedProject,
    selectedWorkflowPath,
    setActiveExecutionProvider,
    webSearchBackend,
    workflow,
    workspace,
  ])

  const continueRun = useCallback(async (runToContinue: RunResult) => {
    if (isRunInFlight(runStatus)) return
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
      } catch (error) {
        toast.error("Could not continue run", {
          description: `Failed to load workflow file: ${String(error)}`,
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

    const workflowKey = beginExecution(workflowForRun, workflowPathForRun, selectedProject ?? null)
    setActiveExecutionProvider(workflowForRun.defaults?.provider || defaultProvider)
    updateExecutionForKey(workflowKey, (previous) => ({
      ...previous,
      workspace: runToContinue.workspace,
    }))

    const looksResearch = isResearchLikeWorkflow(workflowForRun as unknown as { name: string; description?: string; nodes: Array<{ type: string; config: Record<string, unknown> }> })
    const workflowForExecution = applyWebSearchBackendPreset(
      workflowForRun,
      looksResearch ? "research" : "operations",
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
        finishStartWithRunId(result, workflowKey)
        return
      }

      if (result && typeof result === "object" && "error" in result) {
        toast.error("Could not continue run", {
          description: result.error,
        })
        rollbackExecutionStart(workflowKey)
        return
      }

      toast.error("Could not continue run", {
        description: "No active window is available for execution.",
      })
    } catch (error) {
      console.error("[useChainExecution] continueRun failed:", error)
      toast.error("Could not continue run", {
        description: String(error),
      })
    }

    rollbackExecutionStart(workflowKey)
  }, [
    beginExecution,
    defaultProvider,
    finishStartWithRunId,
    rollbackExecutionStart,
    runStatus,
    selectedProject,
    selectedWorkflowPath,
    setCurrentWorkflow,
    setActiveExecutionProvider,
    setSelectedWorkflowPath,
    updateExecutionForKey,
    webSearchBackend,
    workflow,
  ])

  return { runStatus, nodeStates, activeNodeId, evalResults, workspace, run, cancel, rerunFrom, continueRun }
}
