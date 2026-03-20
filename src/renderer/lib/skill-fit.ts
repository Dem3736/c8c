import type { DiscoveredSkill } from "@shared/types"
import { getSkillSourceKind, getSkillSourceLabel } from "@/lib/skill-source"

export interface SkillStageFit {
  score: number
  label: string
  reason: string
}

function compactText(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

function normalizeStageKey(stageLabel: string | null | undefined) {
  const text = (stageLabel || "").trim().toLowerCase()
  if (!text) return "general"
  if (text.includes("shape") || text.includes("map")) return "shape"
  if (text.includes("plan")) return "plan"
  if (text.includes("implement") || text.includes("build") || text.includes("code")) return "implement"
  if (text.includes("review")) return "review"
  if (text.includes("verify") || text.includes("ship") || text.includes("release")) return "verify"
  return "general"
}

const STAGE_MATCHERS: Record<string, RegExp[]> = {
  shape: [
    /\b(map|shape|scope|spec|brief|research|architecture|repo|codebase|discovery)\b/i,
    /\b(product|strategy|ux|ui|design)\b/i,
  ],
  plan: [
    /\b(plan|planning|roadmap|tasks|phase|spec|breakdown|implementation plan)\b/i,
    /\b(strategy|architecture|scope)\b/i,
  ],
  implement: [
    /\b(implement|implementation|build|frontend|backend|code|refactor|fix|develop)\b/i,
    /\b(component|ui|ux|design system)\b/i,
  ],
  review: [
    /\b(review|audit|critique|qa|quality|polish|ux|ui|design review)\b/i,
    /\b(playwright|visual|copy quality|accessibility|test|design|design system|frontend)\b/i,
  ],
  verify: [
    /\b(verify|verification|preflight|release|ship|deploy|gate|validation)\b/i,
    /\b(playwright|qa|quality|test)\b/i,
  ],
  general: [],
}

function countPatternMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => (pattern.test(text) ? count + 1 : count), 0)
}

export function deriveSkillStageFit(skill: DiscoveredSkill, stageLabel?: string | null): SkillStageFit {
  const stageKey = normalizeStageKey(stageLabel)
  const stagePatterns = STAGE_MATCHERS[stageKey] || []
  const skillText = compactText([
    skill.name,
    skill.category,
    skill.description,
    skill.type,
    skill.pluginName,
    skill.library,
  ])

  const matchCount = countPatternMatches(skillText, stagePatterns)
  if (stageKey === "general" || !stageLabel) {
    return {
      score: 1,
      label: "Reusable",
      reason: "General skill for this flow.",
    }
  }

  if (matchCount >= 2) {
    return {
      score: 4,
      label: `Fits ${stageLabel}`,
      reason: "Name and description match this step.",
    }
  }

  if (matchCount === 1) {
    return {
      score: 3,
      label: `Works for ${stageLabel}`,
      reason: "Likely useful for the current step.",
    }
  }

  return {
    score: 1,
    label: "Reusable",
    reason: "Can be attached here if you need it.",
  }
}

export function deriveSkillProvenanceLabel(skill: DiscoveredSkill): string {
  const sourceKind = getSkillSourceKind(skill)
  const sourceLabel = getSkillSourceLabel(skill)
  if (sourceKind === "plugin") {
    return skill.pluginVersion ? `${sourceLabel} v${skill.pluginVersion}` : sourceLabel
  }
  return sourceLabel
}

export function deriveSkillSourceBadge(skill: DiscoveredSkill): string {
  const sourceKind = getSkillSourceKind(skill)
  if (sourceKind === "plugin") return "Plugin"
  if (sourceKind === "library") return "Library"
  if (sourceKind === "user") return "User"
  return "Project"
}

export function compareSkillsForStage(
  left: DiscoveredSkill,
  right: DiscoveredSkill,
  stageLabel?: string | null,
) {
  const leftFit = deriveSkillStageFit(left, stageLabel)
  const rightFit = deriveSkillStageFit(right, stageLabel)
  if (leftFit.score !== rightFit.score) return rightFit.score - leftFit.score

  const sourcePriority = (skill: DiscoveredSkill) => {
    const sourceKind = getSkillSourceKind(skill)
    if (sourceKind === "project") return 3
    if (sourceKind === "user") return 2
    if (sourceKind === "plugin") return 1
    return 0
  }

  const leftSource = sourcePriority(left)
  const rightSource = sourcePriority(right)
  if (leftSource !== rightSource) return rightSource - leftSource

  return left.name.localeCompare(right.name)
}
