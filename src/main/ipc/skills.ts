import { ipcMain } from "electron"
import { scanAllSkills } from "../lib/skill-scanner"
import { scanAllLibraries } from "../lib/libraries"
import { scaffoldMissingSkills } from "../lib/skill-scaffold"
import type { DiscoveredSkill, Workflow } from "@shared/types"
import { mkdir, writeFile, access } from "node:fs/promises"
import { join, resolve } from "node:path"
import { allowedProjectRoots } from "../lib/security-paths"

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function assertProjectPath(projectPath: string): Promise<string> {
  const resolvedPath = resolve(projectPath)
  const projectRoots = await allowedProjectRoots()
  if (!projectRoots.some((root) => root === resolvedPath)) {
    throw new Error("Project path is not registered")
  }
  return resolvedPath
}

export function registerSkillsHandlers() {
  ipcMain.handle(
    "skills:scan",
    async (_e, projectPath: string): Promise<DiscoveredSkill[]> => {
      const safeProjectPath = await assertProjectPath(projectPath)
      const [projectSkills, librarySkills] = await Promise.all([
        scanAllSkills(safeProjectPath),
        scanAllLibraries(),
      ])

      // Merge: project skills take priority, then library skills
      const seen = new Set<string>()
      const merged: DiscoveredSkill[] = []

      for (const skill of projectSkills) {
        const key = `${skill.type}:${skill.name}`
        seen.add(key)
        merged.push(skill)
      }
      for (const skill of librarySkills) {
        const key = `${skill.type}:${skill.name}`
        if (!seen.has(key)) {
          seen.add(key)
          merged.push(skill)
        }
      }

      return merged
    },
  )

  ipcMain.handle(
    "skills:scaffold",
    async (
      _e,
      workflow: Workflow,
      availableSkills: Pick<DiscoveredSkill, "name" | "category">[],
      projectPath: string,
    ): Promise<Workflow> => {
      const safeProjectPath = await assertProjectPath(projectPath)
      return scaffoldMissingSkills(workflow, availableSkills, safeProjectPath)
    },
  )

  ipcMain.handle("skills:create-template", async (_e, projectPath: string) => {
    const safeProjectPath = await assertProjectPath(projectPath)
    const skillsDir = join(safeProjectPath, ".claude", "skills")
    await mkdir(skillsDir, { recursive: true })

    const stem = "new-skill"
    let index = 1
    let filePath = join(skillsDir, `${stem}.md`)
    while (await exists(filePath)) {
      index += 1
      filePath = join(skillsDir, `${stem}-${index}.md`)
    }

    const title = `New Skill ${index === 1 ? "" : index}`.trim()
    const template = `# ${title}

## Purpose
Describe what this skill should do.

## Inputs
- Input type:
- Expected format:

## Output
- What to return:
- Quality bar:

## Instructions
1. Analyze the input.
2. Produce the output.
3. Keep it concise and actionable.
`

    await writeFile(filePath, template, "utf-8")
    return filePath
  })
}
