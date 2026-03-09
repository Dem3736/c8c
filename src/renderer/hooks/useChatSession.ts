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
import { toast } from "sonner"

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
            if (last && last.role === "assistant" && last.streaming) {
              return [
                ...prev.slice(0, -1),
                { ...last, content: streamingTextRef.current },
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
          if (!workflowRef.current) {
            setWorkflow(event.workflow)
            break
          }

          // Push current workflow to undo stack before applying mutation.
          setUndoStack((prev) => [
            ...prev.slice(-19),
            structuredClone(workflowRef.current),
          ])

          setWorkflow(event.workflow)

          const savePath = workflowPathRef.current
          if (savePath) {
            window.api.saveWorkflow(savePath, event.workflow)
              .then(() => setWorkflowSavedSnapshot(workflowSnapshot(event.workflow)))
              .catch((err: unknown) => console.error("[useChatSession] auto-save failed:", err))
          }

          const mutationWorkflowPath = workflowPathRef.current
          toast.success("Workflow updated", {
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
                  setWorkflow(last)
                  return prev.slice(0, -1)
                })
              },
            },
            duration: 5000,
          })
          break
        }

        case "message-complete": {
          streamingTextRef.current = ""
          setMessages((prev) => {
            const filtered = prev.filter(
              (m) => !(m.role === "assistant" && m.streaming),
            )
            return [
              ...filtered,
              {
                id: event.message.id,
                role: "assistant",
                content: event.message.content,
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
          toast.error(event.content || "Chat error")
          break
        }
      }
    })

    return cleanup
  }, [nextLocalMessageId, removeStreamingPlaceholder, resetLocalSessionState, setMessages, setSessionId, setStatus, setUndoStack, setWorkflow, setWorkflowSavedSnapshot])

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
          conversation.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
            toolName: m.toolName,
            toolInput: m.toolInput,
            toolCallId: m.toolCallId,
            toolOutput: m.toolOutput,
            toolError: m.toolError,
          })),
        )
      } else {
        setMessages([])
      }
    }).catch((err) => {
      if (historyRequestRef.current !== requestId) return
      console.error("[useChatSession] chatLoadHistory failed:", err)
      setMessages([])
      toast.error("Could not load chat history")
    })
  }, [workflowPath, resetLocalSessionState, setMessages, setUndoStack])

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
      }
    },
    [nextLocalMessageId, workflowPath, selectedProject, resetLocalSessionState, setMessages, setSessionId, setStatus],
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
    if (statusRef.current !== "idle") return
    if (!workflowPath) return

    const activeSessionId = sessionIdRef.current || pendingSessionRef.current
    if (activeSessionId) {
      try {
        await window.api.chatCancel(activeSessionId)
      } catch (err) {
        console.error("[useChatSession] chatCancel before clear failed:", err)
      }
    }

    try {
      await window.api.chatClearHistory(workflowPath)
    } catch (err) {
      console.error("[useChatSession] chatClearHistory failed:", err)
      toast.error("Could not clear chat history")
      return
    }

    resetLocalSessionState()
    setMessages([])
    setUndoStack([])
  }, [workflowPath, resetLocalSessionState, setMessages, setUndoStack])

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
