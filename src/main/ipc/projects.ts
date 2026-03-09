import { ipcMain, dialog, BrowserWindow } from "electron"
import { loadProjectsConfig, saveProjectsConfig } from "../lib/projects-config"

let configMutationQueue: Promise<void> = Promise.resolve()

function runSerializedConfigOperation<T>(operation: () => Promise<T>): Promise<T> {
  const next = configMutationQueue.then(operation, operation)
  configMutationQueue = next.then(() => undefined, () => undefined)
  return next
}

export function registerIpcHandlers() {
  ipcMain.handle("projects:list", async () => {
    const config = await runSerializedConfigOperation(() => loadProjectsConfig())
    return config.projects
  })

  ipcMain.handle("projects:add", async () => {
    const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    const result = window
      ? await dialog.showOpenDialog(window, {
        properties: ["openDirectory"],
        title: "Add Project Folder",
      })
      : await dialog.showOpenDialog({
        properties: ["openDirectory"],
        title: "Add Project Folder",
      })
    if (result.canceled || !result.filePaths[0]) return null
    const dir = result.filePaths[0]
    await runSerializedConfigOperation(async () => {
      const config = await loadProjectsConfig()
      if (!config.projects.includes(dir)) {
        config.projects.push(dir)
        await saveProjectsConfig(config)
      }
    })
    return dir
  })

  ipcMain.handle("projects:remove", async (_e, path: string) => {
    await runSerializedConfigOperation(async () => {
      const config = await loadProjectsConfig()
      config.projects = config.projects.filter((p) => p !== path)
      if (config.lastSelectedProject === path) {
        config.lastSelectedProject = undefined
      }
      await saveProjectsConfig(config)
    })
  })

  ipcMain.handle("projects:set-selected", async (_e, path: string) => {
    await runSerializedConfigOperation(async () => {
      const config = await loadProjectsConfig()
      config.lastSelectedProject = path
      await saveProjectsConfig(config)
    })
  })

  ipcMain.handle("projects:get-selected", async () => {
    const config = await runSerializedConfigOperation(() => loadProjectsConfig())
    return config.lastSelectedProject || null
  })
}
