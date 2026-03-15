import { execFile as execFileCb, execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, join } from "node:path"
import { promisify } from "node:util"
import { getCodexApiKey } from "./provider-settings"

const execFile = promisify(execFileCb)
let codexExecSupportPromise: Promise<boolean> | null = null
let codexShellEnvPromise: Promise<Record<string, string>> | null = null

export interface ExecCodexResult {
  stdout: string
  stderr: string
}

function bundledCodexBinaryName(): string {
  return process.platform === "win32" ? "codex.exe" : "codex"
}

function bundledCodexResourceDirs(): string[] {
  const dirs: string[] = []

  if (process.resourcesPath) {
    dirs.push(join(process.resourcesPath, "bin"))
  }

  dirs.push(join(process.cwd(), "resources", "bin", `${process.platform}-${process.arch}`))
  return [...new Set(dirs)]
}

export function findBundledCodexExecutable(): string | null {
  const binaryName = bundledCodexBinaryName()

  for (const directory of bundledCodexResourceDirs()) {
    const candidate = join(directory, binaryName)
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

export function buildCodexPath(existingPath: string | undefined): string {
  const home = homedir()
  const bundledCodexPath = findBundledCodexExecutable()
  const bundledDir = bundledCodexPath ? join(bundledCodexPath, "..") : undefined
  const extras = [
    bundledDir,
    `${home}/.local/bin`,
    `${home}/.nvm/versions/node/current/bin`,
    `${home}/.cargo/bin`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ]

  if (process.platform === "win32") {
    extras.push(`${home}\\AppData\\Roaming\\npm`)
  }

  const merged = [...extras, ...(existingPath ? [existingPath] : [])]
  return [...new Set(merged.filter(Boolean))].join(delimiter)
}

function collectStringEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined>): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") {
      env[key] = value
    }
  }
  return env
}

function parseNullDelimitedEnv(raw: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const pair of raw.split("\u0000")) {
    if (!pair) continue
    const equalsIndex = pair.indexOf("=")
    if (equalsIndex <= 0) continue
    const key = pair.slice(0, equalsIndex)
    const value = pair.slice(equalsIndex + 1)
    env[key] = value
  }
  return env
}

export async function getCodexShellEnv(): Promise<Record<string, string>> {
  if (codexShellEnvPromise) {
    return codexShellEnvPromise
  }

  codexShellEnvPromise = (async () => {
    if (process.platform === "win32") {
      return collectStringEnv(process.env)
    }

    const shell = process.env.SHELL || "/bin/zsh"

    try {
      const { stdout } = await execFile(shell, ["-lc", "env -0"], {
        timeout: 5_000,
        maxBuffer: 1024 * 1024 * 8,
        env: {
          ...process.env,
          PATH: buildCodexPath(process.env.PATH),
        },
      })

      const parsed = parseNullDelimitedEnv(stdout)
      if (Object.keys(parsed).length > 0) {
        return parsed
      }
    } catch {
      // Fall back to the current process environment.
    }

    return collectStringEnv(process.env)
  })()

  return codexShellEnvPromise
}

export async function buildCodexEnv(
  extraEnv?: Record<string, string>,
): Promise<NodeJS.ProcessEnv> {
  const bundledCodexPath = findBundledCodexExecutable()
  const env: NodeJS.ProcessEnv = {
    ...collectStringEnv(process.env),
    ...(await getCodexShellEnv()),
    PATH: buildCodexPath(process.env.PATH),
    ...extraEnv,
  }

  if (bundledCodexPath && !env.CODEX_PATH) {
    env.CODEX_PATH = bundledCodexPath
  }

  const codexApiKey = await getCodexApiKey()
  if (codexApiKey && !env.CODEX_API_KEY) {
    env.CODEX_API_KEY = codexApiKey
  }

  return env
}

export function findCodexExecutable(): string | null {
  const configured = process.env.CODEX_PATH
  if (configured && existsSync(configured)) return configured

  const bundled = findBundledCodexExecutable()
  if (bundled) return bundled

  const home = homedir()
  const candidates = [
    join(home, ".local", "bin", "codex"),
    join(home, ".nvm", "versions", "node", "current", "bin", "codex"),
    join(home, ".cargo", "bin", "codex"),
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
    "/usr/bin/codex",
  ]

  if (process.platform === "win32") {
    candidates.push(
      join(home, "AppData", "Roaming", "npm", "codex.cmd"),
      join(home, "AppData", "Roaming", "npm", "codex"),
    )
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  try {
    const resolved = execFileSync("which", ["codex"], {
      encoding: "utf-8",
      env: { ...process.env, PATH: buildCodexPath(process.env.PATH) },
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    return resolved || null
  } catch {
    return null
  }
}

export async function execCodex(
  args: string[],
  opts?: { timeout?: number; cwd?: string; extraEnv?: Record<string, string> },
): Promise<ExecCodexResult> {
  const executable = findCodexExecutable() || "codex"
  const env = await buildCodexEnv(opts?.extraEnv)
  const { stdout, stderr } = await execFile(executable, args, {
    timeout: opts?.timeout ?? 15_000,
    env,
    cwd: opts?.cwd,
  })
  return { stdout, stderr }
}

export async function supportsCodexExecSubcommand(): Promise<boolean> {
  if (!codexExecSupportPromise) {
    codexExecSupportPromise = (async () => {
      try {
        await execCodex(["exec", "--help"], { timeout: 5_000 })
        return true
      } catch {
        return false
      }
    })()
  }

  return codexExecSupportPromise
}
