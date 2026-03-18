import { ipcMain, dialog, BrowserWindow, shell } from "electron"
import {
  loadChainYaml,
  saveChainYaml,
  listChains,
  listProjectWorkflows,
  ensureChainsDir,
} from "../lib/yaml-io"
import { loadChain, saveChain, listChainFiles } from "../lib/chain-io"
import { yamlToChain } from "../lib/migrate"
import { join, basename, dirname, extname, resolve } from "node:path"
import type { ChainDefinition } from "../lib/chain-runner"
import type { Workflow } from "@shared/types"
import {
  normalizeWorkflowTitle,
  toWorkflowFileStem,
} from "@shared/workflow-name"
import { moveChatHistory } from "../lib/chat-storage"
import { allowedProjectRoots, allowedWorkflowRoots, assertWithinRoots } from "../lib/security-paths"

async function pathExists(path: string): Promise<boolean> {
  const { access } = await import("node:fs/promises")
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function uniqueWorkflowPath(
  dir: string,
  stem: string,
  extension: ".chain" | ".yaml" | ".yml",
): Promise<string> {
  const baseStem = stem || "workflow"
  let index = 1
  let candidate = join(dir, `${baseStem}${extension}`)

  while (await pathExists(candidate)) {
    index += 1
    candidate = join(dir, `${baseStem}-${index}${extension}`)
  }

  return candidate
}

function assertSupportedWorkflowExtension(filePath: string): void {
  const extension = extname(filePath).toLowerCase()
  if (extension !== ".chain" && extension !== ".yaml" && extension !== ".yml") {
    throw new Error(`Unsupported workflow extension: ${extension || "(none)"}`)
  }
}

async function assertWorkflowFilePath(filePath: string): Promise<string> {
  const resolvedPath = resolve(filePath)
  assertSupportedWorkflowExtension(resolvedPath)
  const workflowRoots = await allowedWorkflowRoots()
  return assertWithinRoots(resolvedPath, workflowRoots, "Workflow path")
}

function isOutsideAllowedWorkflowRootsError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("outside allowed directories")
}

function formatAllowedWorkflowRoots(roots: string[]): string {
  return roots.map((root) => `- ${root}`).join("\n")
}

async function withWorkflowRootGuidance<T>(
  actionLabel: string,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action()
  } catch (error) {
    if (!isOutsideAllowedWorkflowRootsError(error)) {
      throw error
    }
    const roots = await allowedWorkflowRoots()
    throw new Error(
      `${actionLabel} is limited to registered workflow folders.\n\n`
      + `Allowed workflow folders:\n${formatAllowedWorkflowRoots(roots)}\n\n`
      + "Move the workflow into one of these folders, or add/open the project first.",
    )
  }
}

function defaultWorkflowFilename(data: Workflow | ChainDefinition): string {
  const title = "nodes" in data
    ? normalizeWorkflowTitle((data as Workflow).name || "")
    : ""
  return `${toWorkflowFileStem(title || "workflow")}.chain`
}

async function saveWorkflowDefinition(
  filePath: string,
  data: Workflow | ChainDefinition,
): Promise<string> {
  if (filePath.endsWith(".chain")) {
    if ("nodes" in data) {
      await saveChain(filePath, data as Workflow)
    } else {
      const name = basename(filePath, ".chain")
      const workflow = yamlToChain(data as ChainDefinition, name)
      await saveChain(filePath, workflow)
    }
    return filePath
  }

  if ("steps" in data) {
    await saveChainYaml(filePath, data as ChainDefinition)
    return filePath
  }

  const chainPath = filePath.replace(/\.(yaml|yml)$/, ".chain")
  await assertWorkflowFilePath(chainPath)
  await saveChain(chainPath, data as Workflow)
  return chainPath
}

async function assertRegisteredProjectPath(projectPath: string): Promise<string> {
  const resolvedPath = resolve(projectPath)
  const projectRoots = await allowedProjectRoots()
  if (!projectRoots.some((root) => root === resolvedPath)) {
    throw new Error("Project path is not registered")
  }
  return resolvedPath
}

