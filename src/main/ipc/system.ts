import { app, BrowserWindow, ipcMain, shell } from "electron"
import { promisify } from "node:util"
import { execFile as execFileCb } from "node:child_process"
import type { DesktopPlatform, DesktopRuntimeInfo, TelemetryUiEvent } from "@shared/types"
import { getClaudeCodeSubscriptionStatus } from "../lib/claude-subscription"
import { allowedOpenPathRoots, allowedProjectRoots, assertWithinRoots } from "../lib/security-paths"
import { resolve } from "node:path"
import {
  getTelemetrySettings,
  setTelemetryConsent,
  trackTelemetryUiEvent,
} from "../lib/telemetry/service"
import { checkForUpdate, installUpdate, getUpdateStatus } from "../lib/updater"

const execFile = promisify(execFileCb)

let runtimeWindowProvider: (() => BrowserWindow | null) | null = null

function desktopPlatform(): DesktopPlatform {
  if (process.platform === "darwin") return "macos"
  if (process.platform === "win32") return "windows"
  return "linux"
}

function resolveRuntimeWindow(): BrowserWindow | null {
  if (runtimeWindowProvider) {
    const provided = runtimeWindowProvider()
    if (provided && !provided.isDestroyed()) return provided
  }
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed()) return focused
  return BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) ?? null
}

function desktopRuntimeInfo(window: BrowserWindow | null = resolveRuntimeWindow()): DesktopRuntimeInfo {
  const platform = desktopPlatform()
  const isMac = platform === "macos"
  const isFullscreen = Boolean(window?.isFullScreen())
  const isMaximized = Boolean(window?.isMaximized())
  return {
    platform,
    titlebarHeight: isMac && !isFullscreen ? 32 : 0,
    primaryModifierKey: isMac ? "meta" : "ctrl",
    primaryModifierLabel: isMac ? "⌘" : "Ctrl",
    isFullscreen,
    isMaximized,
  }
}

export function setDesktopRuntimeWindowProvider(provider: (() => BrowserWindow | null) | null): void {
  runtimeWindowProvider = provider
}

export function emitDesktopRuntimeUpdate(window: BrowserWindow | null): void {
  if (!window || window.isDestroyed()) return
  window.webContents.send("system:desktop-runtime-changed", desktopRuntimeInfo(window))
}

async function resolveGitBranch(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFile("git", ["-C", projectPath, "rev-parse", "--abbrev-ref", "HEAD"], {
      timeout: 1500,
    })
    const branch = stdout.trim()
    return branch || null
  } catch {
    return null
  }
}

export function registerSystemHandlers() {
  ipcMain.handle("system:get-app-version", () => app.getVersion())

  ipcMain.handle("system:get-desktop-runtime", () => {
    return desktopRuntimeInfo()
  })

  ipcMain.handle("system:get-project-status", async (_event, projectPath: string | null) => {
    if (!projectPath) {
      return { branch: null }
    }
    const safeProjectPath = resolve(projectPath)
    const allowedProjects = await allowedProjectRoots()
    if (!allowedProjects.some((root) => root === safeProjectPath)) {
      return { branch: null }
    }
    const branch = await resolveGitBranch(safeProjectPath)
    return { branch }
  })

  ipcMain.handle("system:get-claude-subscription-status", async () => {
    return getClaudeCodeSubscriptionStatus()
  })

  ipcMain.handle("system:get-telemetry-settings", async () => {
    return getTelemetrySettings()
  })

  ipcMain.handle("system:set-telemetry-consent", async (_event, enabled: boolean) => {
    return setTelemetryConsent(Boolean(enabled))
  })

  ipcMain.handle("system:track-ui-event", async (_event, eventName: TelemetryUiEvent) => {
    if (eventName !== "settings_opened") return false
    await trackTelemetryUiEvent(eventName)
    return true
  })

  ipcMain.handle("system:open-path", async (_event, path: string) => {
    const allowedRoots = await allowedOpenPathRoots()
    const safePath = assertWithinRoots(resolve(path), allowedRoots, "Open path")
    return shell.openPath(safePath)
  })

  ipcMain.handle("system:show-in-finder", async (_event, path: string) => {
    const allowedRoots = await allowedOpenPathRoots()
    const safePath = assertWithinRoots(resolve(path), allowedRoots, "Show in Finder")
    shell.showItemInFolder(safePath)
    return true
  })

  // Auto-updater
  ipcMain.handle("system:check-for-update", async () => {
    await checkForUpdate()
    return getUpdateStatus()
  })

  ipcMain.handle("system:install-update", () => {
    installUpdate()
    return true
  })

  ipcMain.handle("system:get-update-status", () => {
    return getUpdateStatus()
  })
}
