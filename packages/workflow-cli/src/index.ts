#!/usr/bin/env node

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import {
  createWorkflowRunner,
  type ProviderId,
  type Workflow,
  type WorkflowEvent,
  type WorkflowInput,
  type WorkflowRunHandle,
  type WorkflowRunSummary,
} from "@c8c/workflow-runner"
import { prepareWorkspaceMcpConfig } from "../../../src/main/lib/mcp-config.js"
import { ClaudeAgentProvider } from "../../../src/main/lib/providers/claude-agent-provider.js"
import { CodexAgentProvider } from "../../../src/main/lib/providers/codex-agent-provider.js"
import { scanAllSkills } from "../../../src/main/lib/skill-scanner.js"

type Command = "run" | "resume" | "rerun-from" | "inspect" | "events" | "help"

interface CliFlags {
  provider?: ProviderId
  input?: string
  inputFile?: string
  inputType?: WorkflowInput["type"]
  project?: string
  json?: boolean
  jsonl?: boolean
  autoApprove?: boolean
}

const claudeAgentProvider = new ClaudeAgentProvider()
const codexAgentProvider = new CodexAgentProvider()

function resolveAgentProvider(providerId: ProviderId) {
  if (providerId === "claude") return claudeAgentProvider
  if (providerId === "codex") return codexAgentProvider
  throw new Error(`Unsupported provider: ${providerId}`)
}

function printUsage(): void {
  console.log(`Usage:
  c8c-workflow run <workflow.chain> [--input TEXT | --input-file PATH] [--input-type text|url|directory] [--project PATH] [--provider claude|codex] [--json] [--jsonl] [--auto-approve]
  c8c-workflow resume <workflow.chain> <workspace> [--project PATH] [--provider claude|codex] [--json] [--jsonl] [--auto-approve]
  c8c-workflow rerun-from <workflow.chain> <workspace> <nodeId> [--project PATH] [--provider claude|codex] [--json] [--jsonl] [--auto-approve]
  c8c-workflow inspect <workspace>
  c8c-workflow events <workspace>`)
}

function parseFlags(args: string[]): { positional: string[]; flags: CliFlags } {
  const positional: string[] = []
  const flags: CliFlags = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith("--")) {
      positional.push(arg)
      continue
    }

    const next = args[i + 1]
    switch (arg) {
      case "--provider":
        if (next === "claude" || next === "codex") {
          flags.provider = next
          i++
        }
        break
      case "--input":
        flags.input = next || ""
        i++
        break
      case "--input-file":
        flags.inputFile = next || ""
        i++
        break
      case "--input-type":
        if (next === "text" || next === "url" || next === "directory") {
          flags.inputType = next
          i++
        }
        break
      case "--project":
        flags.project = next || ""
        i++
        break
      case "--json":
        flags.json = true
        break
      case "--jsonl":
        flags.jsonl = true
        break
      case "--auto-approve":
        flags.autoApprove = true
        break
    }
  }

  return { positional, flags }
}

async function loadWorkflow(filePath: string): Promise<Workflow> {
  const resolved = resolve(filePath)
  const raw = await readFile(resolved, "utf-8")
  return JSON.parse(raw) as Workflow
}

async function loadInput(flags: CliFlags): Promise<WorkflowInput> {
  if (flags.inputFile) {
    const content = await readFile(resolve(flags.inputFile), "utf-8")
    return { type: flags.inputType || "text", value: content }
  }
  return {
    type: flags.inputType || "text",
    value: flags.input || "",
  }
}

function renderEventHuman(event: WorkflowEvent): string {
  switch (event.type) {
    case "node-start":
      return `start ${event.nodeId}`
    case "node-done":
      return `done ${event.nodeId}`
    case "node-error":
      return `error ${event.nodeId}: ${event.error}`
    case "node-log":
      return `log ${event.nodeId}: ${event.entry.type}`
    case "eval-result":
      return `eval ${event.nodeId}: ${event.score} (${event.passed ? "pass" : "fail"})`
    case "nodes-expanded":
      return `expanded ${event.newNodeIds.length} nodes`
    case "approval-requested":
      return `approval ${event.nodeId}`
    case "run-done":
      return `run ${event.status}`
  }
}

