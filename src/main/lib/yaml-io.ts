import { readFile, writeFile, readdir, mkdir, stat } from "node:fs/promises"
import { join, basename } from "node:path"
import { homedir } from "node:os"
import YAML from "yaml"
import type { ChainDefinition } from "./chain-runner"
import { listChainFiles } from "./chain-io"
import type { WorkflowFile } from "@shared/types"

const CHAINS_DIR = join(homedir(), ".c8c", "chains")

export async function ensureChainsDir(): Promise<string> {
  await mkdir(CHAINS_DIR, { recursive: true })
  return CHAINS_DIR
}

export async function loadChainYaml(filePath: string): Promise<ChainDefinition> {
  const content = await readFile(filePath, "utf-8")
  return YAML.parse(content) as ChainDefinition
}

export async function saveChainYaml(
  filePath: string,
  chain: ChainDefinition,
): Promise<void> {
  const content = YAML.stringify(chain, { lineWidth: 120 })
  await writeFile(filePath, content, "utf-8")
}

export async function listChains(dir?: string): Promise<WorkflowFile[]> {
  const targetDir = dir || CHAINS_DIR
  try {
    await mkdir(targetDir, { recursive: true })
    const entries = await readdir(targetDir, { withFileTypes: true })
    const workflows = await Promise.all(
      entries
        .filter((e) => e.isFile() && (e.name.endsWith(".yaml") || e.name.endsWith(".yml")))
        .map(async (entry) => {
          const fullPath = join(targetDir, entry.name)
          const info = await stat(fullPath)
          return {
            name: basename(entry.name, entry.name.endsWith(".yaml") ? ".yaml" : ".yml"),
            path: fullPath,
            updatedAt: info.mtimeMs,
          }
        }),
    )
    return workflows
  } catch {
    return []
  }
}

export async function listProjectWorkflows(
  projectPath: string,
): Promise<WorkflowFile[]> {
  // Look for workflows in project's .c8c/ dir and .claude/workflows/
  const dirs = [
    join(projectPath, ".c8c"),
    join(projectPath, ".claude", "workflows"),
  ]

  const results: WorkflowFile[] = []
  for (const dir of dirs) {
    const chainFiles = await listChainFiles(dir)
    const yamlFiles = await listChains(dir)
    results.push(...chainFiles, ...yamlFiles)
  }

  return results.sort((a, b) => {
    const aTime = a.updatedAt ?? 0
    const bTime = b.updatedAt ?? 0
    if (aTime !== bTime) return bTime - aTime
    return a.name.localeCompare(b.name)
  })
}
