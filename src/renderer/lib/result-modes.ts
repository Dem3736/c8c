import type {
  ResultModeDefinition,
  ResultModeId,
  WorkflowTemplate,
  WorkflowTemplateStage,
} from "@shared/types"
import type { WorkflowCreatePromptScaffold } from "@/lib/workflow-create-prompt"
import { isContentTemplate, isMarketingTemplate, isProductTemplate } from "@/lib/template-filters"

export interface WorkflowResultMode extends ResultModeDefinition {
  packIds?: string[]
  templateIds?: string[]
  stagePreferences?: WorkflowTemplateStage[]
  startTemplateId?: string
  startActionLabel?: string
  guidedPath?: string[]
  composerPlaceholder: string
  scaffoldPlaceholders: WorkflowCreatePromptScaffold
}

const DEVELOPMENT_PACK_IDS = new Set([
  "delivery-foundation",
  "gstack-team",
])

const DEVELOPMENT_TEMPLATE_IDS = new Set([
  "delivery-map-codebase",
  "delivery-shape-project",
  "delivery-plan-phase",
  "delivery-research-phase",
  "delivery-verify-phase",
  "full-stack-code-audit",
  "cto-product-spec",
  "cto-optimise-audit",
  "ux-ui-polish-audit",
  "playwright-visual-audit",
  "design-code-test",
  "deep-research",
  "impeccable-ui-pipeline",
  "gstack-feature-squad",
  "gstack-preflight-gate",
  "gstack-web-quality-board",
])

const CONTENT_PACK_IDS = new Set([
  "ai-cmo",
])

const COURSES_PACK_IDS = new Set([
  "content-factory-alpha",
  "courses-factory-alpha",
])

const CONTENT_TEMPLATE_IDS = new Set([
  "competitor-ad-intelligence",
  "lead-research-machine",
  "segment-research-gate",
  "seed-account-map-pipeline",
  "vertical-pain-to-target-list",
  "raw-list-to-verified-contacts",
  "segmented-outreach-launchpad",
  "new-vertical-to-live-campaign",
  "cold-outreach-pipeline",
  "landing-audit-loop",
  "landing-page-generator",
  "content-pipeline",
  "copy-quality-pipeline",
  "indispensable-jtbd-pipeline",
  "irresistible-resonance-pipeline",
  "twitter-growth-machine",
])

const COURSES_TEMPLATE_IDS = new Set([
  "content-trend-watch",
  "content-idea-backlog",
  "content-editorial-calendar",
  "content-post-calendar",
  "content-draft-post",
  "content-ready-posts",
  "content-distribution-bundle",
  "content-qa-review",
  "content-repurposing-factory",
  "copy-quality-pipeline",
  "content-pipeline",
  "predictable-text-factory",
  "landing-page-generator",
  "courses-audience-offer",
  "courses-curriculum-map",
  "courses-lesson-system",
  "courses-trigger-playbook",
  "courses-launch-assets",
])

const DEVELOPMENT_TEXT_RE = /\b(codebase|repository|repo|feature|implementation|verification|spec|audit|bug|architecture|ui audit|design system|roadmap|qa|test|ship)\b/i
const CONTENT_TEXT_RE = /\b(marketing|growth|seo|geo|reddit|hacker news|trend|campaign|landing page|positioning|messaging|outreach|lead|prospect|segment|audience|jtbd|competitive|ads?)\b/i
const COURSES_TEXT_RE = /\b(content|post|copy|editorial|newsletter|draft|publish|course|curriculum|lesson|module|education|workshop|cohort|training|launch bundle|transformation|video|script)\b/i

function compactText(values: Array<string | undefined | null>): string {
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .join(" ")
}

function metadataText(template: WorkflowTemplate): string {
  return compactText([
    template.id,
    template.name,
    template.description,
    template.headline,
    template.how,
    template.input,
    template.output,
    template.useWhen,
    template.pack?.id,
    template.pack?.label,
    template.executionPolicy?.summary,
    template.executionPolicy?.description,
    template.executionPolicy?.tags?.join(" "),
  ])
}

