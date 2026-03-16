import { ipcMain, BrowserWindow } from "electron"
import { handleChatMessage, cancelChatSession, getActiveChatSession } from "../lib/chat-agent"
import { loadChatHistory, clearChatHistory } from "../lib/chat-storage"
import type { ChatConversation, ChatSessionSnapshot, Workflow } from "@shared/types"
import { resolve, extname } from "node:path"
import { allowedProjectRoots, allowedWorkflowRoots, assertWithinRoots } from "../lib/security-paths"

async function assertWorkflowPath(workflowPath: string): Promise<string> {
  const resolvedPath = resolve(workflowPath)
  const extension = extname(resolvedPath).toLowerCase()
  if (extension !== ".chain" && extension !== ".yaml" && extension !== ".yml") {
    throw new Error("Workflow path must point to a .chain/.yaml/.yml file")
  }
  const workflowRoots = await allowedWorkflowRoots()
  return assertWithinRoots(resolvedPath, workflowRoots, "Workflow path")
}

async function assertProjectPath(projectPath: string): Promise<string> {
  const resolvedPath = resolve(projectPath)
  const allowedRoots = await allowedProjectRoots()
  if (!allowedRoots.some((root) => root === resolvedPath)) {
    throw new Error("Project path is not registered")
  }
  return resolvedPath
}

export function registerChatHandlers() {
  console.log("[chat] registering chat IPC handlers...")

  ipcMain.handle(
    "chat:send-message",
    async (
      event,
      workflowPath: string,
      message: string,
      projectPath: string,
      currentWorkflow: Workflow,
    ): Promise<string> => {
      const safeWorkflowPath = await assertWorkflowPath(workflowPath)
      const safeProjectPath = await assertProjectPath(projectPath)
      console.log("[chat] chat:send-message called", {
        workflowPath: safeWorkflowPath,
        message: message.slice(0, 100),
        projectPath: safeProjectPath,
        hasWorkflow: !!currentWorkflow,
        nodeCount: currentWorkflow?.nodes?.length ?? 0,
      })
      try {
        const window = BrowserWindow.fromWebContents(event.sender)
        const sessionId = await handleChatMessage(
          safeWorkflowPath,
          message,
          safeProjectPath,
          currentWorkflow,
          window && !window.isDestroyed() ? window : null,
        )
        console.log("[chat] chat:send-message completed, sessionId:", sessionId)
        return sessionId
      } catch (err) {
        console.error("[chat] chat:send-message error:", err)
        throw err
      }
    },
  )

  ipcMain.handle(
    "chat:load-history",
    async (_event, workflowPath: string): Promise<ChatConversation | null> => {
      const safeWorkflowPath = await assertWorkflowPath(workflowPath)
      console.log("[chat] chat:load-history called", { workflowPath: safeWorkflowPath })
      return loadChatHistory(safeWorkflowPath)
    },
  )

  ipcMain.handle(
    "chat:get-active-session",
    async (_event, workflowPath: string): Promise<ChatSessionSnapshot | null> => {
      const safeWorkflowPath = await assertWorkflowPath(workflowPath)
      console.log("[chat] chat:get-active-session called", { workflowPath: safeWorkflowPath })
      return getActiveChatSession(safeWorkflowPath)
    },
  )

  ipcMain.handle(
    "chat:cancel",
    async (_event, sessionId: string): Promise<boolean> => {
      console.log("[chat] chat:cancel called", { sessionId })
      return cancelChatSession(sessionId)
    },
  )

  ipcMain.handle(
    "chat:clear-history",
    async (_event, workflowPath: string): Promise<void> => {
      const safeWorkflowPath = await assertWorkflowPath(workflowPath)
      console.log("[chat] chat:clear-history called", { workflowPath: safeWorkflowPath })
      return clearChatHistory(safeWorkflowPath)
    },
  )

  console.log("[chat] all chat IPC handlers registered OK")
}
