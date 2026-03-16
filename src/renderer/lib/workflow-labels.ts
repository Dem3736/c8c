import type {
  ApprovalNodeConfig,
  EvaluatorNodeConfig,
  HumanNodeConfig,
  MergerNodeConfig,
  SkillNodeConfig,
  WorkflowNode,
} from "@shared/types"

export function getWorkflowNodeLabel(node: WorkflowNode): string {
  if (node.type === "skill") {
    return (node.config as SkillNodeConfig).skillRef || "skill"
  }
  if (node.type === "evaluator") {
    const cfg = node.config as EvaluatorNodeConfig
    return `evaluator (${cfg.threshold}/10)`
  }
  if (node.type === "splitter") return "splitter"
  if (node.type === "merger") {
    const cfg = node.config as MergerNodeConfig
    return `merger (${cfg.strategy})`
  }
  if (node.type === "approval") {
    const cfg = node.config as ApprovalNodeConfig
    return cfg.message || "approval"
  }
  if (node.type === "human") {
    const cfg = node.config as HumanNodeConfig
    return cfg.staticRequest?.title || `${cfg.mode} task`
  }
  return node.type
}
