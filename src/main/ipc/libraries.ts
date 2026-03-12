import { ipcMain } from "electron"
import {
  getLibraries,
  installLibrary,
  removeLibrary,
  PREDEFINED_LIBRARIES,
  scanAllLibraries,
} from "../lib/libraries"
import { trackTelemetryEvent } from "../lib/telemetry/service"

export function registerLibrariesHandlers() {
  ipcMain.handle("libraries:list", async () => {
    const startedAt = Date.now()
    const libraries = await getLibraries()
    const installedTotal = libraries.filter((library) => library.installed).length
    void trackTelemetryEvent("library_action", {
      action: "list",
      status: "success",
      libraries_total: libraries.length,
      installed_total: installedTotal,
      duration_ms: Date.now() - startedAt,
    })
    return libraries
  })

  ipcMain.handle("libraries:install", async (_e, id: string) => {
    const lib = PREDEFINED_LIBRARIES.find((l) => l.id === id)
    const startedAt = Date.now()
    if (!lib) {
      void trackTelemetryEvent("library_action", {
        action: "install",
        status: "failed",
        library_id: id,
        error_kind: "unknown_library",
      })
      throw new Error(`Unknown library: ${id}`)
    }

    try {
      await installLibrary(lib)
      void trackTelemetryEvent("library_action", {
        action: "install",
        status: "success",
        library_id: id,
        duration_ms: Date.now() - startedAt,
      })
    } catch (error) {
      void trackTelemetryEvent("library_action", {
        action: "install",
        status: "failed",
        library_id: id,
        duration_ms: Date.now() - startedAt,
        error_kind: "install_failed",
      })
      throw error
    }
    return true
  })

  ipcMain.handle("libraries:remove", async (_e, id: string) => {
    const lib = PREDEFINED_LIBRARIES.find((l) => l.id === id)
    const startedAt = Date.now()
    if (!lib) {
      void trackTelemetryEvent("library_action", {
        action: "remove",
        status: "failed",
        library_id: id,
        error_kind: "unknown_library",
      })
      throw new Error(`Unknown library: ${id}`)
    }

    try {
      await removeLibrary(id)
      void trackTelemetryEvent("library_action", {
        action: "remove",
        status: "success",
        library_id: id,
        duration_ms: Date.now() - startedAt,
      })
    } catch (error) {
      void trackTelemetryEvent("library_action", {
        action: "remove",
        status: "failed",
        library_id: id,
        duration_ms: Date.now() - startedAt,
        error_kind: "remove_failed",
      })
      throw error
    }
    return true
  })

  ipcMain.handle("libraries:scan", async () => {
    const startedAt = Date.now()
    try {
      const skills = await scanAllLibraries()
      const libraries = new Set<string>()
      for (const skill of skills) {
        if (skill.library) libraries.add(skill.library)
      }
      void trackTelemetryEvent("library_action", {
        action: "scan",
        status: "success",
        scanned_libraries_total: libraries.size,
        discovered_skills_total: skills.length,
        duration_ms: Date.now() - startedAt,
      })
      return skills
    } catch (error) {
      void trackTelemetryEvent("library_action", {
        action: "scan",
        status: "failed",
        duration_ms: Date.now() - startedAt,
        error_kind: "scan_failed",
      })
      throw error
    }
  })
}
