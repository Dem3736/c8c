import { getDefaultModelForProvider } from "@shared/provider-metadata"
import type {
  CreateEntryHelpModeHint,
  CreateEntryRouteInput,
  CreateEntryRouteOption,
  CreateEntryRouteResult,
  CreateEntryRouteSeed,
  ProjectInspectionSummary,
  WorkflowTemplate,
} from "@shared/types"
import {
  filterDirectCreateEntryOptions,
  sanitizeDirectCreateFallbackTemplateId,
} from "@shared/create-entry-routing"
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
const PLAN_SIGNAL_RE = /\b(plan|planning|roadmap|outline|spec|scope|implementation plan|phase plan)\b|распиши|спланир|план/i
const DO_SIGNAL_RE = /\b(build|implement|change|fix|create|make|apply|add|update|launch|ship)\b|сдела|измени|исправ|добав|реализ|внедр/i
const REPO_SIGNAL_RE = /\b(repo|repository|codebase|branch|diff|pull request|workspace|project folder|directory|file path|existing code)\b/i
const BRIEF_SIGNAL_RE = /\b(feature|brief|scope|requirements?|screen|experience|roadmap|plan|upload|checkout|signup|dashboard|onboarding|settings|billing|auth|landing)\b/i
const MAP_SIGNAL_RE = /\b(map|mapping|architecture|hotspots?|audit|overview)\b|карт(а|у|ы)\s+(проекта|репо|кодбазы)|разбер(и|ём|ем)\s+(проект|репо|кодбаз)/i
const SECURITY_SIGNAL_RE = /\b(security|secure|vulnerability|vulnerabilities|vuln|auth|authentication|authorization|permissions?|owasp|secret|secrets|exposure|hardening)\b|безопас|уязвим/i
const UI_POLISH_SIGNAL_RE = /\b(ui|ux|visual|layout|spacing|responsive|accessibility|a11y|design system|polish|pixel[- ]?perfect)\b|ui|ux|интерфейс|дизайн|визуал|вёрстк|верстк|полиш|полир|аудит\s+ui|ревью\s+ui/i
const PLAYWRIGHT_SIGNAL_RE = /\b(playwright|browser|visual regression|screenshot|screen|viewport|flow test|journey)\b|скриншот|браузер|сценар|визуальн/i
const DIRECTORY_ROUTE_TEMPLATES = new Set([
  "delivery-map-codebase",
  "ux-ui-polish-audit",
  "full-stack-code-audit",
])

function deriveIntentValue(option: CreateEntryRouteOption): CreateEntryHelpModeHint | null {
  const label = normalize(option.intentLabel).toLowerCase()
  if (label === "do it") return "do"
  if (label === "plan it") return "plan"
  if (label === "review it") return "review"
  return null
}

function filterOptionsForIntent(
  options: CreateEntryRouteOption[],
  helpModeHint: CreateEntryHelpModeHint,
): CreateEntryRouteOption[] {
  return options.filter((option) => deriveIntentValue(option) === helpModeHint)
}

function hasRepoBackedReviewContext(projectInspection: ProjectInspectionSummary) {
  return projectInspection.projectKind === "existing_repo" || projectInspection.projectKind === "review_ready"
}

