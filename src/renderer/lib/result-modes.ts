import type {
  ResultModeDefinition,
  ResultModeId,
  WorkflowTemplate,
  WorkflowTemplateStage,
} from "@shared/types"
import type { WorkflowCreatePromptScaffold } from "@/lib/workflow-create-prompt"

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
])

const DEVELOPMENT_TEMPLATE_IDS = new Set([
  "full-stack-code-audit",
  "cto-product-spec",
  "cto-optimise-audit",
  "ux-ui-polish-audit",
  "playwright-visual-audit",
  "design-code-test",
  "deep-research",
])

const CONTENT_PACK_IDS = new Set([
  "content-factory-alpha",
  "ai-cmo",
])

const COURSES_PACK_IDS = new Set([
  "courses-factory-alpha",
])

const CONTENT_TEMPLATE_IDS = new Set([
  "content-pipeline",
  "content-repurposing-factory",
  "copy-quality-pipeline",
  "cold-outreach-pipeline",
  "lead-research-machine",
  "seed-account-map-pipeline",
  "vertical-pain-to-target-list",
  "raw-list-to-verified-contacts",
  "segmented-outreach-launchpad",
  "new-vertical-to-live-campaign",
  "twitter-growth-machine",
  "landing-page-generator",
  "indispensable-jtbd-pipeline",
  "irresistible-resonance-pipeline",
  "competitor-ad-intelligence",
])

const COURSES_TEMPLATE_IDS = new Set([
  "courses-audience-offer",
  "courses-curriculum-map",
  "courses-lesson-system",
  "courses-launch-assets",
  "indispensable-jtbd-pipeline",
  "landing-page-generator",
  "content-pipeline",
  "copy-quality-pipeline",
  "irresistible-resonance-pipeline",
])

const DEVELOPMENT_TEXT_RE = /\b(codebase|repository|repo|feature|implementation|verification|spec|audit|bug|architecture|ui audit|test)\b/i
const CONTENT_TEXT_RE = /\b(content|post|copy|campaign|trend|editorial|distribution|growth|marketing|seo|geo|reddit|hacker news|x thread|outreach|landing page|messaging|audience)\b/i
const COURSES_TEXT_RE = /\b(course|curriculum|lesson|module|education|workshop|offer|cohort|training|launch bundle|transformation)\b/i

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
    label: "Development",
    emoji: "🛠",
    summary: "Ship, improve, or verify a product through visible stages and quality gates.",
    useFor: "Product work, repo mapping, planning, implementation prep, and verification.",
    youProvide: "A repo, feature request, bug, PRD, or product goal.",
    youGetFirst: "A codebase map, project shape, or phase plan you can act on.",
    userRole: "Approve scope, plan, and quality at a few high-leverage checkpoints.",
    packIds: ["delivery-foundation"],
    templateIds: Array.from(DEVELOPMENT_TEMPLATE_IDS),
    stagePreferences: ["research", "strategy", "code", "operations"],
    startTemplateId: "delivery-map-codebase",
    startActionLabel: "Start guided path",
    guidedPath: ["Map codebase", "Shape project", "Plan phase"],
    composerPlaceholder: "Describe the product result you want shipped, the repo or context you have, and any quality bar or constraints...",
    scaffoldPlaceholders: {
      goal: "What should this product or feature work achieve?",
      input: "Repository path, issue, PRD, user flow, or technical context.",
      constraints: "Stack constraints, deadlines, risk limits, testing bar, or deployment realities.",
      successCriteria: "What would make this feel truly ready to ship or verify?",
    },
  },
  {
    id: "content",
    label: "Content",
    emoji: "✍️",
    summary: "Turn a topic or campaign goal into research-backed, ready-to-review text assets.",
    useFor: "Posts, content systems, research-to-draft flows, messaging, and campaign assets.",
    youProvide: "A topic, audience, channel, source material, or campaign goal.",
    youGetFirst: "A trend digest, post plan, or draft asset ready for review.",
    userRole: "Approve direction and sample quality before the system scales output.",
    packIds: ["content-factory-alpha", "ai-cmo"],
    templateIds: Array.from(CONTENT_TEMPLATE_IDS),
    stagePreferences: ["content", "strategy", "outreach", "research"],
    startTemplateId: "content-trend-watch",
    startActionLabel: "Start guided path",
    guidedPath: ["Trend watch", "Post calendar", "Ready posts"],
    composerPlaceholder: "Describe the content result you want, where it will be published, who it is for, and the tone or quality bar you need...",
    scaffoldPlaceholders: {
      goal: "What content outcome do you want to produce?",
      input: "Topic brief, links, notes, source docs, audience signals, or campaign context.",
      constraints: "Channel, tone of voice, no-slop rules, posting cadence, or brand constraints.",
      successCriteria: "What would make the output publishable or strategically useful?",
    },
  },
  {
    id: "courses",
    label: "Courses",
    emoji: "🎓",
    summary: "Turn expertise into an offer, curriculum, lessons, and launch-ready assets.",
    useFor: "Courses, workshops, infobusiness assets, curriculum shaping, and lesson production.",
    youProvide: "Expertise, audience context, transformation promise, notes, or offer material.",
    youGetFirst: "An audience map, curriculum direction, or lesson system to refine.",
    userRole: "Steer positioning, curriculum, and sample lesson quality at sparse checkpoints.",
    packIds: ["courses-factory-alpha"],
    templateIds: Array.from(COURSES_TEMPLATE_IDS),
    stagePreferences: ["strategy", "content", "research"],
    startTemplateId: "courses-audience-offer",
    startActionLabel: "Start guided path",
    guidedPath: ["Audience and offer", "Curriculum map", "Lesson system", "Launch assets"],
    composerPlaceholder: "Describe the course, workshop, or expertise product you want to create, who it is for, and what transformation it should deliver...",
    scaffoldPlaceholders: {
      goal: "What course or education outcome should this create?",
      input: "Audience notes, expertise docs, offer ideas, lesson material, or source recordings.",
      constraints: "Format, depth, tone, lesson length, launch needs, or delivery constraints.",
      successCriteria: "What would make the course structure and sample lessons feel strong?",
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
    if (template.stage === "code") score += 30
    if ((template.stage === "research" || template.stage === "strategy" || template.stage === "operations") && DEVELOPMENT_TEXT_RE.test(text)) score += 20
    if (DEVELOPMENT_TEXT_RE.test(text)) score += 10
    return score
  }

  if (modeId === "content") {
    let score = 0
    if (template.pack?.id && CONTENT_PACK_IDS.has(template.pack.id)) score += 100
    if (CONTENT_TEMPLATE_IDS.has(template.id)) score += 80
    if (template.stage === "content" || template.stage === "outreach") score += 30
    if ((template.stage === "strategy" || template.stage === "research") && CONTENT_TEXT_RE.test(text)) score += 20
    if (CONTENT_TEXT_RE.test(text)) score += 10
    return score
  }

  if (modeId === "courses") {
    let score = 0
    if (template.pack?.id && COURSES_PACK_IDS.has(template.pack.id)) score += 100
    if (COURSES_TEMPLATE_IDS.has(template.id)) score += 90
    if (COURSES_TEXT_RE.test(text)) score += 60
    if ((template.stage === "strategy" || template.stage === "content") && /(audience|positioning|offer|lesson|curriculum|launch)/i.test(text)) score += 20
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
