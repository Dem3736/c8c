import YAML from "yaml"
import type { Workflow, WorkflowTemplate, WorkflowTemplateStage } from "@shared/types"

interface FlatTemplate {
  id: string
  stage: WorkflowTemplateStage
  emoji: string
  headline: string
  how: string
  input: string
  output: string
  steps: string[]
  version: number
  name: string
  description?: string
  defaults?: Workflow["defaults"]
  nodes: Workflow["nodes"]
  edges: Workflow["edges"]
}

type TemplateOverrides = Partial<
  Pick<
    WorkflowTemplate,
    | "id"
    | "source"
    | "pluginId"
    | "pluginName"
    | "marketplaceId"
    | "marketplaceName"
    | "pluginVersion"
    | "templatePath"
  >
>

export function parseTemplate(raw: string, overrides: TemplateOverrides = {}): WorkflowTemplate {
  const { id, stage, emoji, headline, how, input, output, steps, ...workflow } = YAML.parse(raw) as FlatTemplate
  return {
    id: overrides.id || id,
    name: workflow.name,
    description: workflow.description ?? "",
    stage,
    emoji,
    headline,
    how,
    input,
    output,
    steps,
    workflow,
    ...overrides,
  }
}
