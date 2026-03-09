import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { scaffoldMissingSkills } from "./skill-scaffold"
import type { Workflow, SkillNodeConfig } from "@shared/types"

function makeWorkflow(nodes: Workflow["nodes"]): Workflow {
  return {
    version: 1,
    name: "Test",
    nodes,
    edges: [],
  }
}

describe("scaffoldMissingSkills", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "scaffold-test-"))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("creates .md file for missing skill and sets skillPaths", async () => {
    const workflow = makeWorkflow([
      {
        id: "s1",
        type: "skill",
        position: { x: 0, y: 0 },
        config: {
          skillRef: "analysis/ux-reviewer",
          prompt: "Review the UX of the landing page",
        } as SkillNodeConfig,
      },
    ])

    const result = await scaffoldMissingSkills(workflow, [], tmpDir)

    const expectedPath = join(tmpDir, ".claude/skills/analysis/ux-reviewer.md")
    const content = await readFile(expectedPath, "utf-8")
    expect(content).toContain("name: ux-reviewer")
    expect(content).toContain("Review the UX of the landing page")

    const config = result.nodes[0].config as SkillNodeConfig
    expect(config.skillPaths).toContain(expectedPath)
  })

  it("skips skills that already exist on disk", async () => {
    const existingPath = join(tmpDir, ".claude/skills/analysis/ux-reviewer.md")
    await mkdir(join(tmpDir, ".claude/skills/analysis"), { recursive: true })
    await writeFile(existingPath, "---\nname: ux-reviewer\n---\nExisting content\n")

    const workflow = makeWorkflow([
      {
        id: "s1",
        type: "skill",
        position: { x: 0, y: 0 },
        config: {
          skillRef: "analysis/ux-reviewer",
          prompt: "New prompt",
        } as SkillNodeConfig,
      },
    ])

    const result = await scaffoldMissingSkills(workflow, [], tmpDir)

    // File should not be overwritten
    const content = await readFile(existingPath, "utf-8")
    expect(content).toContain("Existing content")

    // skillPaths should not be set
    const config = result.nodes[0].config as SkillNodeConfig
    expect(config.skillPaths).toBeUndefined()
  })

  it("skips skills that are in availableSkills", async () => {
    const workflow = makeWorkflow([
      {
        id: "s1",
        type: "skill",
        position: { x: 0, y: 0 },
        config: {
          skillRef: "analysis/ux-reviewer",
          prompt: "Review UX",
        } as SkillNodeConfig,
      },
    ])

    const result = await scaffoldMissingSkills(
      workflow,
      [{ name: "ux-reviewer", category: "analysis" }],
      tmpDir,
    )

    const config = result.nodes[0].config as SkillNodeConfig
    expect(config.skillPaths).toBeUndefined()
  })

  it("handles no-category refs with generated/ subfolder", async () => {
    const workflow = makeWorkflow([
      {
        id: "s1",
        type: "skill",
        position: { x: 0, y: 0 },
        config: {
          skillRef: "my-skill",
          prompt: "Do stuff",
        } as SkillNodeConfig,
      },
    ])

    const result = await scaffoldMissingSkills(workflow, [], tmpDir)

    const expectedPath = join(tmpDir, ".claude/skills/generated/my-skill.md")
    const content = await readFile(expectedPath, "utf-8")
    expect(content).toContain("name: my-skill")

    const config = result.nodes[0].config as SkillNodeConfig
    expect(config.skillPaths).toContain(expectedPath)
  })
})
