import { app, type BrowserWindow } from "electron"
import { resolve } from "path"
import { fetchRemoteTemplate } from "./lib/templates/remote"

const TEMPLATE_ID_RE = /^\/([a-zA-Z0-9_-]+)$/

export function configureDeepLinkProtocol(): void {
  if (!app.isPackaged && process.argv[1]) {
    app.setAsDefaultProtocolClient("c8c", process.execPath, [resolve(process.argv[1])])
    return
  }

  app.setAsDefaultProtocolClient("c8c")
}

export function extractDeepLinkUrl(argv: string[]): string | null {
  return argv.find((arg) => arg.startsWith("c8c://")) || null
}

export function parseTemplateDeepLink(rawUrl: string): { templateId: string } | null {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }

  if (parsed.protocol !== "c8c:" || parsed.hostname !== "hub") {
    return null
  }

  const match = parsed.pathname.match(TEMPLATE_ID_RE)
  if (!match) {
    return null
  }

  return { templateId: match[1] }
}

export async function handleDeepLink(rawUrl: string, window: BrowserWindow | null): Promise<void> {
  const parsed = parseTemplateDeepLink(rawUrl)
  if (!parsed) {
    console.warn("[main] unsupported deep link:", rawUrl)
    return
  }

  if (!window || window.isDestroyed()) {
    console.warn("[main] no window available for deep link")
    return
  }

  try {
    const template = await fetchRemoteTemplate(parsed.templateId)
    window.webContents.send("template:deep-link", template)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    window.webContents.send("template:deep-link-error", {
      templateId: parsed.templateId,
      error: message,
    })
  }

  window.show()
  window.focus()
  if (process.platform === "darwin" && app.dock) {
    app.dock.bounce("informational")
  }
}
