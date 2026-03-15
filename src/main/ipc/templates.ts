import { ipcMain, BrowserWindow, type WebContents } from "electron"
import { existsSync } from "node:fs"
import { getBuiltinTemplates } from "../lib/templates"
import { drainExecutionHandle } from "../lib/agent-execution"
import { LogParser } from "../lib/log-parser"
import { buildGeneratorPrompt, parseGeneratedWorkflow } from "../lib/workflow-generator"
import { scaffoldMissingSkills } from "../lib/skill-scaffold"
import { trackTelemetryEvent } from "../lib/telemetry/service"
import { summarizeMissingWorkflowSkillRefs } from "../lib/telemetry/workflow-usage"
import type { DiscoveredSkill, GenerationProgress, Workflow, WorkflowTemplate } from "@shared/types"
import { allowedProjectRoots } from "../lib/security-paths"
import { resolve, join } from "node:path"
import { mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { saveChain } from "../lib/chain-io"
import { toWorkflowFileStem } from "@shared/workflow-name"
import { getDefaultModelForProvider } from "@shared/provider-metadata"
import { logError, logInfo, logWarn } from "../lib/structured-log"
import { buildProviderExtraArgs } from "../lib/mcp-config"
import { getProviderSettings } from "../lib/provider-settings"
import { applyProviderFeatureFlags, startProviderTask } from "../lib/provider-runtime"

const activeGenerateControllers = new Map<number, AbortController>()
const generateLifecycleBindings = new Set<number>()

function abortGenerationForSender(senderId: number): void {
  const controller = activeGenerateControllers.get(senderId)
  if (!controller) return
  controller.abort()
  activeGenerateControllers.delete(senderId)
}

function bindGenerateLifecycle(sender: WebContents): void {
  const senderId = sender.id
  if (generateLifecycleBindings.has(senderId)) return
  generateLifecycleBindings.add(senderId)

  const cleanup = () => {
    abortGenerationForSender(senderId)
    generateLifecycleBindings.delete(senderId)
  }

  sender.once("destroyed", cleanup)
  const window = BrowserWindow.fromWebContents(sender)
  window?.once("closed", cleanup)
}

async function resolveGenerateWorkdir(projectPath?: string): Promise<string> {
  if (!projectPath) return process.cwd()
  const resolvedPath = resolve(projectPath)
  const projectRoots = await allowedProjectRoots()
  if (!projectRoots.some((root) => root === resolvedPath)) {
    throw new Error("Project path is not registered")
  }
  return resolvedPath
}

export function registerTemplateHandlers() {
  ipcMain.handle("templates:list", async (): Promise<WorkflowTemplate[]> => {
    return getBuiltinTemplates()
  })

  ipcMain.handle(
    "templates:save-user",
    async (_event, name: string, workflow: Workflow): Promise<string> => {
      const dir = join(homedir(), ".c8c", "user-templates")
      await mkdir(dir, { recursive: true })
      const stem = toWorkflowFileStem(name) || "template"
      const filePath = join(dir, `${stem}.chain`)
      await saveChain(filePath, { ...workflow, name })
      logInfo("templates-ipc", "user_template_saved", { name, filePath })
      return filePath
    },
  )

  ipcMain.handle("templates:cancel-generate", async (event) => {
    const senderId = event.sender.id
    abortGenerationForSender(senderId)
    logInfo("templates-ipc", "generate_cancel_requested", { senderId })
  })

  ipcMain.handle(
    "templates:generate",
    async (
      event,
      description: string,
      availableSkills: Pick<DiscoveredSkill, "name" | "category" | "description">[],
      projectPath?: string,
    ): Promise<Workflow> => {
      bindGenerateLifecycle(event.sender)
      const safeWorkdir = await resolveGenerateWorkdir(projectPath)
      const prompt = buildGeneratorPrompt(description, availableSkills)
      const logParser = new LogParser()
      const senderId = event.sender.id

      if (activeGenerateControllers.has(senderId)) {
        throw new Error("Workflow generation already in progress")
      }

      const controller = new AbortController()
      activeGenerateControllers.set(senderId, controller)
      const abortSignal = controller.signal

      const window = BrowserWindow.fromWebContents(event.sender)
      const sendProgress = (step: GenerationProgress["step"], count: number) => {
        if (window && !window.isDestroyed()) {
          window.webContents.send("generate:progress", { step, count })
        }
      }

      let entryCount = 0
      let stderrOutput = ""
      sendProgress("starting", 0)
      let terminalProgressSent = false
      const sendTerminalProgress = (step: "done" | "error") => {
        if (terminalProgressSent) return
        terminalProgressSent = true
        sendProgress(step, entryCount)
      }

      try {
        const settings = await getProviderSettings()
        const providerId = applyProviderFeatureFlags(
          settings.defaultProvider,
          settings.features.codexProvider,
        )
        const model = getDefaultModelForProvider(providerId)
        const mcpConfigPath = projectPath && existsSync(join(projectPath, ".mcp.json"))
          ? join(projectPath, ".mcp.json")
          : undefined
        let result
        try {
          logInfo("templates-ipc", "generate_started", { senderId, projectPath: projectPath || null })
          const handle = await startProviderTask(providerId, {
            workdir: safeWorkdir,
            prompt,
            model,
            maxTurns: 30,
            systemPrompts: [
              "You are a workflow JSON generator. Output ONLY valid JSON. Do NOT invoke skills, do NOT read files, do NOT use tools. Generate the workflow definition directly from the prompt and available skills list.",
            ],
            mcpConfigPath,
            disableBuiltInTools: providerId === "claude",
            disableSlashCommands: providerId === "claude",
            extraArgs: providerId === "codex"
              ? [
                  ...buildProviderExtraArgs("codex", mcpConfigPath),
                ]
              : undefined,
            timeout: 300_000,
            abortSignal,
          })
          result = await drainExecutionHandle(handle, {
            onLogEntry: (entry) => {
              logParser.appendEntry(entry)
              entryCount++
              if (entry.type === "thinking") {
                sendProgress("thinking", entryCount)
              } else if (entry.type === "text") {
                sendProgress("writing", entryCount)
              } else if (entry.type === "tool_use" && "tool" in entry) {
                sendProgress(`using ${entry.tool}`, entryCount)
              }
            },
            onUsage: (usage) => {
              logParser.applyUsage(usage)
            },
            onStderr: (text) => {
              stderrOutput += text
            },
          })
        } catch (err) {
          const msg = String(err)
          if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
            throw new Error("Workflow generation timed out — try a simpler description")
          }
          throw new Error(`${providerId} process failed: ${msg.slice(0, 200)}`)
        } finally {
          if (activeGenerateControllers.get(senderId) === controller) {
            activeGenerateControllers.delete(senderId)
          }
        }

        logParser.flush()
        sendProgress("parsing", entryCount)

        logInfo("templates-ipc", "generate_finished", {
          senderId,
          success: result.success,
          exitCode: result.exitCode,
          killed: result.killed,
          aborted: result.aborted,
          entries: logParser.entries.length,
          textLength: logParser.textContent.length,
          stderrPreview: stderrOutput ? stderrOutput.slice(0, 500) : "",
        })

        if (!result.success) {
          if (result.killed) {
            throw new Error("Workflow generation timed out — try a simpler description")
          }
          if (result.aborted) {
            throw new Error("Workflow generation was cancelled")
          }
          const preview = logParser.textContent.trim() || logParser.rawOutput.slice(0, 200)
          throw new Error(`Workflow generation failed (exit ${result.exitCode}): ${preview || "no output"}`)
        }

        if (logParser.textContent.length === 0) {
          const raw = logParser.rawOutput.trim()
          if (raw.includes("max turns")) {
            throw new Error("Claude ran out of turns before generating output — try a simpler description")
          }
          throw new Error(`Claude produced no text output: ${raw.slice(0, 200) || "empty response"}`)
        }

        let workflow: Workflow
        try {
          workflow = parseGeneratedWorkflow(logParser.textContent)
        } catch (err) {
          const preview = logParser.textContent.slice(0, 300)
          throw new Error(`Could not parse workflow from AI response: ${(err as Error).message}\n\nResponse preview: ${preview}`)
        }

        if (projectPath) {
          const startedAt = Date.now()
          const before = summarizeMissingWorkflowSkillRefs(workflow, availableSkills)
          try {
            workflow = await scaffoldMissingSkills(workflow, availableSkills, safeWorkdir)
            const after = summarizeMissingWorkflowSkillRefs(workflow, availableSkills)
            void trackTelemetryEvent("skill_scaffold_completed", {
              source: "template_generate",
              status: "success",
              duration_ms: Date.now() - startedAt,
              skill_nodes_total: before.skillNodesTotal,
              available_skills_total: before.availableSkillsTotal,
              missing_refs_total: before.missingRefsTotal,
              missing_refs_unique: before.missingRefsUnique,
              missing_refs: before.missingRefsList,
              remaining_missing_refs_total: after.missingRefsTotal,
            })
          } catch (error) {
            void trackTelemetryEvent("skill_scaffold_completed", {
              source: "template_generate",
              status: "failed",
              duration_ms: Date.now() - startedAt,
              skill_nodes_total: before.skillNodesTotal,
              available_skills_total: before.availableSkillsTotal,
              missing_refs_total: before.missingRefsTotal,
              missing_refs_unique: before.missingRefsUnique,
              missing_refs: before.missingRefsList,
              error_kind: "scaffold_failed",
            })
            throw error
          }
        }

        sendTerminalProgress("done")
        return workflow
      } catch (error) {
        if (String(error).toLowerCase().includes("cancelled")) {
          logWarn("templates-ipc", "generate_cancelled", { senderId, error: String(error) })
        } else {
          logError("templates-ipc", "generate_failed", { senderId, error: String(error) })
        }
        sendTerminalProgress("error")
        throw error
      }
    },
  )
}
