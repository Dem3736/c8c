import { execFile as execFileCb, execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, join } from "node:path"
import { promisify } from "node:util"
import { getCodexApiKey } from "./provider-settings"

const execFile = promisify(execFileCb)
let codexExecSupportPromise: Promise<boolean> | null = null

export interface ExecCodexResult {
  stdout: string
  stderr: string
}

export function buildCodexPath(existingPath: string | undefined): string {
  const home = homedir()
  const extras = [
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

export async function buildCodexEnv(
  extraEnv?: Record<string, string>,
): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = {
    HOME: process.env.HOME,
    USER: process.env.USER,
    LOGNAME: process.env.LOGNAME,
    USERPROFILE: process.env.USERPROFILE,
    SHELL: process.env.SHELL,
    TMPDIR: process.env.TMPDIR,
    TMP: process.env.TMP,
    TEMP: process.env.TEMP,
    LANG: process.env.LANG,
    LC_ALL: process.env.LC_ALL,
    LC_CTYPE: process.env.LC_CTYPE,
    SystemRoot: process.env.SystemRoot,
    SYSTEMROOT: process.env.SYSTEMROOT,
    ComSpec: process.env.ComSpec,
    COMSPEC: process.env.COMSPEC,
    APPDATA: process.env.APPDATA,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    PATH: buildCodexPath(process.env.PATH),
    ...extraEnv,
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
