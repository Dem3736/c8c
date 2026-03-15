import { readdir, readFile, mkdir, access, rm } from "node:fs/promises"
import { join, basename } from "node:path"
import { homedir } from "node:os"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import matter from "gray-matter"
import type { DiscoveredSkill } from "@shared/types"
import { logWarn } from "./structured-log"

const execFileAsync = promisify(execFile)

const LIBRARIES_DIR = join(homedir(), ".c8c", "libraries")

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === "string") return code
  }
  return undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export interface SkillLibrary {
  id: string
  name: string
  description: string
  repo: string
  enabled: boolean
  installed: boolean
  scanPattern: LibraryScanPattern
}

interface LibraryScanPattern {
  /** How to find .md files in this repo */
  type: "flat-categories" | "skill-dirs"
  /** Root directory inside the repo to start scanning */
  root?: string
  /** Directories to skip */
  exclude?: string[]
  /** Skill type to assign */
  skillType: DiscoveredSkill["type"]
  /** Default category label for discovered skills */
  category?: string
}

// Pre-defined libraries
export const PREDEFINED_LIBRARIES: Omit<SkillLibrary, "installed">[] = [
  {
    id: "agency-agents",
    name: "Agency Agents",
    description:
      "23+ pre-built agents across design, engineering, marketing, product, testing, and more",
    repo: "https://github.com/msitarzewski/agency-agents.git",
    enabled: true,
    scanPattern: {
      type: "flat-categories",
      exclude: [
        ".github",
        "strategy",
        "examples",
        "node_modules",
      ],
      skillType: "agent",
    },
  },
  {
    id: "gtm-skills",
    name: "GTM Skills",
    description:
      "Go-to-market skills: market research, email generation, list building, enrichment, and more",
    repo: "https://github.com/extruct-ai/gtm-skills.git",
    enabled: true,
    scanPattern: {
      type: "skill-dirs",
      root: "skills",
      category: "gtm",
      skillType: "skill",
    },
  },
  {
    id: "anthropic-skills",
    name: "Anthropic Skills",
    description:
      "Official skills from Anthropic: PDF, DOCX, PPTX, XLSX, design, webapp testing, and more",
    repo: "https://github.com/anthropics/skills.git",
    enabled: true,
    scanPattern: {
      type: "skill-dirs",
      root: "skills",
      category: "anthropic",
      skillType: "skill",
    },
  },
  {
    id: "jeff-allan-skills",
    name: "Claude Skills Pack",
    description:
      "66 full-stack development skills: architecture, debugging, testing, DevOps, frameworks, and more",
    repo: "https://github.com/Jeffallan/claude-skills.git",
    enabled: true,
    scanPattern: {
      type: "skill-dirs",
      root: "skills",
      category: "dev",
      skillType: "skill",
    },
  },
  {
    id: "composio-skills",
    name: "Composio Skills",
    description:
      "28+ community skills: content creation, design, research, automation, and SaaS integrations",
    repo: "https://github.com/ComposioHQ/awesome-claude-skills.git",
    enabled: true,
    scanPattern: {
      type: "skill-dirs",
      exclude: ["connect-apps-plugin", "template-skill"],
      category: "composio",
      skillType: "skill",
    },
  },
]

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function ensureLibrariesDir(): Promise<string> {
  await mkdir(LIBRARIES_DIR, { recursive: true })
  return LIBRARIES_DIR
}

export async function getLibraryPath(id: string): Promise<string> {
  return join(LIBRARIES_DIR, id)
}

export async function installLibrary(lib: Omit<SkillLibrary, "installed">): Promise<void> {
  await ensureLibrariesDir()
  const dest = join(LIBRARIES_DIR, lib.id)

  if (await exists(dest)) {
    // Pull latest
    await execFileAsync("git", ["pull", "--ff-only"], { cwd: dest, timeout: 30_000 })
  } else {
    // Clone
    await execFileAsync("git", ["clone", "--depth", "1", lib.repo, dest], {
      timeout: 60_000,
    })
  }
}

export async function removeLibrary(id: string): Promise<void> {
  const dest = join(LIBRARIES_DIR, id)
  if (await exists(dest)) {
    await rm(dest, { recursive: true, force: true })
  }
}

export async function isLibraryInstalled(id: string): Promise<boolean> {
  return exists(join(LIBRARIES_DIR, id))
}

export async function getLibraries(): Promise<SkillLibrary[]> {
  const results: SkillLibrary[] = []
  for (const lib of PREDEFINED_LIBRARIES) {
    const installed = await isLibraryInstalled(lib.id)
    results.push({ ...lib, installed })
  }
  return results
}

