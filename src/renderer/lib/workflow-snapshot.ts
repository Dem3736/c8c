import type { Workflow } from "@shared/types"

export function workflowSnapshot(workflow: Workflow): string {
  return JSON.stringify(workflow)
}
