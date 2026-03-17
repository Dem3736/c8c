import { net } from "electron"
import YAML from "yaml"
import type { WorkflowTemplate, WorkflowTemplateStage } from "@shared/types"
import { parseTemplate } from "./parse"

const HUB_BASE_URL = "https://c8c.app/hub/"
const MAX_BODY_SIZE = 512 * 1024 // 512 KB
const FETCH_TIMEOUT_MS = 10_000

const VALID_STAGES: WorkflowTemplateStage[] = [
  "research",
  "strategy",
  "content",
  "code",
  "outreach",
  "operations",
]

async function fetchTemplateFromUrl(url: string, notFoundMessage: string): Promise<WorkflowTemplate> {
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
      throw new Error(notFoundMessage)
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

  const { id, name, version, nodes, edges, stage, emoji, headline, steps } = parsed
  if (!id || !name || !version || !Array.isArray(nodes) || !Array.isArray(edges)) {
    throw new Error("Invalid template format")
  }

  if (typeof stage !== "string" || !VALID_STAGES.includes(stage as WorkflowTemplateStage)) {
    throw new Error("Invalid template format")
  }

  if (!emoji || !headline || !Array.isArray(steps) || steps.length === 0) {
    throw new Error("Invalid template format")
  }

  return parseTemplate(body)
}

export async function fetchRemoteTemplate(templateId: string): Promise<WorkflowTemplate> {
  return fetchTemplateFromUrl(`${HUB_BASE_URL}${templateId}.yaml`, "Template not found on hub")
}

export async function fetchRemoteTemplateByUrl(url: string): Promise<WorkflowTemplate> {
  return fetchTemplateFromUrl(url, "Template not found")
}
