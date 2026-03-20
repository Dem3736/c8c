import type { HumanTaskField, HumanTaskSnapshot, HumanTaskSummary } from "@shared/types"

export interface TaskStageMeta {
  title: string
  group: string
}

export function normalizeHumanFieldValue(field: HumanTaskField, value: unknown): string | number | boolean | string[] {
  if (field.type === "boolean") return Boolean(value)
  if (field.type === "number") return typeof value === "number" ? value : Number(value || 0)
  if (field.type === "multiselect") return Array.isArray(value) ? value.map(String) : []
  return typeof value === "string" ? value : value == null ? "" : JSON.stringify(value, null, 2)
}

export function taskSelectionKey(task: Pick<HumanTaskSummary, "workspace" | "taskId">) {
  return `${task.workspace}::${task.taskId}`
}

export function compactTaskText(value?: string | null, maxLength = 140): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim()
  if (!normalized) return null
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1)}…`
}

export function primaryTaskFieldLabel(task: Pick<HumanTaskSnapshot, "request"> | null): string | null {
  const firstField = task?.request.fields[0]
  if (!firstField?.label) return null
  return firstField.label.trim() || null
}

export function taskKindLabel(task: Pick<HumanTaskSummary, "kind"> | Pick<HumanTaskSnapshot, "kind">): string {
  return task.kind === "approval" ? "Review" : "Input"
}

export function taskActionCopy(task: HumanTaskSnapshot): string {
  if (task.kind === "approval") {
    return task.allowEdit
      ? "Review the proposed content, adjust it if needed, then continue the run."
      : "Review the checkpoint and decide whether the run should continue."
  }
  return "Provide the missing input this flow needs before it can continue."
}

export function taskCardPreview(task: HumanTaskSummary | HumanTaskSnapshot): string | null {
  const summary = compactTaskText(task.summary, 120)
  if (summary) return summary
  return compactTaskText(task.instructions, 120)
}

export function taskStageKey(task: Pick<HumanTaskSummary, "workflowPath" | "nodeId"> | Pick<HumanTaskSnapshot, "workflowPath" | "nodeId">): string | null {
  if (!task.workflowPath) return null
  return `${task.workflowPath}::${task.nodeId}`
}
