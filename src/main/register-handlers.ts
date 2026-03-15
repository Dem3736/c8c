import type { BrowserWindow } from "electron"
import { registerIpcHandlers } from "./ipc/projects"
import { registerSkillsHandlers } from "./ipc/skills"
import { registerWorkflowsHandlers } from "./ipc/workflows"
import { registerExecutorHandlers } from "./ipc/executor"
import { registerLibrariesHandlers } from "./ipc/libraries"
import { registerTemplateHandlers } from "./ipc/templates"
import {
  registerSystemHandlers,
  setDesktopRuntimeWindowProvider,
} from "./ipc/system"
import { registerChatHandlers } from "./ipc/chat"
import { registerMcpHandlers } from "./ipc/mcp"
import { registerFilesHandlers } from "./ipc/files"

export function registerMainHandlers(
  getMainWindow: () => BrowserWindow | null,
): void {
  setDesktopRuntimeWindowProvider(getMainWindow)

  const handlers = [
    ["projects", registerIpcHandlers],
    ["skills", registerSkillsHandlers],
    ["workflows", registerWorkflowsHandlers],
    ["executor", registerExecutorHandlers],
    ["libraries", registerLibrariesHandlers],
    ["templates", registerTemplateHandlers],
    ["system", registerSystemHandlers],
    ["chat", registerChatHandlers],
    ["mcp", registerMcpHandlers],
    ["files", registerFilesHandlers],
  ] as const

  for (const [name, register] of handlers) {
    try {
      register()
      console.log(`[main] ✓ ${name} handlers registered`)
    } catch (error) {
      console.error(`[main] ✗ FAILED to register ${name} handlers:`, error)
    }
  }
}
