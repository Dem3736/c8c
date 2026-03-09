import { mkdir, writeFile, stat } from "node:fs/promises"
import { join, dirname, resolve } from "node:path"
import type { Workflow, SkillNodeConfig } from "@shared/types"
import YAML from "yaml"
import { isWithinRoot } from "./security-paths"

interface AvailableSkill {
  name: string
  category: string
}

export async function scaffoldMissingSkills(
  workflow: Workflow,
  availableSkills: AvailableSkill[],
  projectPath: string,
): Promise<Workflow> {
  const knownRefs = new Set(
    availableSkills.map((s) => `${s.category}/${s.name}`),
  )

  const updatedNodes = [...workflow.nodes]

  const skillsRoot = resolve(projectPath, ".claude", "skills")

  const assertSafePathPart = (part: string): string => {
    const value = part.trim()
    if (!value || value === "." || value === ".." || value.includes("/") || value.includes("\\") || value.includes("\0")) {
      throw new Error(`Invalid skillRef segment: "${part}"`)
    }
    return value
  }

  for (let i = 0; i < updatedNodes.length; i++) {
    const node = updatedNodes[i]
    if (node.type !== "skill") continue

    const config = node.config as SkillNodeConfig
    if (!config.skillRef) continue
    if (knownRefs.has(config.skillRef)) continue

    // Parse category/name from skillRef
    const parts = config.skillRef.split("/")
    let category: string
    let name: string
    if (parts.length >= 2) {
      category = parts.slice(0, -1).map(assertSafePathPart).join("/")
      name = assertSafePathPart(parts[parts.length - 1] || "")
    } else {
      category = "generated"
      name = assertSafePathPart(parts[0] || "")
    }

    const skillPath = resolve(
      projectPath,
      ".claude",
      "skills",
      category,
      `${name}.md`,
    )
    if (!isWithinRoot(skillPath, skillsRoot)) {
      throw new Error("Resolved skill path is outside project skills directory")
    }

    // Skip if file already exists
    try {
      await stat(skillPath)
      continue
    } catch {
      // File doesn't exist — create it
    }

    const description = config.prompt
      ? config.prompt.slice(0, 120).replace(/\n/g, " ")
      : name

    const frontmatter = YAML.stringify({ name, description }).trimEnd()
    const content = `---\n${frontmatter}\n---\n\n${config.prompt || `Instructions for ${name}`}\n`

    await mkdir(dirname(skillPath), { recursive: true })
    await writeFile(skillPath, content, "utf-8")

    // Set skillPaths on the node config
    updatedNodes[i] = {
      ...node,
      config: {
        ...config,
        skillPaths: [...(config.skillPaths || []), skillPath],
      },
    }
  }

  return { ...workflow, nodes: updatedNodes }
}
