import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  decodeOpenClawResumeToken,
  encodeOpenClawResumeToken,
  loadWorkflow,
  parseOpenClawArgsJson,
} from "../../../packages/workflow-cli/src/index.js"

describe("openclaw cli helpers", () => {
  it("loads workflows from json files", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "c8c-openclaw-cli-json-"))
    const workflowPath = join(workspace, "workflow.json")

    await writeFile(workflowPath, JSON.stringify({
      version: 1,
      name: "JSON Workflow",
      nodes: [],
      edges: [],
    }), "utf-8")

    await expect(loadWorkflow(workflowPath)).resolves.toMatchObject({
      version: 1,
      name: "JSON Workflow",
    })
  })

  it("loads workflows from yaml files", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "c8c-openclaw-cli-yaml-"))
    const workflowPath = join(workspace, "workflow.yaml")

    await writeFile(workflowPath, [
      "version: 1",
      "name: YAML Workflow",
      "nodes: []",
      "edges: []",
      "",
    ].join("\n"), "utf-8")

    await expect(loadWorkflow(workflowPath)).resolves.toMatchObject({
      version: 1,
      name: "YAML Workflow",
    })
  })

  it("parses args-json payloads for tool mode", () => {
    expect(parseOpenClawArgsJson(undefined)).toEqual({})
    expect(parseOpenClawArgsJson("{\"input\":\"draft\",\"inputType\":\"text\",\"projectPath\":\"/tmp/project\",\"provider\":\"codex\"}")).toEqual({
      input: "draft",
      inputType: "text",
      projectPath: "/tmp/project",
      provider: "codex",
    })
  })

  it("rejects invalid args-json payloads", () => {
    expect(() => parseOpenClawArgsJson("[]")).toThrow("--args-json must decode to a JSON object")
    expect(() => parseOpenClawArgsJson("{\"provider\":\"openai\"}")).toThrow(
      "argsJson.provider must be one of: claude, codex",
    )
  })

  it("round-trips resume tokens", () => {
    const token = encodeOpenClawResumeToken({
      version: 1,
      workspace: "/tmp/workspace",
      nodeId: "approval-1",
    })

    expect(decodeOpenClawResumeToken(token)).toEqual({
      version: 1,
      workspace: "/tmp/workspace",
      nodeId: "approval-1",
    })
  })

  it("rejects malformed resume tokens", () => {
    const malformed = Buffer.from(JSON.stringify({ version: 1, workspace: "/tmp/workspace" }), "utf-8")
      .toString("base64url")

    expect(() => decodeOpenClawResumeToken(malformed)).toThrow("Invalid OpenClaw resume token")
  })
})
