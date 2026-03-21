import { existsSync, realpathSync } from "node:fs"
import { ensureLibrariesDir } from "./libraries"
import { ensurePluginMarketplacesDir } from "./plugins"
import { loadProjectsConfig } from "./projects-config"
import { ensureChainsDir } from "./yaml-io"
import { basename, dirname, join, relative, resolve } from "node:path"

function dedupeResolved(paths: string[]): string[] {
  return [...new Set(paths.map((value) => resolve(value)))]
}

function canonicalizePath(inputPath: string): string {
  const resolvedPath = resolve(inputPath)
  if (existsSync(resolvedPath)) {
    return realpathSync(resolvedPath)
  }
  const parentPath = dirname(resolvedPath)
  if (parentPath === resolvedPath) {
    return resolvedPath
  }
  return join(canonicalizePath(parentPath), basename(resolvedPath))
}

export function isWithinRoot(candidatePath: string, rootPath: string): boolean {
  const candidate = canonicalizePath(candidatePath)
  const root = canonicalizePath(rootPath)
  const rel = relative(root, candidate)
  return rel === "" || (!rel.startsWith("..") && !rel.includes("..\\"))
}

export function assertWithinRoots(
  candidatePath: string,
  allowedRoots: string[],
  label: string,
): string {
  const resolvedPath = resolve(candidatePath)
  if (!allowedRoots.some((root) => isWithinRoot(resolvedPath, root))) {
    throw new Error(`${label} is outside allowed directories`)
  }
  return resolvedPath
}

export async function allowedProjectRoots(): Promise<string[]> {
  const config = await loadProjectsConfig()
  return dedupeResolved(config.projects)
}

export async function allowedWorkflowRoots(): Promise<string[]> {
  const globalChainsDir = await ensureChainsDir()
  const projectRoots = await allowedProjectRoots()
  const perProjectWorkflowRoots = projectRoots.flatMap((projectRoot) => [
    join(projectRoot, ".c8c"),
    join(projectRoot, ".claude", "workflows"),
  ])
  return dedupeResolved([globalChainsDir, ...perProjectWorkflowRoots])
}

export async function allowedReportRoots(): Promise<string[]> {
  const projectRoots = await allowedProjectRoots()
  return dedupeResolved(projectRoots.map((projectRoot) => join(projectRoot, ".c8c", "runs")))
}

export async function allowedOpenPathRoots(): Promise<string[]> {
  const projectRoots = await allowedProjectRoots()
  const globalChainsDir = await ensureChainsDir()
  const librariesDir = await ensureLibrariesDir()
  const pluginMarketplacesDir = await ensurePluginMarketplacesDir()
  return dedupeResolved([globalChainsDir, librariesDir, pluginMarketplacesDir, ...projectRoots])
}
