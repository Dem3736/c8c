import { app, BrowserWindow, ipcMain, Menu, shell, type MenuItemConstructorOptions } from "electron"
import { promisify } from "node:util"
import { execFile as execFileCb } from "node:child_process"
import type {
  ClaudeCodeSubscriptionStatus,
  DesktopPlatform,
  DesktopRuntimeInfo,
  ProviderDiagnostics,
  ProviderId,
  ProviderSettings,
  TelemetryUiEvent,
} from "@shared/types"
import { createDefaultDesktopMenuState, type DesktopCommandId, type DesktopMenuState } from "@shared/desktop-commands"
import { getClaudeCodeSubscriptionStatus } from "../lib/claude-subscription"
import { allowedOpenPathRoots, allowedProjectRoots, assertWithinRoots } from "../lib/security-paths"
import { resolve } from "node:path"
import { isTestMode } from "../lib/runtime-paths"
import {
  getTelemetrySettings,
  setTelemetryConsent,
  trackTelemetryUiEvent,
} from "../lib/telemetry/service"
import { checkForUpdate, installUpdate, getUpdateStatus } from "../lib/updater"
import {
  clearCodexApiKey,
  getProviderSettings,
  setCodexApiKey,
  updateProviderSettings,
} from "../lib/provider-settings"
import { execClaude } from "../lib/claude-cli"
import { execCodex } from "../lib/codex-cli"
import { resolveAgentProvider } from "../lib/providers"

const execFile = promisify(execFileCb)

let runtimeWindowProvider: (() => BrowserWindow | null) | null = null
let desktopMenuState: DesktopMenuState = createDefaultDesktopMenuState()

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

function emitDesktopCommand(commandId: DesktopCommandId): void {
  const window = resolveRuntimeWindow()
  if (!window || window.isDestroyed()) return
  window.webContents.send("system:desktop-command", commandId)
}

function fileMenuItem(
  label: string,
  accelerator: string | undefined,
  state: { enabled: boolean; visible?: boolean },
  commandId: DesktopCommandId,
): MenuItemConstructorOptions {
  return {
    label,
    accelerator,
    enabled: state.enabled,
    visible: state.visible ?? true,
    click: () => emitDesktopCommand(commandId),
  }
}

function checkboxMenuItem(
  label: string,
  accelerator: string | undefined,
  state: { enabled: boolean; checked?: boolean; visible?: boolean },
  commandId: DesktopCommandId,
): MenuItemConstructorOptions {
  return {
    type: "checkbox",
    label,
    accelerator,
    enabled: state.enabled,
    checked: Boolean(state.checked),
    visible: state.visible ?? true,
    click: () => emitDesktopCommand(commandId),
  }
}

function buildDesktopMenuTemplate(state: DesktopMenuState): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = []

  if (process.platform === "darwin") {
    template.push({
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    })
  }

  template.push(
    {
      label: "File",
      submenu: [
        fileMenuItem("Save", "CommandOrControl+S", state.file.save, "file.save"),
        fileMenuItem("Save As...", "CommandOrControl+Shift+S", state.file.saveAs, "file.save_as"),
        { type: "separator" },
        fileMenuItem("Export Flow...", undefined, state.file.export, "file.export"),
        fileMenuItem("Import Flow...", undefined, state.file.import, "file.import"),
      ],
    },
    {
      label: "Edit",
      submenu: [
        fileMenuItem("Undo", "CommandOrControl+Z", state.edit.undo, "edit.undo"),
        fileMenuItem("Redo", "CommandOrControl+Shift+Z", state.edit.redo, "edit.redo"),
      ],
    },
    {
      label: "View",
      submenu: [
        checkboxMenuItem("Flow Defaults", undefined, state.view.defaults, "view.defaults"),
        checkboxMenuItem("Edit Flow", "CommandOrControl+E", state.view.editFlow, "view.edit_flow"),
        checkboxMenuItem("Toggle Agent Panel", "CommandOrControl+L", state.view.toggleAgentPanel, "view.toggle_agent_panel"),
      ],
    },
    {
      label: "Flow",
      submenu: [
        fileMenuItem("Run", "CommandOrControl+Enter", state.flow.run, "flow.run"),
        fileMenuItem("Run Again", undefined, state.flow.runAgain, "flow.run_again"),
        fileMenuItem("Rerun from Step...", undefined, state.flow.rerunFromStep, "flow.rerun_from_step"),
        fileMenuItem("Cancel", undefined, state.flow.cancel, "flow.cancel"),
        fileMenuItem("Batch Run", undefined, state.flow.batchRun, "flow.batch_run"),
        { type: "separator" },
        fileMenuItem("History", undefined, state.flow.history, "flow.history"),
      ],
    },
  )

  return template
}

function refreshDesktopMenu(): void {
  if (typeof app.isReady === "function" && !app.isReady()) return
  const menu = Menu.buildFromTemplate(buildDesktopMenuTemplate(desktopMenuState))
  Menu.setApplicationMenu(menu)
}