export const RESULT_MODES: WorkflowResultMode[] = [
  {
    id: "development",
    label: "Product",
    emoji: "🧩",
    summary: "Shape, build, audit, or verify product work with visible checkpoints.",
    useFor: "Development, research, design, repo mapping, product specs, and QA.",
    youProvide: "A repo, feature request, bug, PRD, or product goal.",
    youGetFirst: "A codebase map, project shape, or product plan you can pressure-test.",
    userRole: "Approve scope, decisions, and quality at a few high-leverage checkpoints.",
    packIds: ["delivery-foundation", "gstack-team"],
    templateIds: Array.from(DEVELOPMENT_TEMPLATE_IDS),
    stagePreferences: ["research", "strategy", "code", "operations"],
    startTemplateId: "delivery-map-codebase",
    startActionLabel: "Start guided path",
    guidedPath: ["Map context", "Shape the work", "Plan delivery"],
    composerPlaceholder: "Describe the product result you want, the repo or context you have, and any quality or delivery constraints...",
    scaffoldPlaceholders: {
      goal: "What product or feature outcome should this workflow drive?",
      input: "Repository path, issue, PRD, user flow, or technical context.",
      constraints: "Stack constraints, deadlines, rollout risks, testing bar, design constraints, or delivery realities.",
      successCriteria: "What would make this feel genuinely ready to ship, verify, or review?",
    },
  },
  {
    id: "content",
    label: "Marketing",
    emoji: "📣",
    summary: "Research a market, choose angles, and turn them into campaigns, pages, or growth loops.",
    useFor: "Research, positioning, trends, SEO, messaging, outreach, and marketing audits.",
    youProvide: "A product, market, audience, channel, competitor set, or growth question.",
    youGetFirst: "A segment map, growth thesis, trend digest, or campaign plan.",
    userRole: "Approve audience choice, angle, and sample quality before scaling.",
    packIds: ["ai-cmo"],
    templateIds: Array.from(CONTENT_TEMPLATE_IDS),
    stagePreferences: ["research", "strategy", "content", "outreach"],
    startTemplateId: "segment-research-gate",
    startActionLabel: "Start guided path",
    guidedPath: ["Research the market", "Choose the angle", "Ship the assets"],
    composerPlaceholder: "Describe the marketing result you want, the audience or segment, the channel, and any quality or brand constraints...",
    scaffoldPlaceholders: {
      goal: "What marketing outcome should this workflow create?",
      input: "Product context, market notes, competitors, audience signals, links, or campaign context.",
      constraints: "Channels, brand rules, approved angles, no-slop rules, timing, or budget realities.",
      successCriteria: "What would make the strategy or assets clearly useful, grounded, and worth shipping?",
    },
  },
  {
    id: "courses",
    label: "Content",
    emoji: "✍️",
    summary: "Turn ideas or expertise into publishable text systems, lessons, and launch-ready assets.",
    useFor: "Texts, newsletters, post systems, course material, lesson production, and content operations.",
    youProvide: "A topic, source material, audience, offer, or expertise you want packaged.",
    youGetFirst: "A draft plan, publishing system, or curriculum direction ready to refine.",
    userRole: "Approve voice, structure, and sample quality before output scales.",
    packIds: ["content-factory-alpha", "courses-factory-alpha"],
    templateIds: Array.from(COURSES_TEMPLATE_IDS),
    stagePreferences: ["strategy", "content", "research"],
    startTemplateId: "content-trend-watch",
    startActionLabel: "Start guided path",
    guidedPath: ["Clarify audience", "Plan the structure", "Produce the assets"],
    composerPlaceholder: "Describe the content system, text output, or course-style asset you want to create, who it is for, and what good looks like...",
    scaffoldPlaceholders: {
      goal: "What content or education outcome should this workflow create?",
      input: "Source docs, notes, transcripts, audience context, offer material, or existing drafts.",
      constraints: "Format, tone, no-slop rules, lesson length, publishing cadence, or launch needs.",
      successCriteria: "What would make the drafts, structure, or lesson assets feel strong and usable?",
    },
  },
]

const MODE_BY_ID = new Map<ResultModeId, WorkflowResultMode>(
  RESULT_MODES.map((mode) => [mode.id, mode]),
)

export function getResultMode(modeId: ResultModeId): WorkflowResultMode {
  return MODE_BY_ID.get(modeId) || RESULT_MODES[0]
}

function templateScoreForMode(template: WorkflowTemplate, modeId: ResultModeId): number {
  const text = metadataText(template)

  if (modeId === "development") {
    let score = 0
    if (template.pack?.id && DEVELOPMENT_PACK_IDS.has(template.pack.id)) score += 100
    if (DEVELOPMENT_TEMPLATE_IDS.has(template.id)) score += 80
    if (isProductTemplate(template)) score += 35
    if (template.stage === "code") score += 30
    if ((template.stage === "research" || template.stage === "strategy" || template.stage === "operations") && DEVELOPMENT_TEXT_RE.test(text)) score += 20
    if (DEVELOPMENT_TEXT_RE.test(text)) score += 10
    return score
  }

  if (modeId === "content") {
    let score = 0
    if (template.pack?.id && CONTENT_PACK_IDS.has(template.pack.id)) score += 100
    if (CONTENT_TEMPLATE_IDS.has(template.id)) score += 80
    if (isMarketingTemplate(template)) score += 35
    if (template.stage === "research" || template.stage === "strategy" || template.stage === "outreach") score += 30
    if ((template.stage === "strategy" || template.stage === "research") && CONTENT_TEXT_RE.test(text)) score += 20
    if (CONTENT_TEXT_RE.test(text)) score += 10
    return score
  }

  if (modeId === "courses") {
    let score = 0
    if (template.pack?.id && COURSES_PACK_IDS.has(template.pack.id)) score += 100
    if (COURSES_TEMPLATE_IDS.has(template.id)) score += 90
    if (isContentTemplate(template)) score += 35
    if (COURSES_TEXT_RE.test(text)) score += 60
    if ((template.stage === "strategy" || template.stage === "content") && /(audience|positioning|offer|lesson|curriculum|launch|draft|publish)/i.test(text)) score += 20
    return score
  }

  return 0
}

export function templateMatchesResultMode(template: WorkflowTemplate, modeId: ResultModeId): boolean {
  return templateScoreForMode(template, modeId) > 0
}

export function filterTemplatesForResultMode(
  templates: WorkflowTemplate[],
  modeId: ResultModeId,
): WorkflowTemplate[] {
  return templates.filter((template) => templateMatchesResultMode(template, modeId))
}

export function prioritizeTemplatesForResultMode(
  templates: WorkflowTemplate[],
  modeId: ResultModeId,
): WorkflowTemplate[] {
  return templates
    .map((template, index) => ({
      template,
      index,
      score: templateScoreForMode(template, modeId),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return left.index - right.index
    })
    .map((entry) => entry.template)
}
