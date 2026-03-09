import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { buildClaudeExtraArgs, prepareWorkspaceMcpConfig } from "./mcp-config"

describe("buildClaudeExtraArgs", () => {
  it("adds mcp config path when provided", () => {
    expect(buildClaudeExtraArgs("/tmp/.mcp.json")).toEqual([
      "--verbose",
      "--output-format",
      "stream-json",
      "--mcp-config=/tmp/.mcp.json",
    ])
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
