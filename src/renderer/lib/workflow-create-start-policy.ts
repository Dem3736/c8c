import type { CreateEntryRouteResult, WorkflowTemplate } from "@shared/types"

const LIGHTWEIGHT_ENTRY_TEMPLATE_IDS = new Set<string>([
  "delivery-shape-project",
])

export function routeUsesLightweightEntry(
  routeResult: CreateEntryRouteResult | null | undefined,
  template: Pick<WorkflowTemplate, "id"> | null | undefined,
) {
  if (!routeResult || !template) return false
  if (routeResult.source !== "agent") return false
  if (routeResult.clarification) return false
  return LIGHTWEIGHT_ENTRY_TEMPLATE_IDS.has(template.id)
}

export function shouldAutoRunCreateStart(
  routeResult: CreateEntryRouteResult | null | undefined,
  template: Pick<WorkflowTemplate, "id"> | null | undefined,
) {
  return routeUsesLightweightEntry(routeResult, template)
}
