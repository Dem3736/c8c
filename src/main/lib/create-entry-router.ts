import { getDefaultModelForProvider } from "@shared/provider-metadata"
import type {
  CreateEntryRouteInput,
  CreateEntryRouteOption,
  CreateEntryRouteResult,
  CreateEntryRouteSeed,
  ProjectInspectionSummary,
  WorkflowTemplate,
} from "@shared/types"
import { drainExecutionHandle } from "./agent-execution"
import { withExecutionSlot } from "./execution-pool"
import { LogParser } from "./log-parser"
import { prepareTemporaryMcpConfig } from "./mcp-config"
import { getProviderSettings } from "./provider-settings"
import { applyProviderFeatureFlags, startProviderTask } from "./provider-runtime"
import { logWarn } from "./structured-log"

interface CreateEntryRouteDecision {
  recommendedTemplateId: string
  alternateTemplateIds?: string[]
  reason?: string
  confidence?: number
}

const REVIEW_SIGNAL_RE = /\b(review|verify|verification|qa|merge|ship|pull request|pr|branch|diff)\b/i
const REPO_SIGNAL_RE = /\b(repo|repository|codebase|branch|diff|pull request|workspace|project folder|directory|file path|existing code)\b/i
const BRIEF_SIGNAL_RE = /\b(feature|brief|scope|requirements?|screen|experience|roadmap|plan|upload|checkout|signup|dashboard|onboarding|settings|billing|auth|landing)\b/i
const MAP_SIGNAL_RE = /\b(map|mapping|architecture|hotspots?|audit|overview)\b|карт(а|у|ы)\s+(проекта|репо|кодбазы)|разбер(и|ём|ем)\s+(проект|репо|кодбаз)/i
const UI_POLISH_SIGNAL_RE = /\b(ui|ux|visual|layout|spacing|responsive|accessibility|a11y|design system|polish|pixel[- ]?perfect)\b|ui|ux|интерфейс|дизайн|визуал|вёрстк|верстк|полиш|полир|аудит\s+ui|ревью\s+ui/i
const PLAYWRIGHT_SIGNAL_RE = /\b(playwright|browser|visual regression|screenshot|screen|viewport|flow test|journey)\b|скриншот|браузер|сценар|визуальн/i
const DIRECTORY_ROUTE_TEMPLATES = new Set([
  "delivery-map-codebase",
  "ux-ui-polish-audit",
])

function normalize(value: string | undefined | null) {
  return (value || "").trim()
}

function compactFields(values: Array<string | undefined | null>): string {
  return values
    .map((value) => normalize(value))
    .filter(Boolean)
    .join("\n")
}

function buildAllowedOptionMap(options: CreateEntryRouteOption[], templates: WorkflowTemplate[]) {
  const templateById = new Map(templates.map((template) => [template.id, template]))
  return options
    .map((option) => {
      const template = templateById.get(option.templateId)
      return template ? { ...option, template } : null
    })
    .filter((value): value is CreateEntryRouteOption & { template: WorkflowTemplate } => Boolean(value))
}

function buildRouteSeed(
  templateId: string,
  projectInspection: ProjectInspectionSummary,
  requestedResult: string,
): CreateEntryRouteSeed {
  const cleanRequestedResult = normalize(requestedResult)

  if (DIRECTORY_ROUTE_TEMPLATES.has(templateId)) {
    return {
      primaryInputMode: "directory",
      primaryInputValue: projectInspection.projectPath,
      attachments: cleanRequestedResult
        ? [{ kind: "text", label: "Requested result", content: cleanRequestedResult }]
        : [],
    }
  }

  if (templateId === "delivery-verify-phase") {
    return {
      primaryInputMode: "branch_or_diff",
      primaryInputValue: projectInspection.git.branch || cleanRequestedResult,
      attachments: cleanRequestedResult && cleanRequestedResult !== projectInspection.git.branch
        ? [{ kind: "text", label: "Requested result", content: cleanRequestedResult }]
        : [],
    }
  }

  return {
    primaryInputMode: "text",
    primaryInputValue: cleanRequestedResult,
    attachments: [],
  }
}

