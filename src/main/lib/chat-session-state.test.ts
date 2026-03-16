import { describe, expect, it } from "vitest"
import {
  applyChatEventToActiveSession,
  beginActiveChatSession,
  clearActiveChatSession,
  getActiveChatSessionSnapshot,
} from "./chat-session-state"
import type { ChatMessage } from "@shared/types"

describe("chat-session-state", () => {
  it("tracks streaming progress for an active session", () => {
    const workflowPath = "/tmp/demo.chain"
    const sessionId = "chat-1"
    const history: ChatMessage[] = [{
      id: "user-1",
      role: "user",
      content: "Build me a workflow",
      timestamp: 1,
    }]

    beginActiveChatSession(workflowPath, sessionId, history)

    applyChatEventToActiveSession({
      type: "thinking",
      sessionId,
      workflowPath,
    })
    applyChatEventToActiveSession({
      type: "text-delta",
      sessionId,
      workflowPath,
      content: "Working",
    })
    applyChatEventToActiveSession({
      type: "tool-call",
      sessionId,
      workflowPath,
      toolName: "synthesize_workflow",
      toolCallId: "call-1",
      toolInput: { request: "Build me a workflow" },
    })
    applyChatEventToActiveSession({
      type: "tool-result",
      sessionId,
      workflowPath,
      toolName: "synthesize_workflow",
      toolCallId: "call-1",
      toolOutput: "Created a workflow",
    })

    const snapshot = getActiveChatSessionSnapshot(workflowPath)
    expect(snapshot).not.toBeNull()
    expect(snapshot?.status).toBe("streaming")
    expect(snapshot?.activeToolName).toBeNull()
    expect(snapshot?.messages[0]?.role).toBe("user")
    expect(snapshot?.messages.some((message) => message.streaming && message.content === "Working")).toBe(true)
    expect(snapshot?.messages.some((message) => message.role === "tool_call")).toBe(true)
    expect(snapshot?.messages.some((message) => message.role === "tool_result")).toBe(true)

    clearActiveChatSession(sessionId)
  })

  it("removes the streaming placeholder when the assistant completes", () => {
    const workflowPath = "/tmp/complete.chain"
    const sessionId = "chat-2"

    beginActiveChatSession(workflowPath, sessionId, [{
      id: "user-1",
      role: "user",
      content: "Continue",
      timestamp: 1,
    }])

    applyChatEventToActiveSession({
      type: "text-delta",
      sessionId,
      workflowPath,
      content: "Done",
    })
    applyChatEventToActiveSession({
      type: "message-complete",
      sessionId,
      workflowPath,
      message: {
        id: "assistant-1",
        role: "assistant",
        content: "Final answer",
        timestamp: 2,
      },
    })

    const snapshot = getActiveChatSessionSnapshot(workflowPath)
    expect(snapshot?.messages.some((message) => message.streaming)).toBe(false)
    expect(snapshot?.messages.at(-1)?.content).toBe("Final answer")

    clearActiveChatSession(sessionId)
  })

  it("clears the workflow lookup when a session is removed", () => {
    const workflowPath = "/tmp/cleanup.chain"
    const sessionId = "chat-3"

    beginActiveChatSession(workflowPath, sessionId, [])
    clearActiveChatSession(sessionId)

    expect(getActiveChatSessionSnapshot(workflowPath)).toBeNull()
  })
})