function desktopRuntimeInfo(window: BrowserWindow | null = resolveRuntimeWindow()): DesktopRuntimeInfo {
  const platform = desktopPlatform()
  const isMac = platform === "macos"
  const isFullscreen = Boolean(window?.isFullScreen())
  const isMaximized = Boolean(window?.isMaximized())
  return {
    platform,
    titlebarHeight: isMac && !isFullscreen ? 24 : 0,
    primaryModifierKey: isMac ? "meta" : "ctrl",
    primaryModifierLabel: isMac ? "⌘" : "Ctrl",
    isFullscreen,
    isMaximized,
  }
}

export function setDesktopRuntimeWindowProvider(provider: (() => BrowserWindow | null) | null): void {
  runtimeWindowProvider = provider
  refreshDesktopMenu()
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

async function getProviderDiagnostics(): Promise<ProviderDiagnostics> {
  const providerSettings = await getProviderSettings()
  if (isTestMode()) {
    return {
      settings: providerSettings,
      health: {
        claude: {
          provider: "claude",
          available: true,
          executablePath: "/test/bin/claude",
          version: "test",
          error: null,
        },
        codex: {
          provider: "codex",
          available: true,
          executablePath: "/test/bin/codex",
          version: "test",
          error: null,
        },
      },
      auth: {
        claude: {
          provider: "claude",
          state: "authenticated",
          authenticated: true,
          authMethod: "test-mode",
          accountLabel: "Test Claude",
          apiKeyConfigured: true,
          error: null,
        },
        codex: {
          provider: "codex",
          state: "authenticated",
          authenticated: true,
          authMethod: "test-mode",
          accountLabel: "Test Codex",
          apiKeyConfigured: true,
          error: null,
        },
      },
    }
  }

  const [settings, claudeHealth, codexHealth, claudeAuth, codexAuth] = await Promise.all([
    Promise.resolve(providerSettings),
    resolveAgentProvider("claude").checkAvailability(),
    resolveAgentProvider("codex").checkAvailability(),
    resolveAgentProvider("claude").getAuthStatus(),
    resolveAgentProvider("codex").getAuthStatus(),
  ])

  return {
    settings,
    health: {
      claude: claudeHealth,
      codex: codexHealth,
    },
    auth: {
      claude: claudeAuth,
      codex: codexAuth,
    },
  }
}

function getTestSubscriptionStatus(): ClaudeCodeSubscriptionStatus {
  return {
    checkedAt: Date.now(),
    cliInstalled: true,
    loggedIn: true,
    authMethod: "test-mode",
    apiProvider: "anthropic",
    hasSubscription: true,
    error: null,
  }
}

export function registerSystemHandlers() {
  refreshDesktopMenu()

  ipcMain.handle("system:get-app-version", () => app.getVersion())

  ipcMain.handle("system:get-desktop-runtime", () => {
    return desktopRuntimeInfo()
  })

  ipcMain.handle("system:update-desktop-menu-state", async (_event, state: DesktopMenuState) => {
    desktopMenuState = state
    refreshDesktopMenu()
    return true
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
    if (isTestMode()) {
      return getTestSubscriptionStatus()
    }
    return getClaudeCodeSubscriptionStatus()
  })

  ipcMain.handle("system:get-provider-diagnostics", async () => {
    return getProviderDiagnostics()
  })

  ipcMain.handle("system:update-provider-settings", async (_event, patch: Partial<ProviderSettings>) => {
    return updateProviderSettings(patch)
  })

  ipcMain.handle("system:set-codex-api-key", async (_event, apiKey: string) => {
    await setCodexApiKey(apiKey)
    return getProviderDiagnostics()
  })

  ipcMain.handle("system:clear-codex-api-key", async () => {
    await clearCodexApiKey()
    return getProviderDiagnostics()
  })

  ipcMain.handle("system:logout-provider", async (_event, provider: ProviderId) => {
    if (provider === "codex") {
      try {
        await execCodex(["logout"], { timeout: 15_000 })
      } catch {
        // Best effort only: app-managed API key may still be the active auth path.
      }
      await clearCodexApiKey()
      return getProviderDiagnostics()
    }

    if (provider === "claude") {
      try {
        await execClaude(["logout"], { timeout: 15_000 })
      } catch {
        // Claude logout is best effort.
      }
      return getProviderDiagnostics()
    }

    return getProviderDiagnostics()
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
    if (!app.isPackaged) {
      return { status: "error" as const, error: "Auto-updates are not available in development mode." }
    }
    await checkForUpdate()
    return getUpdateStatus()
  })

  ipcMain.handle("system:install-update", () => {
    if (!app.isPackaged) return false
    installUpdate()
    return true
  })

  ipcMain.handle("system:get-update-status", () => {
    if (!app.isPackaged) {
      return { status: "error" as const, error: "Auto-updates are not available in development mode." }
    }
    return getUpdateStatus()
  })
}
