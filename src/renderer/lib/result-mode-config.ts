import type { ResultModeId } from "@shared/types"
import { buildWorkflowCreatePrompt, type WorkflowCreatePromptScaffold } from "@/lib/workflow-create-prompt"
import type { WorkflowResultMode } from "@/lib/result-modes"

export type ResultModeConfigFieldType = "text" | "textarea"

export interface ResultModeConfigField {
  id: string
  label: string
  placeholder: string
  type?: ResultModeConfigFieldType
  helpText?: string
}

export type ResultModeConfigValues = Record<string, string>

const RESULT_MODE_CONFIG_FIELDS: Record<string, ResultModeConfigField[]> = {
  development: [
    {
      id: "project_goal",
      label: "Project goal",
      placeholder: "Ship a v1 onboarding loop, fix a production issue, or prepare a major refactor.",
    },
    {
      id: "source_context",
      label: "Source context",
      placeholder: "Repository path, issue link, PRD, notes, or current product state.",
      type: "textarea",
    },
    {
      id: "quality_bar",
      label: "Quality bar",
      placeholder: "Testing expectations, verification bar, risk tolerance, or rollout constraints.",
      type: "textarea",
    },
    {
      id: "strategist_checkpoints",
      label: "Strategist checkpoints",
      placeholder: "Scope approval, architecture review, milestone sign-off, or other moments where you want control.",
      type: "textarea",
    },
  ],
  content: [
    {
      id: "content_goal",
      label: "Content goal",
      placeholder: "Generate 30 posts, shape a campaign, or produce a newsletter issue.",
    },
    {
      id: "channel_and_audience",
      label: "Channel and audience",
      placeholder: "Facebook for AI founders, LinkedIn for operators, or X for design engineers.",
      type: "textarea",
    },
    {
      id: "tone_of_voice",
      label: "Tone of voice",
      placeholder: "Direct, no-slop, info-style, founder voice, or brand voice constraints.",
      type: "textarea",
    },
    {
      id: "volume_and_quality",
      label: "Volume and quality bar",
      placeholder: "How much output you need and what would make it publishable.",
      type: "textarea",
    },
  ],
  courses: [
    {
      id: "course_outcome",
      label: "Course outcome",
      placeholder: "What transformation should the course or workshop create?",
    },
    {
      id: "audience",
      label: "Audience",
      placeholder: "Who is this for, what do they already know, and where are they stuck?",
      type: "textarea",
    },
    {
      id: "format_and_depth",
      label: "Format and depth",
      placeholder: "Course, workshop, cohort, async product, lesson length, and depth expectations.",
      type: "textarea",
    },
    {
      id: "launch_needs",
      label: "Launch needs",
      placeholder: "Landing page, offer framing, lesson samples, launch assets, or other go-to-market needs.",
      type: "textarea",
    },
  ],
}

const RESULT_MODE_CONFIG_LABELS: Record<string, string> = {
  project_goal: "Project goal",
  source_context: "Source context",
  quality_bar: "Quality bar",
  strategist_checkpoints: "Strategist checkpoints",
  content_goal: "Content goal",
  channel_and_audience: "Channel and audience",
  tone_of_voice: "Tone of voice",
  volume_and_quality: "Volume and quality bar",
  course_outcome: "Course outcome",
  audience: "Audience",
  format_and_depth: "Format and depth",
  launch_needs: "Launch needs",
}

function normalize(value: string | undefined | null) {
  return (value || "").trim()
}

export function getResultModeConfigFields(modeId: ResultModeId): ResultModeConfigField[] {
  return RESULT_MODE_CONFIG_FIELDS[modeId] || []
}

export function normalizeResultModeConfig(
  modeId: ResultModeId,
  values?: ResultModeConfigValues | null,
): ResultModeConfigValues {
  const next: ResultModeConfigValues = {}
  for (const field of getResultModeConfigFields(modeId)) {
    next[field.id] = normalize(values?.[field.id])
  }
  return next
}

export function countResultModeConfigFields(
  modeId: ResultModeId,
  values?: ResultModeConfigValues | null,
): number {
  const normalized = normalizeResultModeConfig(modeId, values)
  return Object.values(normalized).filter((value) => value.length > 0).length
}

export function buildResultModeConfigSections(
  modeId: ResultModeId,
  values?: ResultModeConfigValues | null,
): Array<{ label: string; value: string }> {
  const normalized = normalizeResultModeConfig(modeId, values)
  return Object.entries(normalized)
    .filter(([, value]) => value.length > 0)
    .map(([id, value]) => ({
      label: RESULT_MODE_CONFIG_LABELS[id] || id,
      value,
    }))
}

export function buildResultModeSeedInput(
  mode: WorkflowResultMode,
  values: ResultModeConfigValues,
  draftPrompt: string,
  scaffold: WorkflowCreatePromptScaffold,
): string {
  const sections = buildResultModeConfigSections(mode.id, values)
  const basePrompt = buildWorkflowCreatePrompt(draftPrompt, scaffold)

  if (sections.length === 0) {
    if (basePrompt.trim()) return basePrompt
    return [
      `Build a starter workflow for the ${mode.label} mode.`,
      `Focus: ${mode.useFor}`,
      `First useful result: ${mode.youGetFirst}`,
      `Human role: ${mode.userRole}`,
    ].join("\n")
  }

  const lines: string[] = [
    `${mode.label} brief:`,
    `Requested outcome type: ${mode.useFor}`,
    "",
  ]

  for (const section of sections) {
    lines.push(`${section.label}:`, section.value, "")
  }

  if (basePrompt.trim()) {
    lines.push("Additional request context:", basePrompt)
  }

  return lines.join("\n").trim()
}
