import { ipcMain } from "electron"
import {
  getLibraries,
  installLibrary,
  removeLibrary,
  PREDEFINED_LIBRARIES,
  scanAllLibraries,
} from "../lib/libraries"

export function registerLibrariesHandlers() {
  ipcMain.handle("libraries:list", async () => {
    return getLibraries()
  })

  ipcMain.handle("libraries:install", async (_e, id: string) => {
    const lib = PREDEFINED_LIBRARIES.find((l) => l.id === id)
    if (!lib) throw new Error(`Unknown library: ${id}`)
    await installLibrary(lib)
    return true
  })

  ipcMain.handle("libraries:remove", async (_e, id: string) => {
    const lib = PREDEFINED_LIBRARIES.find((l) => l.id === id)
    if (!lib) throw new Error(`Unknown library: ${id}`)
    await removeLibrary(id)
    return true
  })

  ipcMain.handle("libraries:scan", async () => {
    return scanAllLibraries()
  })
}
