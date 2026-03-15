import { readdir, readFile } from "node:fs/promises"
import { join, basename } from "node:path"
import matter from "gray-matter"
import type { DiscoveredSkill } from "@shared/types"
import { logWarn } from "./structured-log"

const SCAN_DIRS = ["skills", "agents", "commands"] as const
type ScanDir = (typeof SCAN_DIRS)[number]

const DIR_TO_TYPE: Record<ScanDir, DiscoveredSkill["type"]> = {
  skills: "skill",
  agents: "agent",
  commands: "command",
}

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

async function scanDirectory(
  baseDir: string,
  type: DiscoveredSkill["type"],
  format: DiscoveredSkill["format"],
  sourceScope: DiscoveredSkill["sourceScope"],
): Promise<DiscoveredSkill[]> {
  const results: DiscoveredSkill[] = []

  async function walk(dir: string, category: string) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        logWarn("skill-scanner", "scan_dir_read_failed", {
          dir,
          type,
          category,
          error: errorMessage(error),
        })
      }
      return
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath, category ? `${category}/${entry.name}` : entry.name)
      } else if (entry.name.endsWith(".md") && entry.name !== "README.md") {
        try {
          const content = await readFile(fullPath, "utf-8")
          const { data } = matter(content)
          results.push({
            type,
            name: data.name || basename(entry.name, ".md"),
            description: data.description || "",
            category: category || "uncategorized",
            path: fullPath,
            format,
            sourceScope,
            model: data.model,
            tools: data.tools,
            maxTurns: data.maxTurns || data.max_turns,
            allowedTools: data.allowedTools || data.allowed_tools,
            disallowedTools: data.disallowedTools || data.disallowed_tools,
          })
        } catch (error) {
          if (errorCode(error) !== "ENOENT") {
            logWarn("skill-scanner", "skill_file_parse_failed", {
              path: fullPath,
              type,
              category,
              error: errorMessage(error),
            })
          }
        }
      }
    }
  }

  await walk(baseDir, "")
  return results
}

async function scanCodexSkillDirs(
  baseDir: string,
  sourceScope: DiscoveredSkill["sourceScope"],
): Promise<DiscoveredSkill[]> {
  const results: DiscoveredSkill[] = []

  async function walk(dir: string, category = ""): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        logWarn("skill-scanner", "scan_codex_dir_failed", {
          dir,
          category,
          error: errorMessage(error),
        })
      }
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillDir = join(dir, entry.name)
      const skillFile = join(skillDir, "SKILL.md")

      try {
        const content = await readFile(skillFile, "utf-8")
        const { data } = matter(content)
        results.push({
          type: "skill",
          name: data.name || entry.name,
          description: data.description || "",
          category: category || "codex",
          path: skillFile,
          format: "codex-skill",
          sourceScope,
          model: data.model,
          tools: data.tools,
          maxTurns: data.maxTurns || data.max_turns,
          allowedTools: data.allowedTools || data.allowed_tools,
          disallowedTools: data.disallowedTools || data.disallowed_tools,
        })
        continue
      } catch (error) {
        if (errorCode(error) !== "ENOENT") {
          logWarn("skill-scanner", "scan_codex_skill_failed", {
            path: skillFile,
            error: errorMessage(error),
          })
        }
      }

      await walk(skillDir, category ? `${category}/${entry.name}` : entry.name)
    }
  }

  await walk(baseDir)
  return results
}

export async function scanSkills(projectPath: string): Promise<DiscoveredSkill[]> {
  const all: DiscoveredSkill[] = []
  const claudeDir = join(projectPath, ".claude")
  const codexDir = join(projectPath, ".agents", "skills")

  for (const dir of SCAN_DIRS) {
    const fullDir = join(claudeDir, dir)
    const skills = await scanDirectory(fullDir, DIR_TO_TYPE[dir], "claude-markdown", "project")
    all.push(...skills)
  }

  all.push(...await scanCodexSkillDirs(codexDir, "project"))
  return all
}

export async function scanUserSkills(): Promise<DiscoveredSkill[]> {
  const home = process.env.HOME || process.env.USERPROFILE || ""
  const claudeDir = join(home, ".claude")
  const codexDir = join(home, ".codex", "skills")
  const all: DiscoveredSkill[] = []

  for (const dir of SCAN_DIRS) {
    const fullDir = join(claudeDir, dir)
    const skills = await scanDirectory(fullDir, DIR_TO_TYPE[dir], "claude-markdown", "user")
    all.push(...skills)
  }

  all.push(...await scanCodexSkillDirs(codexDir, "user"))
  return all
}

export async function scanAllSkills(projectPath: string): Promise<DiscoveredSkill[]> {
  const [projectSkills, userSkills] = await Promise.all([
    scanSkills(projectPath),
    scanUserSkills(),
  ])

  // Project skills take priority — deduplicate by name
  const seen = new Set<string>()
  const merged: DiscoveredSkill[] = []
  for (const skill of [...projectSkills, ...userSkills]) {
    const key = `${skill.type}:${skill.category}:${skill.name}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(skill)
    }
  }
  return merged
}
