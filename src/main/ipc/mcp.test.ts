import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PluginMcpServerInfo } from "@shared/types"

const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>()
const resolveMcpProviderMock = vi.fn()
const listPluginMcpServersMock = vi.fn<() => Promise<PluginMcpServerInfo[]>>()
const setPluginMcpServerApprovedMock = vi.fn<(...args: unknown[]) => Promise<boolean>>(() => Promise.resolve(true))

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler)
    }),
  },
}))

vi.mock("../lib/providers", () => ({
  resolveMcpProvider: (...args: unknown[]) => resolveMcpProviderMock(...args),
}))

vi.mock("../lib/plugin-mcp", () => ({
  listPluginMcpServers: () => listPluginMcpServersMock(),
}))

vi.mock("../lib/plugins", () => ({
  setPluginMcpServerApproved: (...args: unknown[]) => setPluginMcpServerApprovedMock(...args),
}))

describe("mcp IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    ipcHandlers.clear()
    resolveMcpProviderMock.mockReturnValue({
      listServers: vi.fn(),
      listAllServers: vi.fn().mockResolvedValue([]),
      addServer: vi.fn(),
      updateServer: vi.fn(),
      removeServer: vi.fn(),
      toggleServer: vi.fn(),
      testServer: vi.fn(),
      discoverTools: vi.fn(),
    })
    listPluginMcpServersMock.mockResolvedValue([])
    setPluginMcpServerApprovedMock.mockResolvedValue(true)
  })

  it("lists plugin MCP servers through a dedicated handler", async () => {
    const pluginServers: PluginMcpServerInfo[] = [
      {
        id: "official/github/github",
        name: "github",
        type: "stdio",
        command: "npx",
        approved: true,
        pluginId: "official/github",
        pluginName: "GitHub",
        pluginPath: "/tmp/github",
        marketplaceId: "official",
        marketplaceName: "Official",
      },
    ]
    listPluginMcpServersMock.mockResolvedValue(pluginServers)

    const { registerMcpHandlers } = await import("./mcp")
    registerMcpHandlers()

    const handler = ipcHandlers.get("mcp:list-plugin-servers") as
      | ((event: unknown) => Promise<PluginMcpServerInfo[]>)
      | undefined
    expect(handler).toBeDefined()
    await expect(handler!(undefined)).resolves.toEqual(pluginServers)
  })

  it("persists plugin MCP approval state", async () => {
    const { registerMcpHandlers } = await import("./mcp")
    registerMcpHandlers()

    const handler = ipcHandlers.get("mcp:set-plugin-server-approved") as
      | ((event: unknown, serverId: string, approved: boolean) => Promise<boolean>)
      | undefined
    expect(handler).toBeDefined()

    await expect(handler!(undefined, "official/github/github", true)).resolves.toBe(true)
    expect(setPluginMcpServerApprovedMock).toHaveBeenCalledWith("official/github/github", true)
  })
})
