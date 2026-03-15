import {
  app,
  BrowserWindow,
  screen,
  shell,
  type BrowserWindowConstructorOptions,
} from "electron"
import { join } from "path"
import { emitDesktopRuntimeUpdate } from "./ipc/system"
import {
  flushTelemetryService,
  initTelemetryService,
  trackTelemetryEvent,
} from "./lib/telemetry/service"
import { initUpdater, shutdownUpdater } from "./lib/updater"
import { recoverRuntimeState } from "./lib/run-recovery"
import {
  configureDeepLinkProtocol,
  extractDeepLinkUrl,
  handleDeepLink,
} from "./deep-links"
import { registerMainHandlers } from "./register-handlers"
import {
  areBoundsEqual,
  loadWindowState,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  normalizeBounds,
  normalizeWindowState,
  persistWindowState,
} from "./window-state"

app.name = "c8c"

configureDeepLinkProtocol()

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let pendingDeepLinkUrl: string | null = null
const processStartedAt = Date.now()

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:"
  } catch {
    return false
  }
}

// macOS: open-url fires before whenReady on cold launch
app.on("open-url", (event, url) => {
  event.preventDefault()
  if (mainWindow && !mainWindow.isDestroyed()) {
    void handleDeepLink(url, mainWindow)
  } else {
    pendingDeepLinkUrl = url
  }
})

// Windows/Linux: second instance receives URL via argv
app.on("second-instance", (_event, argv) => {
  const url = extractDeepLinkUrl(argv)
  if (url) void handleDeepLink(url, mainWindow)
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  }
})

function createWindow() {
  const isMac = process.platform === "darwin"
  void loadWindowState().then((savedState) => {
    if (mainWindow) return
    const saved = normalizeWindowState(savedState)

    const windowOptions: BrowserWindowConstructorOptions = {
      title: "c8c",
      icon: join(__dirname, "../../build/icon.png"),
      width: saved.width,
      height: saved.height,
      ...(typeof saved.x === "number" && typeof saved.y === "number" ? { x: saved.x, y: saved.y } : {}),
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
      show: false,
      autoHideMenuBar: !isMac,
      ...(isMac ? {
        titleBarStyle: "hiddenInset",
        trafficLightPosition: { x: 12, y: 12 },
      } : {}),
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    }

    mainWindow = new BrowserWindow(windowOptions)
    const window = mainWindow

    const emitRuntime = () => emitDesktopRuntimeUpdate(window)
    let persistTimer: ReturnType<typeof setTimeout> | null = null

    const schedulePersist = () => {
      if (persistTimer) {
        clearTimeout(persistTimer)
      }
      persistTimer = setTimeout(() => {
        if (!window.isDestroyed()) {
          void persistWindowState(window)
        }
      }, 180)
    }

    const ensureWindowVisible = () => {
      if (window.isDestroyed() || window.isMaximized() || window.isFullScreen()) return
      const current = window.getBounds()
      const normalized = normalizeBounds(current)
      if (!areBoundsEqual(current, normalized)) {
        window.setBounds(normalized, false)
      }
    }

    const onDisplayChanged = () => {
      ensureWindowVisible()
    }

    screen.on("display-added", onDisplayChanged)
    screen.on("display-removed", onDisplayChanged)
    screen.on("display-metrics-changed", onDisplayChanged)

    if (saved.isMaximized) {
      window.maximize()
    }

    window.webContents.setWindowOpenHandler(({ url }) => {
      if (isSafeExternalUrl(url)) {
        void shell.openExternal(url)
      }
      return { action: "deny" }
    })

    window.webContents.on("will-navigate", (event, url) => {
      if (url === window.webContents.getURL()) return
      event.preventDefault()
      if (isSafeExternalUrl(url)) {
        void shell.openExternal(url)
      }
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      void window.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      void window.loadFile(join(__dirname, "../renderer/index.html"))
    }

    window.once("ready-to-show", () => {
      window.show()
      emitRuntime()
    })

    window.webContents.on("did-finish-load", () => {
      emitRuntime()
      if (pendingDeepLinkUrl) {
        void handleDeepLink(pendingDeepLinkUrl, window)
        pendingDeepLinkUrl = null
      }
    })

    window.on("resize", schedulePersist)
    window.on("move", schedulePersist)
    window.on("maximize", () => {
      schedulePersist()
      emitRuntime()
    })
    window.on("unmaximize", () => {
      schedulePersist()
      emitRuntime()
      ensureWindowVisible()
    })
    window.on("enter-full-screen", emitRuntime)
    window.on("leave-full-screen", emitRuntime)

    window.on("close", () => {
      if (persistTimer) {
        clearTimeout(persistTimer)
        persistTimer = null
      }
      void persistWindowState(window)
    })

    window.on("closed", () => {
      screen.off("display-added", onDisplayChanged)
      screen.off("display-removed", onDisplayChanged)
      screen.off("display-metrics-changed", onDisplayChanged)
      mainWindow = null
    })
  })
}

app.whenReady().then(async () => {
  if (process.platform === "darwin" && app.dock) {
    try {
      app.dock.setIcon(join(__dirname, "../../build/icon.png"))
    } catch { /* icon missing in dev is fine */ }
  }

  try {
    await initTelemetryService()
    await trackTelemetryEvent("app_started")
  } catch (error) {
    console.error("[main] telemetry init failed:", error)
  }

  try {
    const recovery = await recoverRuntimeState()
    await trackTelemetryEvent("runtime_recovery_completed", {
      roots: recovery.roots,
      workspaces: recovery.workspaces,
      stale_runs_updated: recovery.staleRunsUpdated,
      manifests_processed: recovery.manifestsProcessed,
      orphan_pids_killed: recovery.orphanPidsKilled,
      orphan_pids_missing: recovery.orphanPidsMissing,
      orphan_pids_failed: recovery.orphanPidsFailed,
    })
  } catch (error) {
    console.error("[main] runtime recovery failed:", error)
  }

  console.log("[main] app ready, registering IPC handlers...")
  registerMainHandlers(() => mainWindow)

  console.log("[main] all handlers registered, creating window...")
  createWindow()
  if (app.isPackaged) {
    initUpdater()
  }
  try {
    await trackTelemetryEvent("app_ready", { startup_ms: Date.now() - processStartedAt })
  } catch (error) {
    console.error("[main] telemetry app_ready failed:", error)
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("before-quit", () => {
  shutdownUpdater()
  void trackTelemetryEvent("app_quit", { uptime_ms: Date.now() - processStartedAt })
  void flushTelemetryService()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
