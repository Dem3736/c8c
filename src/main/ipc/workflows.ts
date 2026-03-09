import { ipcMain, dialog, BrowserWindow } from "electron"
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
      const window = BrowserWindow.getFocusedWindow()
      if (!window) return null

      const defaultDir = projectPath
        ? join(await assertRegisteredProjectPath(projectPath), ".c8c")
        : await ensureChainsDir()

      const result = await dialog.showSaveDialog(window, {
        title: "Save Workflow",
        defaultPath: join(defaultDir, "workflow.chain"),
        filters: [
          { name: "Chain Workflow", extensions: ["chain"] },
          { name: "YAML (legacy)", extensions: ["yaml", "yml"] },
        ],
      })

      if (result.canceled || !result.filePath) return null
      const safeFilePath = await assertWorkflowFilePath(result.filePath)

      if (safeFilePath.endsWith(".chain")) {
        // For .chain files, ensure we have a Workflow object
        if ("nodes" in data) {
          await saveChain(safeFilePath, data as Workflow)
        } else {
          // Convert legacy to workflow before saving as .chain
          const name = basename(safeFilePath, ".chain")
          const workflow = yamlToChain(data as ChainDefinition, name)
          await saveChain(safeFilePath, workflow)
        }
      } else {
        // Legacy YAML save
        if ("steps" in data) {
          await saveChainYaml(safeFilePath, data as ChainDefinition)
        } else {
          // Workflow object being saved as YAML — save as .chain instead
          const chainPath = safeFilePath.replace(/\.(yaml|yml)$/, ".chain")
          await assertWorkflowFilePath(chainPath)
          await saveChain(chainPath, data as Workflow)
          return chainPath
        }
      }

      return safeFilePath
    },
  )

  ipcMain.handle("workflows:open-file", async () => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) return null

    const result = await dialog.showOpenDialog(window, {
      title: "Open Workflow",
      filters: [{ name: "Workflows", extensions: ["chain", "yaml", "yml"] }],
      properties: ["openFile"],
    })

    if (result.canceled || !result.filePaths[0]) return null
    const filePath = result.filePaths[0]

    let chain: Workflow | ChainDefinition
    if (filePath.endsWith(".chain")) {
      chain = await loadChain(filePath)
    } else {
      const legacy = await loadChainYaml(filePath)
      const name = basename(filePath).replace(/\.(yaml|yml)$/, "")
      chain = yamlToChain(legacy, name)
    }

    return { filePath, chain }
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

  ipcMain.handle("workflows:delete", async (_e, filePath: string) => {
    const { unlink } = await import("node:fs/promises")
    const safeFilePath = await assertWorkflowFilePath(filePath)
    await unlink(safeFilePath)
  })
}
