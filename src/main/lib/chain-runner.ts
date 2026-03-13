import { spawnClaude } from "@claude-tools/runner"
import { mkdtemp, mkdir, readFile, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { BrowserWindow } from "electron"
import { writeFileAtomic } from "./atomic-write"
import { logWarn } from "./structured-log"

export type StepMode = "analyze" | "rewrite" | "both"

export interface ChainStep {
  key: string
  agent: string
  prompt: string
  mode?: StepMode
  model?: string
  maxTurns?: number
  skillPaths?: string[]
}

export interface ChainDefaults {
  model?: string
  maxTurns?: number
  timeout_minutes?: number
}

export interface ChainDefinition {
  description?: string
  defaults?: ChainDefaults
  steps: ChainStep[]
}

export interface ChainInput {
  type: "url" | "directory" | "text"
  value: string
}

export interface ReportFile {
  name: string
  content: string
}

export interface StepEvent {
  type: "step-start" | "step-output" | "step-error" | "step-done" | "chain-done"
  step?: string
  stepIndex?: number
  totalSteps?: number
  output?: string
  error?: string
  exitCode?: number | null
  durationMs?: number
  finalContent?: string
  reports?: ReportFile[]
  workspace?: string
}

// Active chain runs, keyed by runId
const activeRuns = new Map<string, AbortController>()

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === "string") return code
  }
  return undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function cancelRun(runId: string): boolean {
  const controller = activeRuns.get(runId)
  if (controller) {
    controller.abort()
    activeRuns.delete(runId)
    return true
  }
  return false
}

function getModeInstruction(mode: StepMode, vars: Record<string, string>): string {
  switch (mode) {
    case "analyze":
      return `Score/analyze ${vars.content}. Write report to ${vars.reports}/${vars.step_number}-${vars.step_key}.md. Do NOT modify content.md.`
    case "rewrite":
      return `Read ${vars.content}. Rewrite applying the skill rules. Save improved version back to ${vars.content}.`
    case "both":
    default:
      return `Read ${vars.content}. Score it. Rewrite sections that fail. Save improved version to ${vars.content}. Write report to ${vars.reports}/${vars.step_number}-${vars.step_key}.md.`
  }
}

function resolveVars(template: string, vars: Record<string, string>): string {
  let resolved = template
  for (const [key, val] of Object.entries(vars)) {
    resolved = resolved.replaceAll(`\${${key}}`, val)
  }
  return resolved
}

async function readReportsDir(reportsDir: string): Promise<ReportFile[]> {
  try {
    const files = await readdir(reportsDir)
    const reports: ReportFile[] = []
    for (const file of files.sort()) {
      if (file.endsWith(".md")) {
        const content = await readFile(join(reportsDir, file), "utf-8")
        reports.push({ name: file, content })
      }
    }
    return reports
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      logWarn("chain-runner", "read_reports_dir_failed", {
        reportsDir,
        error: errorMessage(error),
      })
    }
    return []
  }
}

export async function runChain(
  runId: string,
  chain: ChainDefinition,
  input: ChainInput,
  window: BrowserWindow,
): Promise<void> {
  const controller = new AbortController()
  activeRuns.set(runId, controller)

  try {
    // Create workspace inside project dir when possible (so Claude has file access)
    let workdir: string
    const projectDir = input.type === "directory" ? input.value : undefined
    const workspaceBase = projectDir
      ? join(projectDir, ".c8c", "runs")
      : join(tmpdir(), "c8c-ws")
    await mkdir(workspaceBase, { recursive: true })
    const workspace = await mkdtemp(join(workspaceBase, `${runId}-`))
    const reportsDir = join(workspace, "reports")
    await mkdir(reportsDir, { recursive: true })

    // Write input to workspace/content.md
    if (input.type === "directory") {
      workdir = input.value
      // For directory input, workspace is a subdirectory concept — copy nothing,
      // the agent works in the directory itself. Content.md acts as a scratchpad.
      await writeFileAtomic(
        join(workspace, "content.md"),
        `Working directory: ${input.value}\n`,
      )
    } else if (input.type === "url") {
      workdir = workspace
      await writeFileAtomic(
        join(workspace, "content.md"),
        `URL to fetch and process: ${input.value}\n`,
      )
    } else {
      workdir = workspace
      await writeFileAtomic(join(workspace, "content.md"), input.value)
    }

    for (let i = 0; i < chain.steps.length; i++) {
      if (controller.signal.aborted) break

      const step = chain.steps[i]
      const send = (event: StepEvent) => {
        if (!window.isDestroyed()) {
          window.webContents.send("chain:event", { runId, ...event })
        }
      }

      send({
        type: "step-start",
        step: step.key,
        stepIndex: i,
        totalSteps: chain.steps.length,
      })

      // Template variables
      const vars: Record<string, string> = {
        workspace,
        content: join(workspace, "content.md"),
        reports: reportsDir,
        step_number: String(i + 1).padStart(2, "0"),
        step_key: step.key,
        total_steps: String(chain.steps.length),
      }

      // Resolve variables in step prompt
      const resolvedPrompt = resolveVars(step.prompt, vars)

      // Mode instruction
      const mode = step.mode || "both"
      const modeInstruction = getModeInstruction(mode, vars)

      // Build prompt — workspace-based, no stdout chaining
      const fullPrompt = [
        `Workspace directory: ${workspace}`,
        `Main content file: ${vars.content}`,
        `Reports directory: ${reportsDir}/`,
        `Step ${i + 1} of ${chain.steps.length}.`,
        "",
        `Mode instruction: ${modeInstruction}`,
        "",
        resolvedPrompt,
      ].join("\n")

      let stepOutput = ""

      const result = await spawnClaude({
        workdir,
        prompt: fullPrompt,
        model: step.model || chain.defaults?.model || "sonnet",
        maxTurns: step.maxTurns || chain.defaults?.maxTurns || 60,
        permissionMode: "acceptEdits",
        addDirs: step.skillPaths?.map((p) => (p.endsWith(".md") ? dirname(p) : p)),
        abortSignal: controller.signal,
        timeout: (chain.defaults?.timeout_minutes || 30) * 60 * 1000,
        onStdout: (data: Buffer) => {
          const text = data.toString()
          stepOutput += text
          send({ type: "step-output", step: step.key, output: text })
        },
        onStderr: (data: Buffer) => {
          send({ type: "step-error", step: step.key, error: data.toString() })
        },
      })

      send({
        type: "step-done",
        step: step.key,
        stepIndex: i,
        totalSteps: chain.steps.length,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
      })

      if (!result.success && !controller.signal.aborted) {
        send({
          type: "step-error",
          step: step.key,
          error: `Step "${step.key}" failed with exit code ${result.exitCode}`,
        })
        break
      }
    }

    // Read final content and reports
    let finalContent = ""
    try {
      finalContent = await readFile(join(workspace, "content.md"), "utf-8")
    } catch (error) {
      // content.md may not exist if all steps failed
      if (errorCode(error) !== "ENOENT") {
        logWarn("chain-runner", "read_final_content_failed", {
          workspace,
          error: errorMessage(error),
        })
      }
    }
    const reports = await readReportsDir(reportsDir)

    if (!window.isDestroyed()) {
      window.webContents.send("chain:event", {
        runId,
        type: "chain-done",
        finalContent,
        reports,
        workspace,
      })
    }
  } finally {
    activeRuns.delete(runId)
  }
}
