import { app } from "electron"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

export interface ProjectsConfig {
  projects: string[]
  lastSelectedProject?: string
}

function resolveHomeDir(): string {
  try {
    const home = app.getPath("home")
    if (home) return home
  } catch {
    // app.getPath can throw before app is ready in some contexts.
  }
  return homedir()
}

export function projectsConfigPath(): string {
  return join(resolveHomeDir(), ".c8c", "config.json")
}

export async function loadProjectsConfig(): Promise<ProjectsConfig> {
  try {
    const data = await readFile(projectsConfigPath(), "utf-8")
    const parsed = JSON.parse(data) as Partial<ProjectsConfig>
    const projects = Array.isArray(parsed.projects)
      ? parsed.projects.filter((value): value is string => typeof value === "string").map((value) => resolve(value))
      : []
    const lastSelectedProject = typeof parsed.lastSelectedProject === "string"
      ? resolve(parsed.lastSelectedProject)
      : undefined
    return { projects, lastSelectedProject }
  } catch {
    return { projects: [] }
  }
}

export async function saveProjectsConfig(config: ProjectsConfig): Promise<void> {
  const normalizedProjects = [...new Set(
    config.projects
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => resolve(value)),
  )]

  const payload: ProjectsConfig = {
    projects: normalizedProjects,
    lastSelectedProject: config.lastSelectedProject ? resolve(config.lastSelectedProject) : undefined,
  }

  await mkdir(join(resolveHomeDir(), ".c8c"), { recursive: true })
  await writeFile(projectsConfigPath(), JSON.stringify(payload, null, 2), "utf-8")
}

