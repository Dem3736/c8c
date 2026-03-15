import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  buildClaudeExtraArgs,
  buildClaudeSdkMcpServers,
  buildProviderExtraArgs,
  prepareWorkspaceMcpConfig,
} from "./mcp-config"

describe("buildProviderExtraArgs", () => {
  it("adds mcp config path for Claude when provided", () => {
    expect(buildProviderExtraArgs("claude", "/tmp/.mcp.json")).toEqual([
      "--verbose",
      "--output-format",
      "stream-json",
      "--mcp-config=/tmp/.mcp.json",
    ])
  })

  it("keeps Claude alias behavior for existing callers", () => {
    expect(buildClaudeExtraArgs("/tmp/.mcp.json")).toEqual(
      buildProviderExtraArgs("claude", "/tmp/.mcp.json"),
    )
  })
})

describe("prepareWorkspaceMcpConfig", () => {
  it("copies project mcp config into workspace for builtin backend", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-config-test-"))
    const project = join(root, "project")
    const workspace = join(root, "workspace")
    await mkdir(project, { recursive: true })
    await mkdir(workspace, { recursive: true })

    await writeFile(
      join(project, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          local: {
            command: "node",
            args: ["./local-server.js"],
          },
        },
      }),
      "utf-8",
    )

    const path = await prepareWorkspaceMcpConfig(workspace, project, "builtin")
    expect(path).toBe(join(workspace, ".mcp.json"))
    const parsed = JSON.parse(await readFile(path!, "utf-8")) as {
      mcpServers: Record<string, { command: string }>
    }
    expect(parsed.mcpServers.local?.command).toBe("node")
  })

  it("injects exa proxy server for exa backend", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-config-test-"))
    const workspace = join(root, "workspace")
    await mkdir(workspace, { recursive: true })

    const path = await prepareWorkspaceMcpConfig(workspace, undefined, "exa")
    expect(path).toBe(join(workspace, ".mcp.json"))
    const parsed = JSON.parse(await readFile(path!, "utf-8")) as {
      mcpServers: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>
    }
    expect(parsed.mcpServers.exa).toBeDefined()
    expect(parsed.mcpServers.exa.command).toBe(process.execPath)
    expect(parsed.mcpServers.exa.args?.[0]).toContain("mcp-search-proxy")
    expect(parsed.mcpServers.exa.env?.ELECTRON_RUN_AS_NODE).toBe("1")
  })
})

describe("buildClaudeSdkMcpServers", () => {
  it("maps stdio and http servers from .mcp.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-sdk-test-"))
    const mcpPath = join(root, ".mcp.json")

    await writeFile(
      mcpPath,
      JSON.stringify({
        mcpServers: {
          stdioServer: {
            command: "node",
            args: ["./server.js"],
            env: {
              TOKEN: "secret",
              INVALID: 42,
            },
          },
          httpServer: {
            type: "http",
            url: "https://example.com/mcp",
            headers: {
              Authorization: "Bearer token",
            },
          },
          disabledServer: {
            command: "node",
            disabled: true,
          },
        },
      }),
      "utf-8",
    )

    expect(buildClaudeSdkMcpServers(mcpPath)).toEqual({
      stdioServer: {
        type: "stdio",
        command: "node",
        args: ["./server.js"],
        env: {
          TOKEN: "secret",
        },
      },
      httpServer: {
        type: "http",
        url: "https://example.com/mcp",
        headers: {
          Authorization: "Bearer token",
        },
      },
    })
  })
})