export function registerWorkflowsHandlers() {
  ipcMain.handle("workflows:list-project", async (_e, projectPath: string) => {
    const safeProjectPath = await assertRegisteredProjectPath(projectPath)
    return listProjectWorkflows(safeProjectPath)
  })

  ipcMain.handle("workflows:list-global", async () => {
    const dir = await ensureChainsDir()
    const chains = await listChainFiles(dir)
    const yamls = await listChains()
    return [...chains, ...yamls].sort((a, b) => {
      const aTime = a.updatedAt ?? 0
      const bTime = b.updatedAt ?? 0
      if (aTime !== bTime) return bTime - aTime
      return a.name.localeCompare(b.name)
    })
  })

  ipcMain.handle("workflows:load", async (_e, filePath: string) => {
    const safeFilePath = await assertWorkflowFilePath(filePath)
    if (safeFilePath.endsWith(".chain")) {
      return loadChain(safeFilePath)
    } else {
      // Legacy YAML — load and convert on the fly
      const legacy = await loadChainYaml(safeFilePath)
      const name = basename(safeFilePath).replace(/\.(yaml|yml)$/, "")
      return yamlToChain(legacy, name)
    }
  })

  ipcMain.handle(
    "workflows:save",
    async (_e, filePath: string, data: Workflow | ChainDefinition) => {
      const safeFilePath = await assertWorkflowFilePath(filePath)
      // Detect format: Workflow has `nodes`, ChainDefinition has `steps`
      if ("nodes" in data) {
        // New Workflow format — always save as .chain
        const chainPath = safeFilePath.replace(/\.(yaml|yml)$/, ".chain")
        await assertWorkflowFilePath(chainPath)
        await saveChain(chainPath, data as Workflow)
        return chainPath
      } else {
        // Legacy ChainDefinition — save as YAML
        await saveChainYaml(safeFilePath, data as ChainDefinition)
        return safeFilePath
      }
    },
  )

  ipcMain.handle(
    "workflows:save-as",
    async (_e, data: Workflow | ChainDefinition, projectPath?: string) => {
      return withWorkflowRootGuidance("Workflow save destination", async () => {
        const window = BrowserWindow.getFocusedWindow()
        if (!window) return null

        const defaultDir = projectPath
          ? join(await assertRegisteredProjectPath(projectPath), ".c8c")
          : await ensureChainsDir()

        const result = await dialog.showSaveDialog(window, {
          title: "Save Workflow As",
          defaultPath: join(defaultDir, defaultWorkflowFilename(data)),
          filters: [
            { name: "Chain Workflow", extensions: ["chain"] },
            { name: "YAML (legacy)", extensions: ["yaml", "yml"] },
          ],
        })

        if (result.canceled || !result.filePath) return null
        const safeFilePath = await assertWorkflowFilePath(result.filePath)
        return saveWorkflowDefinition(safeFilePath, data)
      })
    },
  )

  ipcMain.handle(
    "workflows:export-copy",
    async (_e, data: Workflow | ChainDefinition, projectPath?: string) => {
      return withWorkflowRootGuidance("Workflow export destination", async () => {
        const window = BrowserWindow.getFocusedWindow()
        if (!window) return null

        const defaultDir = projectPath
          ? join(await assertRegisteredProjectPath(projectPath), ".c8c")
          : await ensureChainsDir()

        const result = await dialog.showSaveDialog(window, {
          title: "Export Workflow Copy",
          defaultPath: join(defaultDir, defaultWorkflowFilename(data)),
          filters: [
            { name: "Chain Workflow", extensions: ["chain"] },
            { name: "YAML (legacy)", extensions: ["yaml", "yml"] },
          ],
        })

        if (result.canceled || !result.filePath) return null
        const safeFilePath = await assertWorkflowFilePath(result.filePath)
        return saveWorkflowDefinition(safeFilePath, data)
      })
    },
  )

  ipcMain.handle("workflows:open-file", async () => {
    return withWorkflowRootGuidance("Workflow import", async () => {
      const window = BrowserWindow.getFocusedWindow()
      if (!window) return null

      const result = await dialog.showOpenDialog(window, {
        title: "Open Workflow",
        filters: [{ name: "Workflows", extensions: ["chain", "yaml", "yml"] }],
        properties: ["openFile"],
      })

      if (result.canceled || !result.filePaths[0]) return null
      const safeFilePath = await assertWorkflowFilePath(result.filePaths[0])

      let chain: Workflow | ChainDefinition
      if (safeFilePath.endsWith(".chain")) {
        chain = await loadChain(safeFilePath)
      } else {
        const legacy = await loadChainYaml(safeFilePath)
        const name = basename(safeFilePath).replace(/\.(yaml|yml)$/, "")
        chain = yamlToChain(legacy, name)
      }

      return { filePath: safeFilePath, chain }
    })
  })

  ipcMain.handle(
    "workflows:create",
    async (_e, projectPath: string, name: string, data: Workflow | ChainDefinition) => {
      const { mkdir } = await import("node:fs/promises")
      const safeProjectPath = await assertRegisteredProjectPath(projectPath)
      const dir = join(safeProjectPath, ".c8c")
      await mkdir(dir, { recursive: true })

      if ("nodes" in data) {
        const workflow = data as Workflow
        const normalizedTitle = normalizeWorkflowTitle(workflow.name || name)
        const fileStem = toWorkflowFileStem(name || normalizedTitle)
        const filePath = await uniqueWorkflowPath(dir, fileStem, ".chain")
        await saveChain(filePath, {
          ...workflow,
          name: normalizedTitle || workflow.name || name,
        })
        return filePath
      } else {
        const fileStem = toWorkflowFileStem(name)
        const filePath = await uniqueWorkflowPath(dir, fileStem, ".yaml")
        await saveChainYaml(filePath, data as ChainDefinition)
        return filePath
      }
    },
  )

  ipcMain.handle(
    "workflows:rename",
    async (_e, filePath: string, nextTitle: string) => {
      const { rename } = await import("node:fs/promises")
      const safeFilePath = await assertWorkflowFilePath(filePath)
      const dir = dirname(safeFilePath)
      const extension = extname(safeFilePath).toLowerCase()

      const normalizedTitle = normalizeWorkflowTitle(nextTitle)
      if (!normalizedTitle) {
        throw new Error("Workflow name cannot be empty")
      }

      const destinationPath = join(
        dir,
        `${toWorkflowFileStem(normalizedTitle)}${extension}`,
      )
      await assertWorkflowFilePath(destinationPath)
      if (destinationPath !== safeFilePath && (await pathExists(destinationPath))) {
        throw new Error(`Workflow "${normalizedTitle}" already exists`)
      }

      if (destinationPath !== safeFilePath) {
        await rename(safeFilePath, destinationPath)
        await moveChatHistory(safeFilePath, destinationPath)
      }

      if (extension === ".chain") {
        const workflow = await loadChain(destinationPath)
        await saveChain(destinationPath, { ...workflow, name: normalizedTitle })
      }

      return destinationPath
    },
  )

  ipcMain.handle("workflows:duplicate", async (_e, filePath: string) => {
    const safeFilePath = await assertWorkflowFilePath(filePath)
    const dir = dirname(safeFilePath)
    const extension = extname(safeFilePath).toLowerCase() as ".chain" | ".yaml" | ".yml"

    if (extension === ".chain") {
      const workflow = await loadChain(safeFilePath)
      const originalName = workflow.name || basename(safeFilePath, extension)
      const copyName = `${originalName}-copy`
      const copyStem = toWorkflowFileStem(copyName)
      const destPath = await uniqueWorkflowPath(dir, copyStem, extension)
      await saveChain(destPath, { ...workflow, name: copyName })
      return destPath
    } else {
      const legacy = await loadChainYaml(safeFilePath)
      const originalName = basename(safeFilePath).replace(/\.(yaml|yml)$/, "")
      const copyName = `${originalName}-copy`
      const copyStem = toWorkflowFileStem(copyName)
      const destPath = await uniqueWorkflowPath(dir, copyStem, extension)
      await saveChainYaml(destPath, legacy)
      return destPath
    }
  })

  ipcMain.handle("workflows:delete", async (_e, filePath: string) => {
    const safeFilePath = await assertWorkflowFilePath(filePath)
    try {
      await shell.trashItem(safeFilePath)
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === "EPERM" || code === "EACCES") {
        throw new Error("This workflow file is read-only and can't be deleted.")
      }
      if (code === "ENOENT") {
        throw new Error("This workflow was already deleted.")
      }
      throw error
    }
  })
}
