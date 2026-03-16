import type {
  InputNodeConfig,
  OutputNodeConfig,
  Workflow,
  WorkflowTemplate,
} from "@shared/types"

export type WorkflowEntrySource =
  | "generated"
  | "agent_create"
  | "template"
  | "template_customize"

export interface WorkflowEntryState {
  workflowPath: string | null
  workflowName: string
  source: WorkflowEntrySource
  title: string
  summary: string
  contractLabel: string
  contractText: string
  inputText: string
  outputText: string
  readinessText: string
}

const DEFAULT_INPUT_PLACEHOLDER = "Enter your input text, paste a URL, or describe what to process..."

function collapseWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

function ensureSentence(value: string, fallback: string) {
  const normalized = collapseWhitespace(value)
  if (!normalized) return fallback
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`
}

function lowerFirst(value: string) {
  if (!value) return value
  return value.charAt(0).toLowerCase() + value.slice(1)
}

function deriveEntryTitle(name: string | undefined) {
  const normalized = collapseWhitespace(name || "")
  if (!normalized || normalized === "new-workflow") {
    return "Runnable flow"
  }
  return normalized
}

export function deriveTemplateUseWhen(template: WorkflowTemplate) {
  const base = collapseWhitespace(template.description || template.headline || template.how)
  if (!base) {
    return "You want a ready-to-run flow that you can adapt to this job."
  }
  if (/^(you|when|if)\b/i.test(base)) {
    return ensureSentence(base, "You want a ready-to-run flow that you can adapt to this job.")
  }
  return ensureSentence(
    `You need to ${lowerFirst(base)}`,
    "You want a ready-to-run flow that you can adapt to this job.",
  )
}

export function deriveTemplateCardCopy(template: WorkflowTemplate) {
  return deriveTemplateUseWhen(template)
}

function deriveWorkflowInputText(workflow: Workflow) {
  const inputNode = workflow.nodes.find((node) => node.type === "input")
  const inputConfig = (inputNode?.config || {}) as InputNodeConfig
  const placeholder = collapseWhitespace(inputConfig.placeholder || "")
  if (placeholder && placeholder !== DEFAULT_INPUT_PLACEHOLDER) {
    return ensureSentence(placeholder.replace(/\.\.\.$/, ""), "Add the source input this flow should work from.")
  }

  switch (inputConfig.inputType) {
    case "url":
      return "A URL or site to analyze."
    case "directory":
      return "A project folder or codebase path."
    case "text":
      return "Text, notes, or other source material."
    default:
      return "Text, URLs, files, or project context for the flow to work from."
  }
}

function deriveWorkflowOutputText(workflow: Workflow, fallback: string) {
  const outputNode = workflow.nodes.find((node) => node.type === "output")
  const outputConfig = (outputNode?.config || {}) as OutputNodeConfig
  const explicitTitle = collapseWhitespace(outputConfig.title || "")
  if (explicitTitle) {
    return ensureSentence(explicitTitle, fallback)
  }

  if (workflow.description.trim()) {
    return ensureSentence(workflow.description, fallback)
  }

  return fallback
}

function describeWorkflowReadiness(workflow: Workflow) {
  const workingStages = workflow.nodes.filter((node) => node.type !== "input" && node.type !== "output")
  const branchCount = workingStages.filter((node) => node.type === "splitter").length
  const qualityGateCount = workingStages.filter((node) => node.type === "evaluator").length
  const approvalCount = workingStages.filter((node) => node.type === "approval").length
  const parts = [`${workingStages.length} working ${workingStages.length === 1 ? "stage" : "stages"}`]

  if (branchCount > 0) {
    parts.push(`${branchCount} branch ${branchCount === 1 ? "point" : "points"}`)
  }
  if (qualityGateCount > 0) {
    parts.push(`${qualityGateCount} quality ${qualityGateCount === 1 ? "gate" : "gates"}`)
  }
  if (approvalCount > 0) {
    parts.push(`${approvalCount} human ${approvalCount === 1 ? "review" : "reviews"}`)
  }

  return ensureSentence(`Ready to run with ${parts.join(", ")}`, "Ready to run.")
}

export function buildGeneratedWorkflowEntryState({
  workflow,
  workflowPath,
  request,
  source,
}: {
  workflow: Workflow
  workflowPath: string | null
  request: string
  source: Extract<WorkflowEntrySource, "generated" | "agent_create">
}): WorkflowEntryState {
  const cleanRequest = ensureSentence(
    request,
    "Turn this request into a runnable flow.",
  )

  return {
    workflowPath,
    workflowName: workflow.name,
    source,
    title: deriveEntryTitle(workflow.name),
    summary: source === "generated"
      ? "The agent turned your request into a runnable flow. Add the input below, then run it or refine it."
      : "The agent prepared a first draft from your request. Review the input below, then run it or keep refining it.",
    contractLabel: "What you asked for",
    contractText: cleanRequest,
    inputText: deriveWorkflowInputText(workflow),
    outputText: deriveWorkflowOutputText(
      workflow,
      "A final result ready to review, copy, or iterate on.",
    ),
    readinessText: describeWorkflowReadiness(workflow),
  }
}

export function buildTemplateWorkflowEntryState({
  template,
  workflowPath,
  source = "template",
}: {
  template: WorkflowTemplate
  workflowPath: string | null
  source?: Extract<WorkflowEntrySource, "template" | "template_customize">
}): WorkflowEntryState {
  return {
    workflowPath,
    workflowName: template.workflow.name || template.name,
    source,
    title: template.name,
    summary: source === "template_customize"
      ? "This proven starting point is open for agent refinement. You can run it as soon as the flow looks right."
      : "This starting point is ready to run as-is. Add the input below, then run it or refine it.",
    contractLabel: "Use this when",
    contractText: deriveTemplateUseWhen(template),
    inputText: ensureSentence(template.input, "Add the source material this flow should work from."),
    outputText: ensureSentence(template.output, "A final result ready to review."),
    readinessText: describeWorkflowReadiness(template.workflow),
  }
}
