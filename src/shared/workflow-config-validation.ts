import type { Workflow, WorkflowNode, PermissionMode } from "./types"

export interface WorkflowConfigIssue {
  nodeId: string
  field: string
  message: string
  severity: "error" | "warning"
}

const PERMISSION_MODES = new Set<PermissionMode>(["plan", "edit"])
const SKILL_OUTPUT_MODES = new Set(["auto", "stdout", "content_file"])
const INPUT_TYPES = new Set(["auto", "text", "url", "directory"])
const MERGER_STRATEGIES = new Set(["concatenate", "summarize", "select_best"])
const OUTPUT_FORMATS = new Set(["markdown", "text"])
const TIMEOUT_ACTIONS = new Set(["auto_approve", "auto_reject", "skip"])

const ALLOWED_CONFIG_KEYS = {
  input: new Set(["inputType", "required", "defaultValue", "placeholder", "runtime"]),
  skill: new Set(["skillRef", "prompt", "outputMode", "maxTurns", "permissionMode", "skillPaths", "allowedTools", "disallowedTools", "runtime"]),
  evaluator: new Set(["criteria", "threshold", "maxRetries", "retryFrom", "skillRefs", "runtime"]),
  splitter: new Set(["strategy", "maxBranches", "runtime"]),
  merger: new Set(["strategy", "prompt", "runtime"]),
  approval: new Set(["message", "show_content", "allow_edit", "timeout_minutes", "timeout_action", "runtime"]),
  output: new Set(["title", "format", "runtime"]),
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasOwn(config: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(config, key)
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value > 0
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function pushIssue(
  issues: WorkflowConfigIssue[],
  nodeId: string,
  field: string,
  message: string,
  severity: WorkflowConfigIssue["severity"] = "error",
) {
  issues.push({ nodeId, field, message, severity })
}

function validateUnknownKeys(node: WorkflowNode, config: Record<string, unknown>, issues: WorkflowConfigIssue[]) {
  const allowed = ALLOWED_CONFIG_KEYS[node.type]
  for (const key of Object.keys(config)) {
    if (!allowed.has(key)) {
      pushIssue(
        issues,
        node.id,
        `config.${key}`,
        `Unsupported config field "${key}" for ${node.type} nodes.`,
      )
    }
  }
}

function validateOptionalString(
  config: Record<string, unknown>,
  nodeId: string,
  field: string,
  issues: WorkflowConfigIssue[],
) {
  if (hasOwn(config, field) && typeof config[field] !== "string") {
    pushIssue(issues, nodeId, `config.${field}`, `${field} must be a string.`)
  }
}

function validateOptionalStringArray(
  config: Record<string, unknown>,
  nodeId: string,
  field: string,
  issues: WorkflowConfigIssue[],
) {
  if (hasOwn(config, field) && !isStringArray(config[field])) {
    pushIssue(issues, nodeId, `config.${field}`, `${field} must be an array of strings.`)
    return
  }
  if (isStringArray(config[field]) && config[field].some((value) => value.trim().length === 0)) {
    pushIssue(issues, nodeId, `config.${field}`, `${field} entries must be non-empty strings.`)
  }
}

function validateOptionalRuntime(
  config: Record<string, unknown>,
  nodeId: string,
  issues: WorkflowConfigIssue[],
) {
  if (hasOwn(config, "runtime") && !isRecord(config.runtime)) {
    pushIssue(issues, nodeId, "config.runtime", "runtime must be an object.")
  }
}

export function validateWorkflowNodeConfig(node: WorkflowNode): WorkflowConfigIssue[] {
  const issues: WorkflowConfigIssue[] = []
  const config = isRecord(node.config) ? node.config : null

  if (!config) {
    pushIssue(issues, node.id, "config", "Node config must be an object.")
    return issues
  }

  validateUnknownKeys(node, config, issues)
  validateOptionalRuntime(config, node.id, issues)

  switch (node.type) {
    case "skill": {
      const skillRef = typeof config.skillRef === "string" ? config.skillRef.trim() : ""
      const prompt = typeof config.prompt === "string" ? config.prompt.trim() : ""

      if (hasOwn(config, "skillRef") && typeof config.skillRef !== "string") {
        pushIssue(issues, node.id, "config.skillRef", "skillRef must be a string.")
      }
      if (hasOwn(config, "prompt") && typeof config.prompt !== "string") {
        pushIssue(issues, node.id, "config.prompt", "prompt must be a string.")
      }
      if (!skillRef && !prompt) {
        pushIssue(issues, node.id, "config.prompt", "Add a prompt or select a skill reference.")
      }
      if (hasOwn(config, "outputMode") && !SKILL_OUTPUT_MODES.has(String(config.outputMode))) {
        pushIssue(issues, node.id, "config.outputMode", "outputMode must be auto, stdout, or content_file.")
      }
      if (hasOwn(config, "maxTurns") && !isPositiveInteger(config.maxTurns)) {
        pushIssue(issues, node.id, "config.maxTurns", "maxTurns must be a positive integer.")
      }
      if (hasOwn(config, "permissionMode") && !PERMISSION_MODES.has(config.permissionMode as PermissionMode)) {
        pushIssue(issues, node.id, "config.permissionMode", "permissionMode must be plan or edit.")
      }
      validateOptionalStringArray(config, node.id, "skillPaths", issues)
      validateOptionalStringArray(config, node.id, "allowedTools", issues)
      validateOptionalStringArray(config, node.id, "disallowedTools", issues)
      break
    }
    case "evaluator": {
      if (typeof config.criteria !== "string" || config.criteria.trim().length === 0) {
        pushIssue(issues, node.id, "config.criteria", "Evaluation criteria is required.")
      }
      if (typeof config.threshold !== "number" || !Number.isFinite(config.threshold)) {
        pushIssue(issues, node.id, "config.threshold", "threshold must be a finite number.")
      }
      if (!isNonNegativeInteger(config.maxRetries)) {
        pushIssue(issues, node.id, "config.maxRetries", "maxRetries must be a non-negative integer.")
      }
      if (hasOwn(config, "retryFrom") && typeof config.retryFrom !== "string") {
        pushIssue(issues, node.id, "config.retryFrom", "retryFrom must be a string.")
      }
      validateOptionalStringArray(config, node.id, "skillRefs", issues)
      if (isStringArray(config.skillRefs) && config.skillRefs.length === 0) {
        pushIssue(issues, node.id, "config.skillRefs", "skillRefs cannot be an empty array.")
      }
      break
    }
    case "splitter": {
      if (typeof config.strategy !== "string" || config.strategy.trim().length === 0) {
        pushIssue(issues, node.id, "config.strategy", "Splitter strategy is required.")
      }
      if (hasOwn(config, "maxBranches") && !isPositiveInteger(config.maxBranches)) {
        pushIssue(issues, node.id, "config.maxBranches", "maxBranches must be a positive integer.")
      }
      break
    }
    case "merger": {
      if (!MERGER_STRATEGIES.has(String(config.strategy))) {
        pushIssue(issues, node.id, "config.strategy", "strategy must be concatenate, summarize, or select_best.")
      }
      validateOptionalString(config, node.id, "prompt", issues)
      break
    }
    case "approval": {
      validateOptionalString(config, node.id, "message", issues)
      if (typeof config.show_content !== "boolean") {
        pushIssue(issues, node.id, "config.show_content", "show_content must be a boolean.")
      }
      if (typeof config.allow_edit !== "boolean") {
        pushIssue(issues, node.id, "config.allow_edit", "allow_edit must be a boolean.")
      }
      if (hasOwn(config, "timeout_minutes") && !isPositiveInteger(config.timeout_minutes)) {
        pushIssue(issues, node.id, "config.timeout_minutes", "timeout_minutes must be a positive integer.")
      }
      if (hasOwn(config, "timeout_action") && !TIMEOUT_ACTIONS.has(String(config.timeout_action))) {
        pushIssue(issues, node.id, "config.timeout_action", "timeout_action must be auto_approve, auto_reject, or skip.")
      }
      break
    }
    case "input": {
      if (hasOwn(config, "inputType") && !INPUT_TYPES.has(String(config.inputType))) {
        pushIssue(issues, node.id, "config.inputType", "inputType must be auto, text, url, or directory.")
      }
      if (hasOwn(config, "required") && typeof config.required !== "boolean") {
        pushIssue(issues, node.id, "config.required", "required must be a boolean.")
      }
      validateOptionalString(config, node.id, "defaultValue", issues)
      validateOptionalString(config, node.id, "placeholder", issues)
      break
    }
    case "output": {
      validateOptionalString(config, node.id, "title", issues)
      if (hasOwn(config, "format") && !OUTPUT_FORMATS.has(String(config.format))) {
        pushIssue(issues, node.id, "config.format", "format must be markdown or text.")
      }
      break
    }
  }

  return issues
}

export function validateWorkflowNodeConfigs(workflow: Workflow): WorkflowConfigIssue[] {
  return workflow.nodes.flatMap((node) => validateWorkflowNodeConfig(node))
}
