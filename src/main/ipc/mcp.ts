import { ipcMain } from "electron"
import type { McpServerInfo, McpServerScope, ProviderId } from "@shared/types"
import { listPluginMcpServers } from "../lib/plugin-mcp"
import { setPluginMcpServerApproved } from "../lib/plugins"
import { resolveMcpProvider } from "../lib/providers"

export function registerMcpHandlers() {
  ipcMain.handle("mcp:list-servers", async (_event, provider: ProviderId, projectPath?: string) => {
    return resolveMcpProvider(provider).listServers(undefined, projectPath)
  })

  ipcMain.handle("mcp:list-all-servers", async (_event, provider: ProviderId) => {
    return resolveMcpProvider(provider).listAllServers?.() ?? []
  })

  ipcMain.handle("mcp:list-plugin-servers", async () => {
    return listPluginMcpServers()
  })

  ipcMain.handle(
    "mcp:add-server",
    async (_event, provider: ProviderId, server: McpServerInfo, projectPath?: string) => {
      return resolveMcpProvider(provider).addServer(server, projectPath)
    },
  )

  ipcMain.handle(
    "mcp:update-server",
    async (_event, provider: ProviderId, name: string, server: McpServerInfo, projectPath?: string) => {
      const mcpProvider = resolveMcpProvider(provider)
      if (!mcpProvider.updateServer) {
        throw new Error("MCP provider does not support server updates.")
      }
      return mcpProvider.updateServer(name, server, projectPath)
    },
  )

  ipcMain.handle(
    "mcp:remove-server",
    async (_event, provider: ProviderId, name: string, scope: McpServerScope, projectPath?: string) => {
      return resolveMcpProvider(provider).removeServer(name, scope, projectPath)
    },
  )

  ipcMain.handle(
    "mcp:toggle-server",
    async (
      _event,
      provider: ProviderId,
      name: string,
      scope: McpServerScope,
      disabled: boolean,
      projectPath?: string,
    ) => {
      return resolveMcpProvider(provider).toggleServer(name, scope, disabled, projectPath)
    },
  )

  ipcMain.handle(
    "mcp:test-server",
    async (_event, provider: ProviderId, name: string, scope: McpServerScope, projectPath?: string) => {
      return resolveMcpProvider(provider).testServer(name, scope, projectPath)
    },
  )

  ipcMain.handle(
    "mcp:discover-tools",
    async (_event, provider: ProviderId, serverName?: string, projectPath?: string) => {
      return resolveMcpProvider(provider).discoverTools(serverName, projectPath)
    },
  )

  ipcMain.handle("mcp:set-plugin-server-approved", async (_event, serverId: string, approved: boolean) => {
    return setPluginMcpServerApproved(serverId, approved)
  })
}
