import { ipcMain, BrowserWindow } from "electron"
import { spawnClaude } from "@claude-tools/runner"
import { getBuiltinTemplates } from "../lib/templates"
import { LogParser } from "../lib/log-parser"
import { buildGeneratorPrompt, parseGeneratedWorkflow } from "../lib/workflow-generator"
import { scaffoldMissingSkills } from "../lib/skill-scaffold"
import type { DiscoveredSkill, GenerationProgress, Workflow, WorkflowTemplate } from "@shared/types"
import { allowedProjectRoots } from "../lib/security-paths"
import { resolve } from "node:path"

const activeGenerateControllers = new Map<number, AbortController>()

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

  ipcMain.handle("templates:cancel-generate", async (event) => {
    const senderId = event.sender.id
    const controller = activeGenerateControllers.get(senderId)
    controller?.abort()
    activeGenerateControllers.delete(senderId)
  })

  ipcMain.handle(
    "templates:generate",
    async (
      event,
      description: string,
      availableSkills: Pick<DiscoveredSkill, "name" | "category" | "description">[],
      projectPath?: string,
    ): Promise<Workflow> => {
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

      let result: Awaited<ReturnType<typeof spawnClaude>>
      try {
        result = await spawnClaude({
          workdir: safeWorkdir,
          prompt,
          model: "sonnet",
          maxTurns: 30,
          permissionMode: "acceptEdits",
          systemPrompts: [
            "You are a workflow JSON generator. Output ONLY valid JSON. Do NOT invoke skills, do NOT read files, do NOT use tools. Generate the workflow definition directly from the prompt and available skills list.",
          ],
          extraArgs: ["--verbose", "--output-format", "stream-json", "--disable-slash-commands", "--tools", ""],
          timeout: 300_000,
          abortSignal,
          onStdout: (data: Buffer) => {
            const newEntries = logParser.feedChunk(data.toString())
            for (const entry of newEntries) {
              entryCount++
              if (entry.type === "thinking") {
                sendProgress("thinking", entryCount)
              } else if (entry.type === "text") {
                sendProgress("writing", entryCount)
              } else if (entry.type === "tool_use" && "tool" in entry) {
                sendProgress(`using ${entry.tool}`, entryCount)
              }
            }
          },
          onStderr: (data: Buffer) => {
            stderrOutput += data.toString()
          },
        })
      } catch (err) {
        const msg = String(err)
        if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
          throw new Error("Workflow generation timed out — try a simpler description")
        }
        throw new Error(`Claude process failed: ${msg.slice(0, 200)}`)
      } finally {
        if (activeGenerateControllers.get(senderId) === controller) {
          activeGenerateControllers.delete(senderId)
        }
      }

      logParser.flush()
      sendProgress("parsing", entryCount)

      console.log("[generate] result:", {
        success: result.success, exitCode: result.exitCode,
        signal: result.signal, killed: result.killed, aborted: result.aborted,
      })
      console.log("[generate] entries:", logParser.entries.length, "textContent:", logParser.textContent.length)
      if (stderrOutput) {
        console.log("[generate] stderr:", stderrOutput.slice(0, 500))
      }

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
        workflow = await scaffoldMissingSkills(workflow, availableSkills, safeWorkdir)
      }

      sendProgress("done", entryCount)
      return workflow
    },
  )
}
