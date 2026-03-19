import type {
  ArtifactContract,
  ArtifactRecord,
  InputAttachment,
  InputNodeConfig,
  OutputNodeConfig,
  ProjectFactoryDefinition,
  Workflow,
  WorkflowExecutionPolicyProfile,
  WorkflowTemplatePackMetadata,
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
  routing?: {
    source: "agent" | "heuristic"
    reason?: string
    confidence?: number
  }
}

export interface WorkflowTemplateRunContext {
  templateId: string
  templateName: string
  workflowPath: string | null
  workflowName: string
  source: Extract<WorkflowEntrySource, "template" | "template_customize">
  useWhen?: string
  inputText?: string
  outputText?: string
  factoryId?: string
  factoryLabel?: string
  caseId?: string
  caseLabel?: string
  sourceArtifactIds?: string[]
  pack?: WorkflowTemplatePackMetadata
  contractIn?: ArtifactContract[]
  contractOut?: ArtifactContract[]
  executionPolicy?: WorkflowExecutionPolicyProfile
}

export interface WorkflowTemplateCaseOverride {
  caseId: string
  caseLabel?: string
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

function titleCaseFromIdentifier(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function stripPackPrefix(name: string, packLabel?: string | null) {
  const trimmedName = collapseWhitespace(name)
  const trimmedPackLabel = collapseWhitespace(packLabel || "")
  if (trimmedPackLabel && trimmedName.startsWith(`${trimmedPackLabel}: `)) {
    return trimmedName.slice(trimmedPackLabel.length + 2).trim()
  }
  return trimmedName
}

function createFactoryCaseId(seed: string) {
  return `case:${seed}:${Date.now().toString(36)}`
}

export function deriveArtifactCaseKey(artifact: Pick<ArtifactRecord, "caseId" | "workflowPath" | "runId">) {
  if (typeof artifact.caseId === "string" && artifact.caseId.trim().length > 0) {
    return artifact.caseId
  }
  return `legacy:${artifact.workflowPath || artifact.runId}`
}

function factorySeed(factoryId: string) {
  return factoryId
    .replace(/^(factory|pack):/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    || "factory"
}

function deriveFactoryIdentity(
  template: WorkflowTemplate,
  sourceArtifacts?: ArtifactRecord[],
  factory?: Pick<ProjectFactoryDefinition, "id" | "label"> | null,
) {
  const sourcedFactory = sourceArtifacts?.find((artifact) => typeof artifact.factoryId === "string" && artifact.factoryId.trim().length > 0)
  if (sourcedFactory?.factoryId) {
    return {
      factoryId: sourcedFactory.factoryId,
      factoryLabel: sourcedFactory.factoryLabel || factory?.label || template.pack?.label || template.name,
    }
  }

  if (factory?.id) {
    return {
      factoryId: factory.id,
      factoryLabel: factory.label || template.pack?.label || template.name,
    }
  }

  return {
    factoryId: undefined,
    factoryLabel: undefined,
  }
}

function deriveCaseIdentity(
  template: WorkflowTemplate,
  sourceArtifacts?: ArtifactRecord[],
  factory?: Pick<ProjectFactoryDefinition, "id" | "label"> | null,
  caseOverride?: WorkflowTemplateCaseOverride | null,
) {
  if (caseOverride?.caseId) {
    return {
      caseId: caseOverride.caseId,
      caseLabel: caseOverride.caseLabel || template.name,
    }
  }

  const firstArtifactWithCase = sourceArtifacts?.find((artifact) => typeof artifact.caseId === "string" && artifact.caseId.trim().length > 0)
  if (firstArtifactWithCase?.caseId) {
    return {
      caseId: firstArtifactWithCase.caseId,
      caseLabel: firstArtifactWithCase.caseLabel || template.name,
    }
  }

  const { factoryId } = deriveFactoryIdentity(template, sourceArtifacts, factory)
  if (factoryId) {
    return {
      caseId: createFactoryCaseId(factorySeed(factoryId)),
      caseLabel: template.name,
    }
  }

  return {
    caseId: undefined,
    caseLabel: undefined,
  }
}

const JOURNEY_STAGE_LABELS: Record<string, string> = {
  map: "Map",
  intake: "Intake",
  shape: "Shape",
  research: "Research",
  plan: "Plan",
  execute: "Execute",
  verify: "Verify",
  operate: "Operate",
}

const TEMPLATE_STAGE_LABELS: Record<string, string> = {
  "delivery-map-codebase": "Shape / Map",
  "delivery-shape-project": "Shape / Map",
  "gstack-feature-squad": "Shape / Map",
  "delivery-plan-phase": "Plan",
  "delivery-implement-phase": "Implement",
  "delivery-verify-phase": "Verify",
  "gstack-preflight-gate": "Verify",
  "gstack-release-room": "Ship",
}

const TEMPLATE_JOB_LABELS: Record<string, string> = {
  "delivery-map-codebase": "Change the current app",
  "delivery-shape-project": "Build from brief",
  "delivery-plan-phase": "Prepare the implementation plan",
  "delivery-implement-phase": "Apply approved changes",
  "delivery-verify-phase": "Verify completion",
  "gstack-preflight-gate": "Verify completion",
  "gstack-release-room": "Ship approved work",
  "ux-ui-polish-audit": "Audit and polish this UI",
  "impeccable-ui-pipeline": "Improve this UI flow",
  "playwright-visual-audit": "Audit this UI in browser",
}

const EXECUTION_POLICY_TAG_LABELS: Record<string, string> = {
  evidence_first: "Evidence-first",
  spec_first: "Spec-first",
  small_tasks: "Small tasks",
  fresh_workers: "Fresh workers",
  test_first: "Test-first",
  review_gates: "Review gates",
  isolated_workspace: "Isolated workspace",
  human_gate_required: "Human gate required",
  voice_locked: "Voice-locked",
  no_slop: "No-slop review",
  publish_gate: "Publish gate",
  critique_loops: "Critique loops",
  variant_exploration: "Variant exploration",
  consistency_checks: "Consistency checks",
}

function deriveEntryTitle(name: string | undefined) {
  const normalized = collapseWhitespace(name || "")
  if (!normalized || normalized === "new-workflow") {
    return "Runnable flow"
  }
  return normalized
}

export function deriveTemplateUseWhen(template: WorkflowTemplate) {
  const explicitUseWhen = collapseWhitespace(template.useWhen || "")
  if (explicitUseWhen) {
    return ensureSentence(explicitUseWhen, "You want a ready-to-run flow that you can adapt to this job.")
  }

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

export function deriveTemplateJourneyStageLabel(template: WorkflowTemplate) {
  const explicitTemplateLabel = TEMPLATE_STAGE_LABELS[template.id]
  if (explicitTemplateLabel) return explicitTemplateLabel
  const stage = template.pack?.journeyStage
  if (!stage) return null
  return JOURNEY_STAGE_LABELS[stage] ?? titleCaseFromIdentifier(stage)
}

export function deriveTemplateContextJourneyStageLabel(
  context?: Pick<WorkflowTemplateRunContext, "templateId" | "pack"> | null,
) {
  if (!context) return null
  const explicitTemplateLabel = TEMPLATE_STAGE_LABELS[context.templateId]
  if (explicitTemplateLabel) return explicitTemplateLabel
  const stage = context.pack?.journeyStage
  if (!stage) return null
  return JOURNEY_STAGE_LABELS[stage] ?? titleCaseFromIdentifier(stage)
}

export function deriveTemplateDisplayLabel(
  template?: Pick<WorkflowTemplate, "id" | "name" | "pack"> | null,
) {
  if (!template) return null
  return TEMPLATE_STAGE_LABELS[template.id]
    || stripPackPrefix(template.name, template.pack?.label)
    || deriveTemplateJourneyStageLabel(template as WorkflowTemplate)
}

export function deriveTemplateJobLabel(
  template?: Pick<WorkflowTemplate, "id" | "name" | "pack"> | null,
) {
  if (!template) return null
  return TEMPLATE_JOB_LABELS[template.id]
    || stripPackPrefix(template.name, template.pack?.label)
    || null
}

export function deriveTemplateContextDisplayLabel(
  context?: Pick<WorkflowTemplateRunContext, "templateId" | "templateName" | "pack"> | null,
) {
  if (!context) return null
  return TEMPLATE_STAGE_LABELS[context.templateId]
    || stripPackPrefix(context.templateName, context.pack?.label)
    || deriveTemplateContextJourneyStageLabel(context)
}

export function deriveTemplateContextJobLabel(
  context?: Pick<WorkflowTemplateRunContext, "templateId" | "templateName" | "pack"> | null,
) {
  if (!context) return null
  return TEMPLATE_JOB_LABELS[context.templateId]
    || stripPackPrefix(context.templateName, context.pack?.label)
    || null
}

export function deriveTemplateExecutionDisciplineLabels(template: WorkflowTemplate) {
  const tags = template.executionPolicy?.tags || []
  if (tags.length > 0) {
    return tags.map((tag) => EXECUTION_POLICY_TAG_LABELS[tag] ?? titleCaseFromIdentifier(tag))
  }

  const summary = collapseWhitespace(template.executionPolicy?.summary || "")
  return summary ? [summary] : []
}

export function formatArtifactContractLabel(contract: ArtifactContract | string) {
  if (typeof contract === "string") {
    return titleCaseFromIdentifier(contract)
  }

  const explicitTitle = collapseWhitespace(contract.title || "")
  if (explicitTitle) return explicitTitle
  return titleCaseFromIdentifier(contract.kind)
}

export function deriveTemplatePackStagePath(templates: WorkflowTemplate[], packId: string) {
  const labels: string[] = []
  const seen = new Set<string>()

  for (const template of templates) {
    if (template.pack?.id !== packId) continue
    const label = deriveTemplateJourneyStageLabel(template)
    if (!label || seen.has(label)) continue
    seen.add(label)
    labels.push(label)
  }

  return labels
}

function buildTemplateEntrySummary(template: WorkflowTemplate, source: Extract<WorkflowEntrySource, "template" | "template_customize">) {
  const packLabel = collapseWhitespace(template.pack?.label || "")
  const stageLabel = deriveTemplateJourneyStageLabel(template)
  const disciplineSummary = collapseWhitespace(template.executionPolicy?.summary || "")
  const summaryParts: string[] = []

  if (packLabel && stageLabel) {
    summaryParts.push(`This ${packLabel} starting point opens the ${lowerFirst(stageLabel)} stage.`)
  } else if (source === "template_customize") {
    summaryParts.push("This proven starting point is open for agent refinement.")
  } else {
    summaryParts.push("This starting point is ready to run as-is.")
  }

  if (disciplineSummary) {
    summaryParts.push(ensureSentence(`It follows ${lowerFirst(disciplineSummary)}`, ""))
  }

  summaryParts.push(
    source === "template_customize"
      ? "You can run it as soon as the flow looks right."
      : "Add the input below, then run it or refine it.",
  )

  return summaryParts.join(" ").trim()
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

  if (workflow.description?.trim()) {
    return ensureSentence(workflow.description!, fallback)
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
    title: deriveTemplateJobLabel(template) || template.name,
    summary: buildTemplateEntrySummary(template, source),
    contractLabel: "Use this when",
    contractText: deriveTemplateUseWhen(template),
    inputText: ensureSentence(template.input, "Add the source material this flow should work from."),
    outputText: ensureSentence(template.output, "A final result ready to review."),
    readinessText: describeWorkflowReadiness(template.workflow),
  }
}

export function buildTemplateRunContext({
  template,
  workflowPath,
  source = "template",
  sourceArtifacts = [],
  factory = null,
  caseOverride = null,
}: {
  template: WorkflowTemplate
  workflowPath: string | null
  source?: Extract<WorkflowEntrySource, "template" | "template_customize">
  sourceArtifacts?: ArtifactRecord[]
  factory?: Pick<ProjectFactoryDefinition, "id" | "label"> | null
  caseOverride?: WorkflowTemplateCaseOverride | null
}): WorkflowTemplateRunContext {
  const { factoryId, factoryLabel } = deriveFactoryIdentity(template, sourceArtifacts, factory)
  const { caseId, caseLabel } = deriveCaseIdentity(template, sourceArtifacts, factory, caseOverride)
  return {
    templateId: template.id,
    templateName: template.name,
    workflowPath,
    workflowName: template.workflow.name || template.name,
    source,
    useWhen: deriveTemplateUseWhen(template),
    inputText: ensureSentence(template.input, "Add the source material this flow should work from."),
    outputText: ensureSentence(template.output, "A final result ready to review."),
    factoryId,
    factoryLabel,
    caseId,
    caseLabel,
    sourceArtifactIds: sourceArtifacts.map((artifact) => artifact.id),
    pack: template.pack,
    contractIn: template.contractIn,
    contractOut: template.contractOut,
    executionPolicy: template.executionPolicy,
  }
}

export function areTemplateContractsSatisfied(
  contracts: ArtifactContract[] | undefined,
  artifacts: ArtifactRecord[],
) {
  if (!contracts?.length) return true
  const availableKinds = new Set(artifacts.map((artifact) => artifact.kind))
  return contracts
    .filter((contract) => contract.required !== false)
    .every((contract) => availableKinds.has(contract.kind))
}

export function selectArtifactsForTemplateContracts(
  contracts: ArtifactContract[] | undefined,
  artifacts: ArtifactRecord[],
) {
  if (!contracts?.length) return artifacts
  const firstArtifactByKind = new Map<string, ArtifactRecord>()

  for (const artifact of artifacts) {
    if (!firstArtifactByKind.has(artifact.kind)) {
      firstArtifactByKind.set(artifact.kind, artifact)
    }
  }

  const selected: ArtifactRecord[] = []
  const seenKinds = new Set<string>()
  for (const contract of contracts) {
    if (seenKinds.has(contract.kind)) continue
    seenKinds.add(contract.kind)
    const artifact = firstArtifactByKind.get(contract.kind)
    if (artifact) {
      selected.push(artifact)
    }
  }

  return selected
}

export function buildContinuationArtifactPool({
  currentArtifacts,
  projectArtifacts,
  context,
}: {
  currentArtifacts: ArtifactRecord[]
  projectArtifacts: ArtifactRecord[]
  context?: Pick<WorkflowTemplateRunContext, "caseId" | "sourceArtifactIds"> | null
}) {
  const pool: ArtifactRecord[] = []
  const seenIds = new Set<string>()
  const orderedCurrentArtifacts = [...currentArtifacts].sort((left, right) => right.updatedAt - left.updatedAt)
  const orderedProjectArtifacts = [...projectArtifacts].sort((left, right) => right.updatedAt - left.updatedAt)
  const sourceArtifactIds = new Set((context?.sourceArtifactIds || []).filter(Boolean))
  const caseId = context?.caseId?.trim()

  const pushUnique = (artifacts: ArtifactRecord[]) => {
    for (const artifact of artifacts) {
      if (seenIds.has(artifact.id)) continue
      seenIds.add(artifact.id)
      pool.push(artifact)
    }
  }

  pushUnique(orderedCurrentArtifacts)

  if (sourceArtifactIds.size > 0) {
    pushUnique(orderedProjectArtifacts.filter((artifact) => sourceArtifactIds.has(artifact.id)))
  }

  if (caseId) {
    pushUnique(orderedProjectArtifacts.filter((artifact) => artifact.caseId === caseId))
  }

  return pool
}

export function buildArtifactAttachmentSeedInput(artifactAttachments: InputAttachment[]) {
  if (artifactAttachments.length === 0) {
    return "Add the context this stage should work from before running."
  }

  if (artifactAttachments.length === 1) {
    return "Use the attached artifact as the primary context for this stage. Add any extra scope or constraints here before running."
  }

  return "Use the attached artifacts as the primary context for this stage. Add any extra scope or constraints here before running."
}
