import type { Workflow, WorkflowNode, WorkflowEdge, SkillNodeConfig } from "@shared/types"

interface LegacyStep {
  key: string
  agent: string
  prompt: string
  mode?: "analyze" | "rewrite" | "both"
  model?: string
  maxTurns?: number
  skillPaths?: string[]
}

interface LegacyChain {
  description?: string
  defaults?: {
    model?: string
    maxTurns?: number
    timeout_minutes?: number
  }
  steps: LegacyStep[]
}

const NODE_SPACING = 300

export function yamlToChain(legacy: LegacyChain, name: string): Workflow {
  const nodes: WorkflowNode[] = []
  const edges: WorkflowEdge[] = []
  const uniqueStepModels = [...new Set(
    legacy.steps
      .map((step) => step.model?.trim())
      .filter((model): model is string => Boolean(model)),
  )]
  const migratedWorkflowModel = legacy.defaults?.model || (
    uniqueStepModels.length === 1 ? uniqueStepModels[0] : undefined
  )

  const inputId = "input-1"
  nodes.push({
    id: inputId,
    type: "input",
    position: { x: 0, y: 200 },
    config: {},
  })

  let prevId = inputId
  legacy.steps.forEach((step, i) => {
    const nodeId = `skill-${step.key}`
    const permissionMode = step.mode === "analyze"
      ? "plan" as const
      : step.mode === "rewrite" || step.mode === "both"
        ? "edit" as const
        : undefined
    const config: SkillNodeConfig = {
      skillRef: step.agent,
      prompt: step.prompt,
      ...(permissionMode && { permissionMode }),
      ...(step.maxTurns && { maxTurns: step.maxTurns }),
      ...(step.skillPaths && { skillPaths: step.skillPaths }),
    }

    nodes.push({
      id: nodeId,
      type: "skill",
      position: { x: (i + 1) * NODE_SPACING, y: 200 },
      config,
    })

    edges.push({
      id: `e-${prevId}-${nodeId}`,
      source: prevId,
      target: nodeId,
      type: "default",
    })

    prevId = nodeId
  })

  const outputId = "output-1"
  nodes.push({
    id: outputId,
    type: "output",
    position: { x: (legacy.steps.length + 1) * NODE_SPACING, y: 200 },
    config: {},
  })

  edges.push({
    id: `e-${prevId}-${outputId}`,
    source: prevId,
    target: outputId,
    type: "default",
  })

  return {
    version: 1,
    name,
    description: legacy.description,
    defaults: legacy.defaults
      ? {
          model: migratedWorkflowModel,
          maxTurns: legacy.defaults.maxTurns,
          maxParallel: 8,
          timeout_minutes: legacy.defaults.timeout_minutes,
        }
      : migratedWorkflowModel
        ? {
            model: migratedWorkflowModel,
            maxParallel: 8,
          }
        : undefined,
    nodes,
    edges,
  }
}
