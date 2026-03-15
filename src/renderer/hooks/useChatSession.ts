import { useEffect, useCallback, useRef, useState } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  chatMessagesAtom,
  chatStatusAtom,
  chatSessionIdAtom,
  chatUndoStackAtom,
  currentWorkflowAtom,
  selectedWorkflowPathAtom,
  selectedProjectAtom,
  workflowSavedSnapshotAtom,
  type ChatMessageDisplay,
} from "@/lib/store"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import type { Workflow } from "@shared/types"
import { sanitizeAssistantText } from "@shared/chat-output"
import { toast } from "sonner"
import { useInboxNotifications } from "@/hooks/useInboxNotifications"

function isWorkflowPayload(value: unknown): value is Workflow {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<Workflow>
  if (typeof candidate.version !== "number" || typeof candidate.name !== "string") return false
  if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges)) return false
  return (
    candidate.nodes.every((node) => (
      !!node
      && typeof node.id === "string"
      && typeof node.type === "string"
      && !!node.config
      && typeof node.config === "object"
    ))
    && candidate.edges.every((edge) => (
      !!edge
      && typeof edge.id === "string"
      && typeof edge.source === "string"
      && typeof edge.target === "string"
      && typeof edge.type === "string"
    ))
  )
}

export function useChatSession() {
  const [messages, setMessages] = useAtom(chatMessagesAtom)
  const [status, setStatus] = useAtom(chatStatusAtom)
  const [sessionId, setSessionId] = useAtom(chatSessionIdAtom)
  const [undoStack, setUndoStack] = useAtom(chatUndoStackAtom)
  const setWorkflow = useSetAtom(currentWorkflowAtom)
  const setWorkflowSavedSnapshot = useSetAtom(workflowSavedSnapshotAtom)
  const [workflowPath] = useAtom(selectedWorkflowPathAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [workflow] = useAtom(currentWorkflowAtom)
  const [activeToolName, setActiveToolName] = useState<string | null>(null)
  const { addNotification } = useInboxNotifications()

  const streamingTextRef = useRef("")
  const workflowRef = useRef(workflow)
  const workflowPathRef = useRef(workflowPath)
  const historyRequestRef = useRef(0)
  const statusRef = useRef(status)
  const sessionIdRef = useRef(sessionId)
  const pendingSessionRef = useRef<string | null>(null)
  const localMessageCounterRef = useRef(0)
  workflowRef.current = workflow
  workflowPathRef.current = workflowPath
  statusRef.current = status
  sessionIdRef.current = sessionId

  const nextLocalMessageId = useCallback((prefix: string) => {
    localMessageCounterRef.current += 1
    return `${prefix}-${localMessageCounterRef.current}`
  }, [])

  const resetLocalSessionState = useCallback(() => {
    pendingSessionRef.current = null
    sessionIdRef.current = null
    streamingTextRef.current = ""
    statusRef.current = "idle"
    setStatus("idle")
    setSessionId(null)
    setActiveToolName(null)
  }, [setSessionId, setStatus])

  const removeStreamingPlaceholder = useCallback(() => {
    setMessages((prev) =>
      prev.filter((m) => !(m.role === "assistant" && m.streaming)),
    )
  }, [setMessages])

  // Subscribe to chat events
  useEffect(() => {
    const cleanup = window.api.onChatEvent((event) => {
      const currentSessionId = sessionIdRef.current

      if (currentSessionId) {
        if (event.sessionId !== currentSessionId) return
      } else {
        const canAcceptSession = statusRef.current === "thinking" || statusRef.current === "streaming"
        if (!canAcceptSession) return

        const pendingSessionId = pendingSessionRef.current
        if (pendingSessionId && pendingSessionId !== event.sessionId) return

        if (!pendingSessionId) {
          pendingSessionRef.current = event.sessionId
          sessionIdRef.current = event.sessionId
          setSessionId(event.sessionId)
        }
      }

      switch (event.type) {
        case "text-delta": {
          streamingTextRef.current += event.content
          setActiveToolName(null)
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            const displayContent = sanitizeAssistantText(streamingTextRef.current, { streaming: true })
            if (last && last.role === "assistant" && last.streaming) {
              return [
                ...prev.slice(0, -1),
                { ...last, content: displayContent },
              ]
            }
            return prev
          })
          statusRef.current = "streaming"
          setStatus("streaming")
          break
        }

        case "thinking": {
          statusRef.current = "thinking"
          setStatus("thinking")
          break
        }

        case "tool-call": {
          setActiveToolName(event.toolName)
          const toolMsg: ChatMessageDisplay = {
            id: nextLocalMessageId(`tc-${event.toolCallId}`),
            role: "tool_call",
            content: "",
            timestamp: Date.now(),
            toolName: event.toolName,
            toolInput: event.toolInput,
            toolCallId: event.toolCallId,
          }
          setMessages((prev) => [...prev, toolMsg])
          break
        }

        case "tool-result": {
          setActiveToolName(null)
          const resultMsg: ChatMessageDisplay = {
            id: nextLocalMessageId(`tr-${event.toolCallId}`),
            role: "tool_result",
            content: event.toolOutput || event.toolError || "",
            timestamp: Date.now(),
            toolName: event.toolName,
            toolCallId: event.toolCallId,
            toolOutput: event.toolOutput,
            toolError: event.toolError,
          }
          setMessages((prev) => [...prev, resultMsg])
          break
        }

        case "workflow-mutated": {
          if (!isWorkflowPayload(event.workflow)) {
            toast.error("Received an invalid workflow update from the Agent.")
            addNotification({
              title: "Agent sent an invalid workflow update",
              level: "error",
              source: "agent",
            })
            break
          }

          const nextWorkflow = event.workflow
          if (!workflowRef.current) {
            setWorkflow(nextWorkflow)
            break
          }

          // Push current workflow to undo stack before applying mutation.
          const snapshot = structuredClone(workflowRef.current)
          setUndoStack((prev) => [
            ...prev.slice(-19),
            snapshot,
          ])

          setWorkflow(nextWorkflow)

          const savePath = workflowPathRef.current
          if (savePath) {
            window.api.saveWorkflow(savePath, nextWorkflow)
              .then(() => setWorkflowSavedSnapshot(workflowSnapshot(nextWorkflow)))
              .catch((err: unknown) => console.error("[useChatSession] auto-save failed:", err))
          }

          const mutationWorkflowPath = workflowPathRef.current
          toast.success("Workflow updated from Agent", {
            action: {
              label: "Undo",
              onClick: () => {
                if (workflowPathRef.current !== mutationWorkflowPath) {
                  toast.error("Undo is only available for the current workflow")
                  return
                }
                setUndoStack((prev) => {
                  if (prev.length === 0) return prev
                  const last = prev[prev.length - 1]
                  if (last !== snapshot) return prev
                  setWorkflow(last)
                  return prev.slice(0, -1)
                })
              },
            },
            duration: 5000,
          })
          addNotification({
            title: "Workflow updated from Agent",
            description: workflowPathRef.current || undefined,
            level: "success",
            source: "agent",
          })
          break
        }

        case "message-complete": {
          streamingTextRef.current = ""
          const content = sanitizeAssistantText(event.message.content)
          setMessages((prev) => {
            const filtered = prev.filter(
              (m) => !(m.role === "assistant" && m.streaming),
            )
            if (!content.trim()) {
              return filtered
            }
            return [
              ...filtered,
              {
                id: event.message.id,
                role: "assistant",
                content,
                timestamp: event.message.timestamp,
              },
            ]
          })
          break
        }

        case "turn-complete": {
          removeStreamingPlaceholder()
          resetLocalSessionState()
          break
        }

        case "error": {
          removeStreamingPlaceholder()
          resetLocalSessionState()
          toast.error(event.content || "Agent error")
          addNotification({
            title: "Agent error",
            description: event.content || "Agent error",
            level: "error",
            source: "agent",
          })
          // Persist error in chat history as a system message
          setMessages((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              role: "assistant" as const,
              content: `**Agent error:** ${event.content || "Agent error"}`,
              timestamp: Date.now(),
            },
          ])
          break
        }
      }
    })

    return cleanup
  }, [addNotification, nextLocalMessageId, removeStreamingPlaceholder, resetLocalSessionState, setMessages, setSessionId, setStatus, setUndoStack, setWorkflow, setWorkflowSavedSnapshot])

  // Load history when workflow changes
  useEffect(() => {
    historyRequestRef.current += 1
    const requestId = historyRequestRef.current

    const activeSessionId = sessionIdRef.current || pendingSessionRef.current
    if (activeSessionId) {
      void window.api.chatCancel(activeSessionId).catch((err) => {
        console.error("[useChatSession] chatCancel on workflow switch failed:", err)
      })
    }

    resetLocalSessionState()
    setMessages([])
    setUndoStack([])

    if (!workflowPath) {
      return
    }

    window.api.chatLoadHistory(workflowPath).then((conversation) => {
      if (historyRequestRef.current !== requestId) return
      if (conversation && conversation.messages.length > 0) {
        setMessages(
          conversation.messages.flatMap((m) => {
            const content = m.role === "assistant"
              ? sanitizeAssistantText(m.content)
              : m.content

            if (m.role === "assistant" && !content.trim()) {
              return []
            }

            return [{
              id: m.id,
              role: m.role,
              content,
              timestamp: m.timestamp,
              toolName: m.toolName,
              toolInput: m.toolInput,
              toolCallId: m.toolCallId,
              toolOutput: m.toolOutput,
              toolError: m.toolError,
            }]
          }),
        )
      } else {
        setMessages([])
      }
    }).catch((err) => {
      if (historyRequestRef.current !== requestId) return
      console.error("[useChatSession] chatLoadHistory failed:", err)
      setMessages([])
      toast.error("Could not load Agent history")
      addNotification({
        title: "Could not load Agent history",
        description: String(err),
        level: "error",
        source: "agent",
      })
    })
  }, [addNotification, workflowPath, resetLocalSessionState, setMessages, setUndoStack])

  const sendMessage = useCallback(
    async (message: string) => {
      if (!workflowPath || !selectedProject || statusRef.current !== "idle") return

      // Add user message immediately.
      const userMsg: ChatMessageDisplay = {
        id: nextLocalMessageId("user"),
        role: "user",
        content: message,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, userMsg])

      // Add placeholder streaming message.
      streamingTextRef.current = ""
      pendingSessionRef.current = null
      sessionIdRef.current = null
      setSessionId(null)

      const streamingMsg: ChatMessageDisplay = {
        id: nextLocalMessageId("streaming"),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        streaming: true,
      }
      setMessages((prev) => [...prev, streamingMsg])
      statusRef.current = "thinking"
      setStatus("thinking")
      setActiveToolName(null)

      try {
        await window.api.chatSendMessage(
          workflowPath,
          message,
          selectedProject,
          workflowRef.current,
        )
      } catch (err) {
        resetLocalSessionState()
        // Remove optimistic user+streaming messages on immediate failure.
        setMessages((prev) =>
          prev.filter((m) => m.id !== userMsg.id && !(m.role === "assistant" && m.streaming)),
        )
        const msg = String(err).replace(
          /^Error: Error invoking remote method '[^']+': Error: /,
          "",
        )
        toast.error(msg)
        addNotification({
          title: "Agent request failed",
          description: msg,
          level: "error",
          source: "agent",
        })
      }
    },
    [addNotification, nextLocalMessageId, workflowPath, selectedProject, resetLocalSessionState, setMessages, setSessionId, setStatus],
  )

  const cancel = useCallback(async () => {
    const activeSessionId = sessionIdRef.current || pendingSessionRef.current
    if (activeSessionId) {
      try {
        await window.api.chatCancel(activeSessionId)
      } catch (err) {
        console.error("[useChatSession] chatCancel failed:", err)
      }
    }

    resetLocalSessionState()
    removeStreamingPlaceholder()
  }, [resetLocalSessionState, removeStreamingPlaceholder])

  const clearHistory = useCallback(async () => {
    if (!workflowPath) return

    const activeSessionId = sessionIdRef.current || pendingSessionRef.current
    if (!activeSessionId && statusRef.current !== "idle") {
      toast.error("Please wait for the Agent session to initialize before clearing history.")
      return
    }

    if (activeSessionId) {
      try {
        await window.api.chatCancel(activeSessionId)
      } catch (err) {
        console.error("[useChatSession] chatCancel before clear failed:", err)
        toast.error("Could not stop the active Agent before clearing history.")
        addNotification({
          title: "Could not stop the active Agent",
          description: String(err),
          level: "error",
          source: "agent",
        })
        return
      }
    }

    try {
      await window.api.chatClearHistory(workflowPath)
    } catch (err) {
      console.error("[useChatSession] chatClearHistory failed:", err)
      toast.error("Could not clear Agent history")
      addNotification({
        title: "Could not clear Agent history",
        description: String(err),
        level: "error",
        source: "agent",
      })
      return
    }

    resetLocalSessionState()
    removeStreamingPlaceholder()
    setMessages([])
    setUndoStack([])
  }, [addNotification, workflowPath, resetLocalSessionState, removeStreamingPlaceholder, setMessages, setUndoStack])

  const undo = useCallback(() => {
    if (statusRef.current !== "idle") return
    setUndoStack((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setWorkflow(last)
      return prev.slice(0, -1)
    })
  }, [setUndoStack, setWorkflow])

  return {
    messages,
    status,
    sessionId,
    undoStack,
    activeToolName,
    sendMessage,
    cancel,
    clearHistory,
    undo,
  }
}
