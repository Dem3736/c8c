import type { WorkflowTemplate, WorkflowTemplateStage } from "@shared/types"

export type TemplateCategoryKey = "all" | "product" | "marketing" | "content"
export type TemplateLibraryFilterKey = "all" | WorkflowTemplateStage

const PRODUCT_PACK_IDS = new Set([
  "delivery-foundation",
  "gstack-team",
])

const PRODUCT_TEMPLATE_IDS = new Set([
  "full-stack-code-audit",
  "cto-product-spec",
  "cto-optimise-audit",
  "ux-ui-polish-audit",
  "playwright-visual-audit",
  "design-code-test",
  "deep-research",
  "impeccable-ui-pipeline",
  "remotion-video-director-pipeline",
])

const MARKETING_PACK_IDS = new Set([
  "ai-cmo",
  "content-factory-alpha",
])

const MARKETING_TEMPLATE_IDS = new Set([
  "competitor-ad-intelligence",
  "content-pipeline",
  "copy-quality-pipeline",
  "cold-outreach-pipeline",
  "lead-research-machine",
  "seed-account-map-pipeline",
  "vertical-pain-to-target-list",
  "raw-list-to-verified-contacts",
  "segmented-outreach-launchpad",
  "new-vertical-to-live-campaign",
  "landing-page-generator",
  "landing-audit-loop",
  "segment-research-gate",
  "indispensable-jtbd-pipeline",
  "irresistible-resonance-pipeline",
  "ux-ui-polish-audit",
  "playwright-visual-audit",
])

const CONTENT_PACK_IDS = new Set([
  "content-factory-alpha",
  "courses-factory-alpha",
])

const CONTENT_TEMPLATE_IDS = new Set([
  "content-pipeline",
  "content-repurposing-factory",
  "copy-quality-pipeline",
  "landing-page-generator",
  "landing-audit-loop",
  "predictable-text-factory",
  "courses-audience-offer",
  "courses-curriculum-map",
  "courses-lesson-system",
  "courses-trigger-playbook",
  "courses-launch-assets",
])

const PRODUCT_TEXT_RE = /\b(codebase|repository|repo|feature|implementation|verification|spec|audit|bug|architecture|frontend|ui|ux|design system|component|qa|quality assurance|test|playwright|ship|engineering|release|roadmap)\b/i
const MARKETING_TEXT_RE = /\b(marketing|growth|seo|geo|reddit|hacker news|hacker-news|twitter|x posting|landing page|positioning|messaging|outreach|campaign|cold email|lead|prospect|editorial|distribution|go-to-market|gtm|show hn|ask hn|social media|trend|segment|audience|jtbd|competitive|ad intelligence)\b/i
const CONTENT_TEXT_RE = /\b(content|post|copy|text|editorial|newsletter|draft|publish|writing|course|curriculum|lesson|module|education|workshop|cohort|training|launch asset|video|script)\b/i

const PRODUCT_SKILL_RE = /^(dev|frontend|design|qa|gstack)\//i
const PRODUCT_SKILL_HINT_RE = /(code-review|frontend|playwright|ui|ux|design-review|ship)/i
const MARKETING_SKILL_RE = /^(gtm|marketing)\//i
const MARKETING_SKILL_HINT_RE = /(twitter|lead-research|competitive-ads|landing-copywriter|landing-architect|segment-researcher|indispensable)/i
const CONTENT_SKILL_RE = /^(content|course|courses|writer|copy|editorial)\//i
const CONTENT_SKILL_HINT_RE = /(copy|editorial|writer|curriculum|lesson|course|video|newsletter|content)/i

function compactText(values: Array<string | undefined | null>): string {
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .join(" ")
}

function getTemplateSkillRefs(template: WorkflowTemplate): string[] {
  return template.workflow.nodes
    .filter((node) => node.type === "skill")
    .map((node) => ("skillRef" in node.config && typeof node.config.skillRef === "string" ? node.config.skillRef : ""))
    .filter(Boolean)
}

function getTemplateMetadataText(template: WorkflowTemplate): string {
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
    template.credits?.map((credit) => compactText([credit.label, credit.note, credit.href])).join(" "),
  ])
}

export function isMarketingTemplate(template: WorkflowTemplate): boolean {
  if (template.pack?.id && MARKETING_PACK_IDS.has(template.pack.id)) return true
  if (MARKETING_TEMPLATE_IDS.has(template.id)) return true

  const metadataText = getTemplateMetadataText(template)
  if (MARKETING_TEXT_RE.test(metadataText)) return true

  const skillRefs = getTemplateSkillRefs(template)
  return skillRefs.some((skillRef) => MARKETING_SKILL_RE.test(skillRef) || MARKETING_SKILL_HINT_RE.test(skillRef))
}

export function isProductTemplate(template: WorkflowTemplate): boolean {
  if (template.pack?.id && PRODUCT_PACK_IDS.has(template.pack.id)) return true
  if (PRODUCT_TEMPLATE_IDS.has(template.id)) return true
  if (template.stage === "code") return true

  const metadataText = getTemplateMetadataText(template)
  if (PRODUCT_TEXT_RE.test(metadataText)) return true

  const skillRefs = getTemplateSkillRefs(template)
  return skillRefs.some((skillRef) => PRODUCT_SKILL_RE.test(skillRef) || PRODUCT_SKILL_HINT_RE.test(skillRef))
}

export function isContentTemplate(template: WorkflowTemplate): boolean {
  if (template.pack?.id && CONTENT_PACK_IDS.has(template.pack.id)) return true
  if (CONTENT_TEMPLATE_IDS.has(template.id)) return true
  if (template.stage === "content") return true

  const metadataText = getTemplateMetadataText(template)
  if (CONTENT_TEXT_RE.test(metadataText)) return true

  const skillRefs = getTemplateSkillRefs(template)
  return skillRefs.some((skillRef) => CONTENT_SKILL_RE.test(skillRef) || CONTENT_SKILL_HINT_RE.test(skillRef))
}

export function templateMatchesCategory(template: WorkflowTemplate, category: TemplateCategoryKey): boolean {
  if (category === "all") return true
  if (category === "product") return isProductTemplate(template)
  if (category === "marketing") return isMarketingTemplate(template)
  return isContentTemplate(template)
}

export function buildTemplateSearchText(template: WorkflowTemplate, sourceLabel?: string): string {
  const aliases = compactText([
    isProductTemplate(template) ? "product development design engineering ux ui frontend qa audit research" : "",
    isMarketingTemplate(template) ? "marketing growth go-to-market gtm seo geo social distribution editorial outreach trends segments positioning" : "",
    isContentTemplate(template) ? "content copy writing publishing course curriculum lessons text editorial" : "",
  ])

  return compactText([
    getTemplateMetadataText(template),
    template.stage,
    sourceLabel,
    template.marketplaceName,
    template.contractIn?.map((contract) => compactText([contract.kind, contract.title])).join(" "),
    template.contractOut?.map((contract) => compactText([contract.kind, contract.title])).join(" "),
    aliases,
  ]).toLowerCase()
}

export function templateMatchesLibraryFilter(template: WorkflowTemplate, filter: TemplateLibraryFilterKey): boolean {
  if (filter === "all") return true
  return template.stage === filter
}
