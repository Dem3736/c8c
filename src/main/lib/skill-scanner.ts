import { readdir, readFile } from "node:fs/promises"
import { join, basename } from "node:path"
import matter from "gray-matter"
import type { DiscoveredSkill } from "@shared/types"

const SCAN_DIRS = ["skills", "agents", "commands"] as const
type ScanDir = (typeof SCAN_DIRS)[number]

const DIR_TO_TYPE: Record<ScanDir, DiscoveredSkill["type"]> = {
  skills: "skill",
  agents: "agent",
  commands: "command",
}

async function scanDirectory(
  baseDir: string,
  type: DiscoveredSkill["type"],
): Promise<DiscoveredSkill[]> {
  const results: DiscoveredSkill[] = []

  async function walk(dir: string, category: string) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
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
            model: data.model,
            tools: data.tools,
            maxTurns: data.maxTurns || data.max_turns,
            allowedTools: data.allowedTools || data.allowed_tools,
            disallowedTools: data.disallowedTools || data.disallowed_tools,
          })
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  await walk(baseDir, "")
  return results
}

export async function scanSkills(projectPath: string): Promise<DiscoveredSkill[]> {
  const all: DiscoveredSkill[] = []
  const claudeDir = join(projectPath, ".claude")

  for (const dir of SCAN_DIRS) {
    const fullDir = join(claudeDir, dir)
    const skills = await scanDirectory(fullDir, DIR_TO_TYPE[dir])
    all.push(...skills)
  }

  return all
}

export async function scanUserSkills(): Promise<DiscoveredSkill[]> {
  const home = process.env.HOME || process.env.USERPROFILE || ""
  const claudeDir = join(home, ".claude")
  const all: DiscoveredSkill[] = []

  for (const dir of SCAN_DIRS) {
    const fullDir = join(claudeDir, dir)
    const skills = await scanDirectory(fullDir, DIR_TO_TYPE[dir])
    all.push(...skills)
  }

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
    const key = `${skill.type}:${skill.name}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(skill)
    }
  }
  return merged
}
