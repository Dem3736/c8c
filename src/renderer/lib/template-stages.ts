import type { WorkflowTemplateStage } from "@shared/types"

export const STAGE_ORDER: WorkflowTemplateStage[] = [
  "research",
  "strategy",
  "content",
  "code",
  "outreach",
  "operations",
]

export const STAGE_META: Record<WorkflowTemplateStage, { label: string; description: string }> = {
  research: { label: "Research & Discovery", description: "Understand your market, users, and competition before building." },
  strategy: { label: "Strategy", description: "Define positioning, jobs-to-be-done, and product specs." },
  content: { label: "Content", description: "Create, repurpose, and quality-check written content at scale." },
  code: { label: "Code", description: "Design, build, audit, and test software components." },
  outreach: { label: "Outreach", description: "Generate leads, craft outreach, and grow your audience." },
  operations: { label: "Operations", description: "Automate meetings, invoices, and day-to-day busywork." },
}