function validateDecision(
  decision: CreateEntryRouteDecision,
  allowedTemplateIds: Set<string>,
): CreateEntryRouteDecision | null {
  const recommendedTemplateId = normalize(decision.recommendedTemplateId)
  if (!recommendedTemplateId || !allowedTemplateIds.has(recommendedTemplateId)) return null

  const alternateTemplateIds = Array.isArray(decision.alternateTemplateIds)
    ? decision.alternateTemplateIds
      .map((value) => normalize(value))
      .filter((value) => value && value !== recommendedTemplateId && allowedTemplateIds.has(value))
    : []

  return {
    recommendedTemplateId,
    alternateTemplateIds,
    reason: normalize(decision.reason),
    confidence: typeof decision.confidence === "number" ? decision.confidence : undefined,
  }
}

export function buildHeuristicCreateEntryRoute(
  input: CreateEntryRouteInput,
  projectInspection: ProjectInspectionSummary,
  allowedOptions: CreateEntryRouteOption[],
): CreateEntryRouteResult {
  const allowedTemplateIds = new Set(allowedOptions.map((option) => option.templateId))
  const combined = compactFields([
    input.draftPrompt,
    input.requestedResult,
    ...Object.values(input.modeConfig || {}),
    input.promptScaffold?.goal,
    input.promptScaffold?.input,
    input.promptScaffold?.constraints,
    input.promptScaffold?.successCriteria,
  ])

  const reviewOption = allowedOptions.find((option) => option.templateId === "delivery-verify-phase")
  const mapOption = allowedOptions.find((option) => option.templateId === "delivery-map-codebase")
  const shapeOption = allowedOptions.find((option) => option.templateId === "delivery-shape-project")
  const uiPolishOption = allowedOptions.find((option) => option.templateId === "impeccable-ui-pipeline")
  const uxAuditOption = allowedOptions.find((option) => option.templateId === "ux-ui-polish-audit")
  const playwrightAuditOption = allowedOptions.find((option) => option.templateId === "playwright-visual-audit")
  const fallbackTemplateId = normalize(input.fallbackTemplateId)

  let recommendedTemplateId = fallbackTemplateId || mapOption?.templateId || allowedOptions[0]?.templateId || ""
  let reason = "Recommended from the current project and request context."

  const hasExistingUiSurface =
    projectInspection.projectKind === "existing_repo"
    || projectInspection.projectKind === "review_ready"

  if (
    (playwrightAuditOption || uiPolishOption || uxAuditOption)
    && hasExistingUiSurface
    && UI_POLISH_SIGNAL_RE.test(combined)
  ) {
    if (playwrightAuditOption && PLAYWRIGHT_SIGNAL_RE.test(combined)) {
      recommendedTemplateId = playwrightAuditOption.templateId
      reason = "Recommended because this looks like a browser-based visual audit request."
    } else if (uiPolishOption && /полиш|polish|improve|improvement|fix the ui|clean up ui|harden ui|clarify ui/i.test(combined)) {
      recommendedTemplateId = uiPolishOption.templateId
      reason = "Recommended because this looks like a UI review-and-polish request on an active product surface."
    } else if (uxAuditOption) {
      recommendedTemplateId = uxAuditOption.templateId
      reason = "Recommended because this looks like a repo-wide UX/UI audit request."
    } else if (uiPolishOption) {
      recommendedTemplateId = uiPolishOption.templateId
      reason = "Recommended because this looks like a UI review-and-polish request on an active product surface."
    }
  } else if (
    reviewOption
    && projectInspection.projectKind === "review_ready"
    && REVIEW_SIGNAL_RE.test(combined)
  ) {
    recommendedTemplateId = reviewOption.templateId
    reason = "Recommended because the project already has review-ready git context."
  } else if (
    mapOption
    && (
      REPO_SIGNAL_RE.test(combined)
      || projectInspection.projectKind === "existing_repo"
      || projectInspection.projectKind === "review_ready"
    )
  ) {
    recommendedTemplateId = mapOption.templateId
    reason = "Recommended because the project looks like an existing codebase that benefits from mapping first."
  } else if (
    shapeOption
    && (
      projectInspection.projectKind === "greenfield_empty"
      || projectInspection.projectKind === "greenfield_scaffold"
      || BRIEF_SIGNAL_RE.test(combined)
    )
  ) {
    recommendedTemplateId = shapeOption.templateId
    reason = "Recommended because this looks like a brief-first or greenfield request."
  } else if (shapeOption && !allowedTemplateIds.has(recommendedTemplateId)) {
    recommendedTemplateId = shapeOption.templateId
    reason = "Recommended because shaping is the safest first move for this request."
  }

  const alternateTemplateIds = allowedOptions
    .map((option) => option.templateId)
    .filter((templateId) => templateId !== recommendedTemplateId)
    .slice(0, 2)

  return {
    recommendedTemplateId,
    alternateTemplateIds,
    reason,
    projectInspection,
    seed: buildRouteSeed(recommendedTemplateId, projectInspection, input.requestedResult || ""),
    confidence: 0.55,
    source: "heuristic",
  }
}

