import { readFile, writeFile, readdir, mkdir, stat } from "node:fs/promises"
import { join, basename } from "node:path"
import type { Workflow, WorkflowFile } from "@shared/types"

export async function loadChain(filePath: string): Promise<Workflow> {
  const content = await readFile(filePath, "utf-8")
  return JSON.parse(content) as Workflow
}

export async function saveChain(filePath: string, workflow: Workflow): Promise<void> {
  const content = JSON.stringify(workflow, null, 2)
  await writeFile(filePath, content, "utf-8")
}

export async function listChainFiles(
  dir: string,
): Promise<WorkflowFile[]> {
  try {
    await mkdir(dir, { recursive: true })
    const entries = await readdir(dir, { withFileTypes: true })
    const workflows = await Promise.all(
      entries
        .filter((e) => e.isFile() && e.name.endsWith(".chain"))
        .map(async (entry) => {
          const fullPath = join(dir, entry.name)
          const info = await stat(fullPath)
          return {
            name: basename(entry.name, ".chain"),
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
