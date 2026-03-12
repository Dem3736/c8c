import { ipcMain } from "electron"
import { scanAllSkills } from "../lib/skill-scanner"
import { scanAllLibraries } from "../lib/libraries"
import { scaffoldMissingSkills } from "../lib/skill-scaffold"
import { trackTelemetryEvent } from "../lib/telemetry/service"
import { summarizeMissingWorkflowSkillRefs } from "../lib/telemetry/workflow-usage"
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
      const startedAt = Date.now()
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

      void trackTelemetryEvent("skill_scan_completed", {
        source: "manual",
        project_skills_total: projectSkills.length,
        library_skills_total: librarySkills.length,
        merged_skills_total: merged.length,
        duration_ms: Date.now() - startedAt,
      })

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
      const startedAt = Date.now()
      const before = summarizeMissingWorkflowSkillRefs(workflow, availableSkills)

      try {
        const scaffoldedWorkflow = await scaffoldMissingSkills(workflow, availableSkills, safeProjectPath)
        const after = summarizeMissingWorkflowSkillRefs(scaffoldedWorkflow, availableSkills)
        void trackTelemetryEvent("skill_scaffold_completed", {
          source: "manual",
          status: "success",
          duration_ms: Date.now() - startedAt,
          skill_nodes_total: before.skillNodesTotal,
          available_skills_total: before.availableSkillsTotal,
          missing_refs_total: before.missingRefsTotal,
          missing_refs_unique: before.missingRefsUnique,
          missing_refs: before.missingRefsList,
          remaining_missing_refs_total: after.missingRefsTotal,
        })
        return scaffoldedWorkflow
      } catch (error) {
        void trackTelemetryEvent("skill_scaffold_completed", {
          source: "manual",
          status: "failed",
          duration_ms: Date.now() - startedAt,
          skill_nodes_total: before.skillNodesTotal,
          available_skills_total: before.availableSkillsTotal,
          missing_refs_total: before.missingRefsTotal,
          missing_refs_unique: before.missingRefsUnique,
          missing_refs: before.missingRefsList,
          error_kind: "scaffold_failed",
        })
        throw error
      }
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
    void trackTelemetryEvent("skill_template_created", {
      source: "manual",
      status: "success",
      template_index: index,
    })
    return filePath
  })
}