async function streamEvents(
  runner: ReturnType<typeof createWorkflowRunner>,
  handle: WorkflowRunHandle,
  flags: CliFlags,
): Promise<boolean> {
  let approvalRequired = false

  for await (const event of handle.events) {
    if (flags.jsonl) {
      process.stdout.write(`${JSON.stringify(event)}\n`)
    } else if (!flags.json) {
      process.stdout.write(`${renderEventHuman(event)}\n`)
    }

    if (event.type === "approval-requested") {
      if (flags.autoApprove) {
        await runner.resolveApproval({
          runId: event.runId,
          nodeId: event.nodeId,
          approved: true,
        })
      } else {
        approvalRequired = true
        await runner.resolveApproval({
          runId: event.runId,
          nodeId: event.nodeId,
          approved: false,
        })
      }
    }
  }

  return approvalRequired
}

function summaryExitCode(summary: WorkflowRunSummary, approvalRequired: boolean): number {
  if (approvalRequired) return 4
  if (summary.status === "completed") return 0
  if (summary.status === "cancelled") return 2
  if (summary.status === "interrupted") return 3
  return 1
}

async function readJsonMaybe<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(resolve(filePath), "utf-8")) as T
  } catch {
    return null
  }
}

async function runCommand(command: Command, args: string[]): Promise<number> {
  const { positional, flags } = parseFlags(args)
  const runner = createWorkflowRunner({
    startProviderTask(providerId, options) {
      return resolveAgentProvider(providerId).executeTask(options)
    },
    resolveWorkflowProviderId(workflow) {
      return Promise.resolve(flags.provider || workflow.defaults?.provider || "claude")
    },
    resolveNodeProviderId(_node, workflow) {
      return Promise.resolve(flags.provider || workflow.defaults?.provider || "claude")
    },
    prepareWorkspaceMcpConfig,
    scanSkills: scanAllSkills,
  })

  if (command === "inspect") {
    const workspace = positional[0]
    if (!workspace) throw new Error("inspect requires <workspace>")
    const payload = {
      manifest: await readJsonMaybe(resolve(workspace, "manifest.json")),
      state: await readJsonMaybe(resolve(workspace, "run-state.json")),
      result: await readJsonMaybe(resolve(workspace, "result.json")),
    }
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    return 0
  }

  if (command === "events") {
    const workspace = positional[0]
    if (!workspace) throw new Error("events requires <workspace>")
    const raw = await readFile(resolve(workspace, "events.jsonl"), "utf-8")
    process.stdout.write(raw)
    return 0
  }

  if (command === "run") {
    const workflowPath = positional[0]
    if (!workflowPath) throw new Error("run requires <workflow.chain>")
    const workflow = await loadWorkflow(workflowPath)
    const input = await loadInput(flags)
    const handle = await runner.startRun({
      workflow,
      input,
      projectPath: flags.project ? resolve(flags.project) : undefined,
      workflowPath: resolve(workflowPath),
    })
    const streamPromise = streamEvents(runner, handle, flags)
    const summary = await handle.result
    const approvalRequired = await streamPromise
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    }
    return summaryExitCode(summary, approvalRequired)
  }

  if (command === "resume") {
    const workflowPath = positional[0]
    const workspace = positional[1]
    if (!workflowPath || !workspace) throw new Error("resume requires <workflow.chain> <workspace>")
    const workflow = await loadWorkflow(workflowPath)
    const handle = await runner.resumeRun({
      workflow,
      workspace: resolve(workspace),
      projectPath: flags.project ? resolve(flags.project) : undefined,
      workflowPath: resolve(workflowPath),
    })
    const streamPromise = streamEvents(runner, handle, flags)
    const summary = await handle.result
    const approvalRequired = await streamPromise
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    }
    return summaryExitCode(summary, approvalRequired)
  }

  if (command === "rerun-from") {
    const workflowPath = positional[0]
    const workspace = positional[1]
    const nodeId = positional[2]
    if (!workflowPath || !workspace || !nodeId) {
      throw new Error("rerun-from requires <workflow.chain> <workspace> <nodeId>")
    }
    const workflow = await loadWorkflow(workflowPath)
    const handle = await runner.rerunFromNode({
      workflow,
      workspace: resolve(workspace),
      fromNodeId: nodeId,
      projectPath: flags.project ? resolve(flags.project) : undefined,
      workflowPath: resolve(workflowPath),
    })
    const streamPromise = streamEvents(runner, handle, flags)
    const summary = await handle.result
    const approvalRequired = await streamPromise
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    }
    return summaryExitCode(summary, approvalRequired)
  }

  printUsage()
  return 0
}

async function main(): Promise<void> {
  const [command = "help", ...args] = process.argv.slice(2)
  if (
    command !== "run"
    && command !== "resume"
    && command !== "rerun-from"
    && command !== "inspect"
    && command !== "events"
    && command !== "help"
  ) {
    printUsage()
    process.exitCode = 1
    return
  }

  try {
    const code = await runCommand(command, args)
    process.exitCode = code
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

void main()