function buildCombinedRequestFields(input: CreateEntryRouteInput) {
  return [
    input.draftPrompt,
    input.requestedResult,
    ...Object.values(input.modeConfig || {}),
    input.promptScaffold?.goal,
    input.promptScaffold?.input,
    input.promptScaffold?.constraints,
    input.promptScaffold?.successCriteria,
  ]
}

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

  if (templateId === "delivery-review-phase") {
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

function buildClarificationRoute({
  input,
  projectInspection,
  allowedOptions,
  title,
  message,
  options,
  fallbackTemplateId,
}: {
  input: CreateEntryRouteInput
  projectInspection: ProjectInspectionSummary
  allowedOptions: CreateEntryRouteOption[]
  title: string
  message: string
  options: Array<{
    value: CreateEntryHelpModeHint
    label: string
    description?: string
    disabled?: boolean
  }>
  fallbackTemplateId: string
}): CreateEntryRouteResult {
  const recommendedTemplateId =
    fallbackTemplateId
    || allowedOptions[0]?.templateId
    || input.fallbackTemplateId
    || ""

  return {
    recommendedTemplateId,
    alternateTemplateIds: allowedOptions
      .map((option) => option.templateId)
      .filter((templateId) => templateId !== recommendedTemplateId)
      .slice(0, 2),
    reason: message,
    projectInspection,
    seed: buildRouteSeed(recommendedTemplateId, projectInspection, input.requestedResult || ""),
    confidence: 0.2,
    source: "heuristic",
    clarification: {
      kind: "help_mode",
      title,
      message,
      options,
    },
  }
}

function buildHelpModeOption(
  value: CreateEntryHelpModeHint,
  overrides?: Partial<CreateEntryRouteOption> & { description?: string; disabled?: boolean },
) {
  if (value === "plan") {
    return {
      value,
      label: "Plan it",
      description: "Prepare a plan without jumping straight into execution.",
      ...overrides,
    }
  }
  if (value === "review") {
    return {
      value,
      label: "Review it",
      description: "Critique or verify existing work before moving forward.",
      ...overrides,
    }
  }
  return {
    value,
    label: "Do it",
    description: "Start from the request and move toward the result.",
    ...overrides,
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
  const combined = compactFields(buildCombinedRequestFields(input))
  const planOptions = filterOptionsForIntent(allowedOptions, "plan")
  const doOptions = filterOptionsForIntent(allowedOptions, "do")
  const reviewOptions = filterOptionsForIntent(allowedOptions, "review")
  const planOption = planOptions.find((option) => option.templateId === "delivery-plan-phase") || planOptions[0]

  const reviewOption = reviewOptions.find((option) => option.templateId === "delivery-review-phase") || reviewOptions[0]
  const mapOption = doOptions.find((option) => option.templateId === "delivery-map-codebase")
    || allowedOptions.find((option) => option.templateId === "delivery-map-codebase")
  const shapeOption = doOptions.find((option) => option.templateId === "delivery-shape-project")
    || allowedOptions.find((option) => option.templateId === "delivery-shape-project")
  const codeAuditOption = reviewOptions.find((option) => option.templateId === "full-stack-code-audit")
    || allowedOptions.find((option) => option.templateId === "full-stack-code-audit")
  const uiPolishOption = doOptions.find((option) => option.templateId === "impeccable-ui-pipeline")
    || allowedOptions.find((option) => option.templateId === "impeccable-ui-pipeline")
  const uxAuditOption = reviewOptions.find((option) => option.templateId === "ux-ui-polish-audit")
    || allowedOptions.find((option) => option.templateId === "ux-ui-polish-audit")
  const playwrightAuditOption = reviewOptions.find((option) => option.templateId === "playwright-visual-audit")
    || allowedOptions.find((option) => option.templateId === "playwright-visual-audit")
  const fallbackTemplateId = normalize(input.fallbackTemplateId)
  const hasRepoBackedContext = hasRepoBackedReviewContext(projectInspection)

  let recommendedTemplateId = fallbackTemplateId || mapOption?.templateId || allowedOptions[0]?.templateId || ""
  let reason = "Recommended from the current project and request context."

  const hasExistingUiSurface =
    projectInspection.projectKind === "existing_repo"
    || projectInspection.projectKind === "review_ready"
  const hasPlanSignal = PLAN_SIGNAL_RE.test(combined)
  const hasReviewSignal = REVIEW_SIGNAL_RE.test(combined)
  const hasDoSignal = DO_SIGNAL_RE.test(combined)
  const hasSpecializedReviewSignal =
    SECURITY_SIGNAL_RE.test(combined)
    || UI_POLISH_SIGNAL_RE.test(combined)
    || PLAYWRIGHT_SIGNAL_RE.test(combined)

  if (!input.helpModeHint) {
    const ambiguousHelpModes = new Set<CreateEntryHelpModeHint>()

    if (hasPlanSignal && hasDoSignal) {
      ambiguousHelpModes.add("do")
      ambiguousHelpModes.add("plan")
    }

    if (hasRepoBackedContext && hasPlanSignal && hasReviewSignal && !hasSpecializedReviewSignal) {
      ambiguousHelpModes.add("plan")
      ambiguousHelpModes.add("review")
    }

    if (hasRepoBackedContext && hasDoSignal && hasReviewSignal && !hasSpecializedReviewSignal) {
      ambiguousHelpModes.add("do")
      ambiguousHelpModes.add("review")
    }

    const clarificationOptions = (["do", "plan", "review"] as CreateEntryHelpModeHint[])
      .filter((value) => ambiguousHelpModes.has(value))
      .map((value) => buildHelpModeOption(value))

    if (clarificationOptions.length >= 2) {
      return buildClarificationRoute({
        input,
        projectInspection,
        allowedOptions,
        title: "Choose how to help",
        message: "This request could mean different kinds of help. Pick what you want first.",
        options: clarificationOptions,
        fallbackTemplateId:
          (clarificationOptions.some((option) => option.value === "plan") ? planOption?.templateId : undefined)
          || (clarificationOptions.some((option) => option.value === "review") ? reviewOption?.templateId || codeAuditOption?.templateId : undefined)
          || shapeOption?.templateId
          || mapOption?.templateId
          || recommendedTemplateId,
      })
    }
  }

  if (input.helpModeHint === "review" && !hasRepoBackedContext) {
    return buildClarificationRoute({
      input,
      projectInspection,
      allowedOptions,
      title: "Choose how to help",
      message: "Review needs existing work in a repo. Start the work or plan it first, then come back to review.",
      options: [
        buildHelpModeOption("do"),
        buildHelpModeOption("plan"),
        buildHelpModeOption("review", {
          description: "Needs existing work in a repo first.",
          disabled: true,
        }),
      ],
      fallbackTemplateId: planOption?.templateId || shapeOption?.templateId || mapOption?.templateId || recommendedTemplateId,
    })
  }

  if (input.helpModeHint === "review") {
    if (
      (playwrightAuditOption || uiPolishOption || uxAuditOption)
      && hasExistingUiSurface
      && UI_POLISH_SIGNAL_RE.test(combined)
    ) {
      if (playwrightAuditOption && PLAYWRIGHT_SIGNAL_RE.test(combined)) {
        recommendedTemplateId = playwrightAuditOption.templateId
        reason = "Recommended because review mode and the request both point to a browser-based visual audit."
      } else if (uiPolishOption && /полиш|polish|improve|improvement|fix the ui|clean up ui|harden ui|clarify ui/i.test(combined)) {
        recommendedTemplateId = uiPolishOption.templateId
        reason = "Recommended because review mode points to a UI polish path on an active product surface."
      } else if (uxAuditOption) {
        recommendedTemplateId = uxAuditOption.templateId
        reason = "Recommended because review mode points to a repo-wide UX/UI audit."
      }
    } else if (codeAuditOption && hasRepoBackedContext && (SECURITY_SIGNAL_RE.test(combined) || REVIEW_SIGNAL_RE.test(combined) || hasExistingUiSurface)) {
      recommendedTemplateId = codeAuditOption.templateId
      reason = SECURITY_SIGNAL_RE.test(combined)
        ? "Recommended because review mode and the request both point to a security/codebase audit."
        : "Recommended because review mode points to a repo-wide code audit."
    } else if (reviewOption) {
      recommendedTemplateId = reviewOption.templateId
      reason = "Recommended because review mode was selected for a review-ready project."
    } else if (codeAuditOption) {
      recommendedTemplateId = codeAuditOption.templateId
      reason = "Recommended because review mode was selected."
    }
  } else if (input.helpModeHint === "plan") {
    if (planOption) {
      recommendedTemplateId = planOption.templateId
      reason = "Recommended because plan mode was selected."
    } else {
      return buildClarificationRoute({
        input,
        projectInspection,
        allowedOptions,
        title: "Choose how to start",
        message: "Planning is not available for this flow yet. Start the work or review existing work instead.",
        options: [
          {
            value: "do",
            label: "Do it",
            description: "Start from the request and let the flow choose the first step.",
          },
          {
            value: "plan",
            label: "Plan it",
            description: "No planning start is available here yet.",
            disabled: true,
          },
          {
            value: "review",
            label: "Review it",
            description: "Review existing work when a repo-backed context exists.",
            disabled: !hasRepoBackedContext,
          },
        ],
        fallbackTemplateId: shapeOption?.templateId || recommendedTemplateId,
      })
    }
  } else if (input.helpModeHint === "do") {
    if (
      uiPolishOption
      && hasExistingUiSurface
      && UI_POLISH_SIGNAL_RE.test(combined)
      && /полиш|polish|improve|improvement|fix the ui|clean up ui|harden ui|clarify ui/i.test(combined)
    ) {
      recommendedTemplateId = uiPolishOption.templateId
      reason = "Recommended because do mode points to improving the current UI surface."
    } else if (
      mapOption
      && (
        REPO_SIGNAL_RE.test(combined)
        || projectInspection.projectKind === "existing_repo"
        || projectInspection.projectKind === "review_ready"
      )
    ) {
      recommendedTemplateId = mapOption.templateId
      reason = "Recommended because do mode on an existing repo starts by exploring the codebase."
    } else if (shapeOption) {
      recommendedTemplateId = shapeOption.templateId
      reason = "Recommended because do mode starts from shaping the requested change."
    } else if (doOptions[0]) {
      recommendedTemplateId = doOptions[0].templateId
      reason = "Recommended because do mode was selected."
    }
  } else if (
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
    codeAuditOption
    && hasRepoBackedContext
    && (
      SECURITY_SIGNAL_RE.test(combined)
      || (REVIEW_SIGNAL_RE.test(combined) && /audit|risk|security|quality|architecture|coverage/i.test(combined))
    )
  ) {
    recommendedTemplateId = codeAuditOption.templateId
    reason = SECURITY_SIGNAL_RE.test(combined)
      ? "Recommended because this looks like a security-focused code audit request."
      : "Recommended because this looks like a repo-wide code audit request."
  } else if (
    codeAuditOption
    && projectInspection.projectKind === "review_ready"
    && REVIEW_SIGNAL_RE.test(combined)
  ) {
    recommendedTemplateId = codeAuditOption.templateId
    reason = "Recommended because this looks like a broad review request on a review-ready codebase."
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
    clarification: null,
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
    helpModeHint: input.helpModeHint || null,
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
    "- Respect helpModeHint as a hard constraint when it is present. `plan` must stay on plan-oriented starts, `review` must stay on review-oriented starts, and `do` must stay on execution-oriented starts.",
    "- Review entries are only valid when review context genuinely exists.",
    "- Prefer specialized UI audit/polish entries when the request is explicitly about UI review, polish, visual quality, or browser-based visual testing.",
    "- Prefer a repo-wide code audit when the request is about security, architecture risks, quality gaps, or a broad code review.",
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
  return compactFields(buildCombinedRequestFields(input))
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
  allowedOptions: CreateEntryRouteOption[],
  agentDecision: CreateEntryRouteDecision,
  heuristicRoute: CreateEntryRouteResult,
): CreateEntryRouteResult | null {
  if (input.helpModeHint) {
    const recommendedOption = allowedOptions.find((option) => option.templateId === agentDecision.recommendedTemplateId)
    if (!recommendedOption || deriveIntentValue(recommendedOption) !== input.helpModeHint) {
      return {
        ...heuristicRoute,
        reason: `Recommended because ${input.helpModeHint} was selected for this request.`,
        confidence: Math.max(heuristicRoute.confidence, 0.72),
      }
    }
  }

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
  const fallbackTemplateId = sanitizeDirectCreateFallbackTemplateId(input.modeId, input.fallbackTemplateId)
  const sanitizedInput = fallbackTemplateId === input.fallbackTemplateId
    ? input
    : { ...input, fallbackTemplateId }
  const allowedOptions = filterDirectCreateEntryOptions(
    input.modeId,
    buildAllowedOptionMap(input.allowedOptions || [], templates),
  )
  const boundedOptions = allowedOptions.length > 0
    ? allowedOptions.map(({ template, ...option }) => option)
    : (
      fallbackTemplateId
        ? [{ templateId: fallbackTemplateId, label: "Default start" }]
        : []
    )

  const heuristicRoute = buildHeuristicCreateEntryRoute(sanitizedInput, projectInspection, boundedOptions)
  if (heuristicRoute.clarification) {
    return heuristicRoute
  }

  const agentDecision = await runAgentRouteDecision(sanitizedInput, projectInspection, boundedOptions)
  if (!agentDecision) {
    return heuristicRoute
  }

  const guardedRoute = applyCreateEntryRouteGuards(sanitizedInput, projectInspection, boundedOptions, agentDecision, heuristicRoute)
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
    clarification: null,
  }
}