function buildRouterPrompt(
  input: CreateEntryRouteInput,
  projectInspection: ProjectInspectionSummary,
  allowedOptions: CreateEntryRouteOption[],
): string {
  const requestSections = {
    draftPrompt: normalize(input.draftPrompt),
    requestedResult: normalize(input.requestedResult),
    modeConfig: input.modeConfig || {},
    promptScaffold: input.promptScaffold || {},
  }

  return [
    "Choose the best start for this process request.",
    "You are routing a create request to one known starting point.",
    "Return JSON only.",
    "",
    "Allowed options:",
    JSON.stringify(allowedOptions, null, 2),
    "",
    "Project inspection:",
    JSON.stringify(projectInspection, null, 2),
    "",
    "User request:",
    JSON.stringify(requestSections, null, 2),
    "",
    "Rules:",
    "- Recommend exactly one allowed templateId.",
    "- Review entries are only valid when review context genuinely exists.",
    "- Prefer specialized UI audit/polish entries when the request is explicitly about UI review, polish, visual quality, or browser-based visual testing.",
    "- Prefer Shape Project for greenfield or brief-first requests.",
    "- Prefer Map Codebase when existing-repo orientation is the best first move.",
    "- Keep alternates short and relevant.",
    "",
    "Output schema:",
    '{"recommendedTemplateId":"string","alternateTemplateIds":["string"],"reason":"string","confidence":0.0}',
  ].join("\n")
}

function parseRouterDecision(rawText: string, allowedTemplateIds: Set<string>): CreateEntryRouteDecision | null {
  try {
    const parsed = JSON.parse(rawText) as CreateEntryRouteDecision
    return validateDecision(parsed, allowedTemplateIds)
  } catch {
    return null
  }
}

function buildCombinedRequestText(input: CreateEntryRouteInput) {
  return compactFields([
    input.draftPrompt,
    input.requestedResult,
    ...Object.values(input.modeConfig || {}),
    input.promptScaffold?.goal,
    input.promptScaffold?.input,
    input.promptScaffold?.constraints,
    input.promptScaffold?.successCriteria,
  ])
}

function shouldForceExistingRepoMap(
  input: CreateEntryRouteInput,
  projectInspection: ProjectInspectionSummary,
  recommendationTemplateId: string,
) {
  if (recommendationTemplateId === "delivery-map-codebase") return false
  if (
    projectInspection.projectKind !== "existing_repo"
    && projectInspection.projectKind !== "review_ready"
  ) {
    return false
  }

  const combined = buildCombinedRequestText(input)
  return MAP_SIGNAL_RE.test(combined) || REPO_SIGNAL_RE.test(combined)
}

