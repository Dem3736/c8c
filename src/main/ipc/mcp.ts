import { ipcMain } from "electron"
import type { McpServerInfo, McpServerScope } from "@shared/types"
import {
  listMcpServers,
  listAllMcpServers,
  addMcpServer,
  updateMcpServer,
  removeMcpServer,
  toggleMcpServer,
  testMcpServer,
  discoverMcpTools,
} from "../lib/mcp-manager"

export function registerMcpHandlers() {
  ipcMain.handle("mcp:list-servers", async (_event, projectPath?: string) => {
    return listMcpServers(projectPath)
  })

  ipcMain.handle("mcp:list-all-servers", async () => {
    return listAllMcpServers()
  })

  ipcMain.handle(
    "mcp:add-server",
    async (_event, server: McpServerInfo, projectPath?: string) => {
      return addMcpServer(server, projectPath)
    },
  )

  ipcMain.handle(
    "mcp:update-server",
    async (_event, name: string, server: McpServerInfo, projectPath?: string) => {
      return updateMcpServer(name, server, projectPath)
    },
  )

  ipcMain.handle(
    "mcp:remove-server",
    async (_event, name: string, scope: McpServerScope, projectPath?: string) => {
      return removeMcpServer(name, scope, projectPath)
    },
  )

  ipcMain.handle(
    "mcp:toggle-server",
    async (_event, name: string, scope: McpServerScope, disabled: boolean, projectPath?: string) => {
      return toggleMcpServer(name, scope, disabled, projectPath)
    },
  )

  ipcMain.handle(
    "mcp:test-server",
    async (_event, name: string, scope: McpServerScope, projectPath?: string) => {
      return testMcpServer(name, scope, projectPath)
    },
  )

  ipcMain.handle(
    "mcp:discover-tools",
    async (_event, serverName?: string, projectPath?: string) => {
      return discoverMcpTools(serverName, projectPath)
    },
  )
}
