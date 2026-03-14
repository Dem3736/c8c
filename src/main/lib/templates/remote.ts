import { net } from "electron"
import YAML from "yaml"
import type { WorkflowTemplate, WorkflowTemplateCategory } from "@shared/types"
import { parseTemplate } from "./index"

const HUB_BASE_URL = "https://c8c.app/hub/"
const MAX_BODY_SIZE = 512 * 1024 // 512 KB
const FETCH_TIMEOUT_MS = 10_000

const VALID_CATEGORIES: WorkflowTemplateCategory[] = [
  "content",
  "code",
  "research",
  "marketing",
  "general",
]

export async function fetchRemoteTemplate(templateId: string): Promise<WorkflowTemplate> {
  const url = `${HUB_BASE_URL}${templateId}.yaml`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let response: Response
  try {
    response = await net.fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Template not found on hub")
    }
    throw new Error(`Network error (${response.status})`)
  }

  const contentLength = response.headers.get("content-length")
  if (contentLength && Number(contentLength) > MAX_BODY_SIZE) {
    throw new Error("Template file too large")
  }

  const body = await response.text()
  if (body.length > MAX_BODY_SIZE) {
    throw new Error("Template file too large")
  }

  // Validate YAML structure before passing to parseTemplate
  let parsed: Record<string, unknown>
  try {
    parsed = YAML.parse(body) as Record<string, unknown>
  } catch {
    throw new Error("Invalid template format")
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid template format")
  }

  const { id, name, version, nodes, edges, category } = parsed
  if (!id || !name || !version || !Array.isArray(nodes) || !Array.isArray(edges)) {
    throw new Error("Invalid template format")
  }

  if (typeof category !== "string" || !VALID_CATEGORIES.includes(category as WorkflowTemplateCategory)) {
    throw new Error("Invalid template format")
  }

  return parseTemplate(body)
}
