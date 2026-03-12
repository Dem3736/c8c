import {
  app,
  BrowserWindow,
  screen,
  shell,
  type BrowserWindowConstructorOptions,
  type Rectangle,
} from "electron"
import { join } from "path"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { registerIpcHandlers } from "./ipc/projects"
import { registerSkillsHandlers } from "./ipc/skills"
import { registerWorkflowsHandlers } from "./ipc/workflows"
import { registerExecutorHandlers } from "./ipc/executor"
import { registerLibrariesHandlers } from "./ipc/libraries"
import { registerTemplateHandlers } from "./ipc/templates"
import {
  emitDesktopRuntimeUpdate,
  registerSystemHandlers,
  setDesktopRuntimeWindowProvider,
} from "./ipc/system"
import { registerChatHandlers } from "./ipc/chat"
import {
  flushTelemetryService,
  initTelemetryService,
  trackTelemetryEvent,
} from "./lib/telemetry/service"
import { initUpdater, shutdownUpdater } from "./lib/updater"

app.name = "c8c"

let mainWindow: BrowserWindow | null = null
const processStartedAt = Date.now()

interface PersistedWindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized: boolean
}

const DEFAULT_WINDOW_STATE: PersistedWindowState = {
  width: 1280,
  height: 840,
  isMaximized: false,
}

const MIN_WINDOW_WIDTH = 900
const MIN_WINDOW_HEIGHT = 640

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function intersectionArea(a: Rectangle, b: Rectangle): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return xOverlap * yOverlap
}

function normalizeBounds(bounds: Rectangle): Rectangle {
  const nearestDisplay = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea
  const width = clamp(bounds.width, MIN_WINDOW_WIDTH, Math.max(MIN_WINDOW_WIDTH, nearestDisplay.width))
  const height = clamp(bounds.height, MIN_WINDOW_HEIGHT, Math.max(MIN_WINDOW_HEIGHT, nearestDisplay.height))

  const candidate: Rectangle = { x: bounds.x, y: bounds.y, width, height }
  const isVisible = screen.getAllDisplays().some((display) => {
    const visibleArea = intersectionArea(candidate, display.workArea)
    return visibleArea >= Math.min(candidate.width * candidate.height * 0.15, 120_000)
  })

  if (!isVisible) {
    const primary = screen.getPrimaryDisplay().workArea
    const centeredWidth = clamp(width, MIN_WINDOW_WIDTH, Math.max(MIN_WINDOW_WIDTH, primary.width))
    const centeredHeight = clamp(height, MIN_WINDOW_HEIGHT, Math.max(MIN_WINDOW_HEIGHT, primary.height))
    return {
      x: Math.round(primary.x + (primary.width - centeredWidth) / 2),
      y: Math.round(primary.y + (primary.height - centeredHeight) / 2),
      width: centeredWidth,
      height: centeredHeight,
    }
  }

  const display = screen.getDisplayMatching(candidate).workArea
  const maxX = display.x + Math.max(0, display.width - width)
  const maxY = display.y + Math.max(0, display.height - height)

  return {
    x: clamp(candidate.x, display.x, maxX),
    y: clamp(candidate.y, display.y, maxY),
    width,
    height,
  }
}

function normalizeWindowState(saved: PersistedWindowState): PersistedWindowState {
  const hasPosition = typeof saved.x === "number" && typeof saved.y === "number"
  if (!hasPosition) {
    const primary = screen.getPrimaryDisplay().workArea
    return {
      ...saved,
      width: clamp(saved.width, MIN_WINDOW_WIDTH, Math.max(MIN_WINDOW_WIDTH, primary.width)),
      height: clamp(saved.height, MIN_WINDOW_HEIGHT, Math.max(MIN_WINDOW_HEIGHT, primary.height)),
    }
  }

  const x = saved.x as number
  const y = saved.y as number
  const normalized = normalizeBounds({
    x,
    y,
    width: saved.width,
    height: saved.height,
  })

  return {
    ...saved,
    x: normalized.x,
    y: normalized.y,
    width: normalized.width,
    height: normalized.height,
  }
}

function areBoundsEqual(a: Rectangle, b: Rectangle): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

function windowStatePath() {
  return join(app.getPath("userData"), "window-state.json")
}

async function loadWindowState(): Promise<PersistedWindowState> {
  try {
    const raw = await readFile(windowStatePath(), "utf-8")
    const parsed = JSON.parse(raw) as Partial<PersistedWindowState>
    return {
      width: typeof parsed.width === "number" ? Math.max(MIN_WINDOW_WIDTH, Math.round(parsed.width)) : DEFAULT_WINDOW_STATE.width,
      height: typeof parsed.height === "number" ? Math.max(MIN_WINDOW_HEIGHT, Math.round(parsed.height)) : DEFAULT_WINDOW_STATE.height,
      x: typeof parsed.x === "number" ? Math.round(parsed.x) : undefined,
      y: typeof parsed.y === "number" ? Math.round(parsed.y) : undefined,
      isMaximized: Boolean(parsed.isMaximized),
    }
  } catch {
    return DEFAULT_WINDOW_STATE
  }
}

async function persistWindowState(window: BrowserWindow): Promise<void> {
  const isMaximized = window.isMaximized()
  const bounds: Rectangle = isMaximized ? window.getNormalBounds() : window.getBounds()
  const payload: PersistedWindowState = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized,
  }

  try {
    await mkdir(app.getPath("userData"), { recursive: true })
    await writeFile(windowStatePath(), JSON.stringify(payload, null, 2), "utf-8")
  } catch (error) {
    console.error("[main] failed to persist window state:", error)
  }
}

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:"
  } catch {
    return false
  }
}

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

    window.webContents.on("did-finish-load", emitRuntime)

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

  console.log("[main] app ready, registering IPC handlers...")
  setDesktopRuntimeWindowProvider(() => mainWindow)

  const handlers = [
    ["projects", registerIpcHandlers],
    ["skills", registerSkillsHandlers],
    ["workflows", registerWorkflowsHandlers],
    ["executor", registerExecutorHandlers],
    ["libraries", registerLibrariesHandlers],
    ["templates", registerTemplateHandlers],
    ["system", registerSystemHandlers],
    ["chat", registerChatHandlers],
  ] as const

  for (const [name, register] of handlers) {
    try {
      register()
      console.log(`[main] ✓ ${name} handlers registered`)
    } catch (err) {
      console.error(`[main] ✗ FAILED to register ${name} handlers:`, err)
    }
  }

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