/** Scan a library for skills based on its scan pattern */
export async function scanLibrary(lib: SkillLibrary): Promise<DiscoveredSkill[]> {
  if (!lib.installed || !lib.enabled) return []

  const libPath = join(LIBRARIES_DIR, lib.id)
  const pattern = lib.scanPattern

  if (pattern.type === "flat-categories") {
    return scanFlatCategories(libPath, pattern)
  } else {
    return scanSkillDirs(libPath, pattern)
  }
}

/**
 * agency-agents style: each top-level dir is a category,
 * .md files inside are agents
 */
async function scanFlatCategories(
  root: string,
  pattern: LibraryScanPattern,
): Promise<DiscoveredSkill[]> {
  const results: DiscoveredSkill[] = []
  const exclude = new Set(pattern.exclude || [])

  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      logWarn("libraries", "scan_root_read_failed", {
        libraryRoot: root,
        error: errorMessage(error),
      })
    }
    return []
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (exclude.has(entry.name)) continue
    if (entry.name.startsWith(".")) continue

    const categoryDir = join(root, entry.name)
    let files
    try {
      files = await readdir(categoryDir, { withFileTypes: true })
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        logWarn("libraries", "scan_category_read_failed", {
          categoryDir,
          libraryRoot: root,
          error: errorMessage(error),
        })
      }
      continue
    }

    for (const file of files) {
      if (!file.name.endsWith(".md")) continue
      if (file.name === "README.md") continue

      const fullPath = join(categoryDir, file.name)
      try {
        const content = await readFile(fullPath, "utf-8")
        const { data } = matter(content)
        results.push({
          type: pattern.skillType,
          name: data.name || basename(file.name, ".md"),
          description: data.description || "",
          category: entry.name,
          path: fullPath,
          format: "claude-markdown",
          sourceScope: "library",
          model: data.model,
          tools: data.tools,
          maxTurns: data.maxTurns || data.max_turns,
          allowedTools: data.allowedTools || data.allowed_tools,
          disallowedTools: data.disallowedTools || data.disallowed_tools,
        })
      } catch (error) {
        if (errorCode(error) !== "ENOENT") {
          logWarn("libraries", "scan_skill_file_failed", {
            path: fullPath,
            category: entry.name,
            libraryRoot: root,
            error: errorMessage(error),
          })
        }
      }
    }
  }

  return results
}

/**
 * gtm-skills style: skills/{skill-name}/SKILL.md
 */
async function scanSkillDirs(
  root: string,
  pattern: LibraryScanPattern,
): Promise<DiscoveredSkill[]> {
  const results: DiscoveredSkill[] = []
  const scanRoot = pattern.root ? join(root, pattern.root) : root
  const exclude = new Set(pattern.exclude || [])
  const category = pattern.category || basename(scanRoot)

  let entries
  try {
    entries = await readdir(scanRoot, { withFileTypes: true })
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      logWarn("libraries", "scan_root_read_failed", {
        libraryRoot: root,
        scanRoot,
        error: errorMessage(error),
      })
    }
    return []
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith(".")) continue
    if (exclude.has(entry.name)) continue

    const skillFile = join(scanRoot, entry.name, "SKILL.md")
    try {
      const content = await readFile(skillFile, "utf-8")
      const { data } = matter(content)
      results.push({
        type: pattern.skillType,
        name: data.name || entry.name,
        description: data.description || "",
        category,
        path: skillFile,
        format: "codex-skill",
        sourceScope: "library",
        model: data.model,
        tools: data.tools,
        maxTurns: data.maxTurns || data.max_turns,
        allowedTools: data.allowedTools || data.allowed_tools,
        disallowedTools: data.disallowedTools || data.disallowed_tools,
      })
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        logWarn("libraries", "scan_skill_file_failed", {
          path: skillFile,
          category,
          libraryRoot: root,
          error: errorMessage(error),
        })
      }
    }
  }

  return results
}

/** Scan all enabled+installed libraries */
export async function scanAllLibraries(): Promise<DiscoveredSkill[]> {
  const libs = await getLibraries()
  const results: DiscoveredSkill[] = []

  for (const lib of libs) {
    if (lib.installed && lib.enabled) {
      const skills = await scanLibrary(lib)
      // Tag with library source
      for (const skill of skills) {
        skill.library = lib.id
      }
      results.push(...skills)
    }
  }

  return results
}