export function applyCreateEntryRouteGuards(
  input: CreateEntryRouteInput,
  projectInspection: ProjectInspectionSummary,
  agentDecision: CreateEntryRouteDecision,
  heuristicRoute: CreateEntryRouteResult,
): CreateEntryRouteResult | null {
  if (shouldForceExistingRepoMap(input, projectInspection, agentDecision.recommendedTemplateId)) {
    return {
      ...heuristicRoute,
      reason: "Recommended because this request explicitly asks to inspect or map an existing codebase first.",
      confidence: Math.max(heuristicRoute.confidence, 0.72),
    }
  }

  return null
}

async function runAgentRouteDecision(
  input: CreateEntryRouteInput,
  projectInspection: ProjectInspectionSummary,
  allowedOptions: CreateEntryRouteOption[],
): Promise<CreateEntryRouteDecision | null> {
  if (input.modeId !== "development" || allowedOptions.length === 0) return null

  const allowedTemplateIds = new Set(allowedOptions.map((option) => option.templateId))
  const prompt = buildRouterPrompt(input, projectInspection, allowedOptions)
  const settings = await getProviderSettings()
  const providerId = applyProviderFeatureFlags(
    settings.defaultProvider,
    settings.features.codexProvider,
  )
  const model = getDefaultModelForProvider(providerId)
  const logParser = new LogParser()
  const runtimeMcpConfig = await prepareTemporaryMcpConfig(projectInspection.projectPath)

  try {
    const result = await withExecutionSlot(async () => {
      const handle = await startProviderTask(providerId, {
        workdir: projectInspection.projectPath,
        prompt,
        model,
        maxTurns: 8,
        systemPrompts: [
          "You are a process entry router. Output ONLY valid JSON. Do NOT use tools. Do NOT inspect files. Choose one allowed starting point from the provided options.",
        ],
        mcpConfigPath: runtimeMcpConfig.path,
        disableBuiltInTools: providerId === "claude",
        disableSlashCommands: providerId === "claude",
        timeout: 20_000,
      })
      return drainExecutionHandle(handle, {
        onLogEntry: (entry) => {
          logParser.appendEntry(entry)
        },
        onUsage: (usage) => {
          logParser.applyUsage(usage)
        },
      })
    })

    logParser.flush()

    if (!result.success || result.killed || result.aborted) return null
    const text = logParser.textContent.trim()
    if (!text) return null
    return parseRouterDecision(text, allowedTemplateIds)
  } catch (error) {
    logWarn("create-entry-router", "agent_route_failed", { error: String(error) })
    return null
  } finally {
    await runtimeMcpConfig.cleanup()
  }
}

export async function routeCreateEntry(
  input: CreateEntryRouteInput,
  projectInspection: ProjectInspectionSummary,
  templates: WorkflowTemplate[],
): Promise<CreateEntryRouteResult> {
  const allowedOptions = buildAllowedOptionMap(input.allowedOptions || [], templates)
  const boundedOptions = allowedOptions.length > 0
    ? allowedOptions.map(({ template, ...option }) => option)
    : (
      input.fallbackTemplateId
        ? [{ templateId: input.fallbackTemplateId, label: "Default start" }]
        : []
    )

  const agentDecision = await runAgentRouteDecision(input, projectInspection, boundedOptions)
  const heuristicRoute = buildHeuristicCreateEntryRoute(input, projectInspection, boundedOptions)
  if (!agentDecision) {
    return heuristicRoute
  }

  const guardedRoute = applyCreateEntryRouteGuards(input, projectInspection, agentDecision, heuristicRoute)
  if (guardedRoute) {
    return guardedRoute
  }

  return {
    recommendedTemplateId: agentDecision.recommendedTemplateId,
    alternateTemplateIds: agentDecision.alternateTemplateIds || heuristicRoute.alternateTemplateIds,
    reason: agentDecision.reason || heuristicRoute.reason,
    projectInspection,
    seed: buildRouteSeed(agentDecision.recommendedTemplateId, projectInspection, input.requestedResult || ""),
    confidence: agentDecision.confidence ?? 0.8,
    source: "agent",
  }
}
