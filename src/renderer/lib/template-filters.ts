import type { WorkflowTemplate, WorkflowTemplateStage } from "@shared/types"

export type TemplateLibraryFilterKey = "all" | "marketing" | WorkflowTemplateStage

const MARKETING_PACK_IDS = new Set([
  "ai-cmo",
  "content-factory-alpha",
])

const MARKETING_TEMPLATE_IDS = new Set([
  "competitor-ad-intelligence",
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
])

const MARKETING_TEXT_RE = /\b(marketing|growth|seo|geo|reddit|hacker news|hacker-news|twitter|landing page|positioning|messaging|outreach|campaign|cold email|lead|prospect|editorial|distribution|go-to-market|gtm|show hn|ask hn|social media)\b/i
const MARKETING_SKILL_RE = /^(gtm|marketing)\//i
const MARKETING_SKILL_HINT_RE = /(twitter|lead-research|competitive-ads|landing-copywriter|landing-architect)/i

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

export function buildTemplateSearchText(template: WorkflowTemplate, sourceLabel?: string): string {
  const marketingAliases = isMarketingTemplate(template)
    ? "marketing growth go-to-market gtm seo geo social distribution editorial outreach"
    : ""

  return compactText([
    getTemplateMetadataText(template),
    template.stage,
    sourceLabel,
    template.marketplaceName,
    template.contractIn?.map((contract) => compactText([contract.kind, contract.title])).join(" "),
    template.contractOut?.map((contract) => compactText([contract.kind, contract.title])).join(" "),
    marketingAliases,
  ]).toLowerCase()
}

export function templateMatchesLibraryFilter(template: WorkflowTemplate, filter: TemplateLibraryFilterKey): boolean {
  if (filter === "all") return true
  if (filter === "marketing") return isMarketingTemplate(template)
  return template.stage === filter
}
