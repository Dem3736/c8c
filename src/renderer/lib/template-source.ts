import type { WorkflowTemplate } from "@shared/types"

export function getTemplateSourceKind(template: WorkflowTemplate): "builtin" | "plugin" | "user" {
  if (template.source === "plugin" || template.pluginId || template.pluginName) return "plugin"
  if (template.source === "user") return "user"
  return "builtin"
}

export function getTemplateSourceLabel(template: WorkflowTemplate): string {
  const kind = getTemplateSourceKind(template)
  if (kind === "plugin") return template.pluginName || "plugin"
  if (kind === "user") return "user"
  return "built-in"
}
