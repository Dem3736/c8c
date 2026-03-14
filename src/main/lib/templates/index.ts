import YAML from "yaml"
import type { Workflow, WorkflowTemplate, WorkflowTemplateCategory } from "@shared/types"

import deepResearchRaw from "./deep-research.yaml?raw"
import landingAuditLoopRaw from "./landing-audit-loop.yaml?raw"
import segmentResearchGateRaw from "./segment-research-gate.yaml?raw"
import contentPipelineRaw from "./content-pipeline.yaml?raw"
import leadResearchMachineRaw from "./lead-research-machine.yaml?raw"
import contentRepurposingFactoryRaw from "./content-repurposing-factory.yaml?raw"
import predictableTextFactoryRaw from "./predictable-text-factory.yaml?raw"
import coldOutreachPipelineRaw from "./cold-outreach-pipeline.yaml?raw"
import competitorAdIntelligenceRaw from "./competitor-ad-intelligence.yaml?raw"
import meetingActionsPlanRaw from "./meeting-actions-plan.yaml?raw"
import invoiceChaosFixerRaw from "./invoice-chaos-fixer.yaml?raw"
import designCodeTestRaw from "./design-code-test.yaml?raw"
import twitterGrowthMachineRaw from "./twitter-growth-machine.yaml?raw"
import resumeTailoringPipelineRaw from "./resume-tailoring-pipeline.yaml?raw"
import fullStackCodeAuditRaw from "./full-stack-code-audit.yaml?raw"
import landingPageGeneratorRaw from "./landing-page-generator.yaml?raw"
import ctoProductSpecRaw from "./cto-product-spec.yaml?raw"
import impeccableUIPipelineRaw from "./impeccable-ui-pipeline.yaml?raw"

interface FlatTemplate {
  id: string
  category: WorkflowTemplateCategory
  tags: string[]
  version: number
  name: string
  description?: string
  defaults?: Workflow["defaults"]
  nodes: Workflow["nodes"]
  edges: Workflow["edges"]
}

export function parseTemplate(raw: string): WorkflowTemplate {
  const { id, category, tags, ...workflow } = YAML.parse(raw) as FlatTemplate
  return {
    id,
    name: workflow.name,
    description: workflow.description ?? "",
    category,
    tags,
    workflow,
  }
}

const builtinTemplates: WorkflowTemplate[] = [
  parseTemplate(deepResearchRaw),
  parseTemplate(landingAuditLoopRaw),
  parseTemplate(segmentResearchGateRaw),
  parseTemplate(contentPipelineRaw),
  parseTemplate(leadResearchMachineRaw),
  parseTemplate(contentRepurposingFactoryRaw),
  parseTemplate(predictableTextFactoryRaw),
  parseTemplate(coldOutreachPipelineRaw),
  parseTemplate(competitorAdIntelligenceRaw),
  parseTemplate(meetingActionsPlanRaw),
  parseTemplate(invoiceChaosFixerRaw),
  parseTemplate(designCodeTestRaw),
  parseTemplate(twitterGrowthMachineRaw),
  parseTemplate(resumeTailoringPipelineRaw),
  parseTemplate(fullStackCodeAuditRaw),
  parseTemplate(landingPageGeneratorRaw),
  parseTemplate(ctoProductSpecRaw),
  parseTemplate(impeccableUIPipelineRaw),
]

export function getBuiltinTemplates(): WorkflowTemplate[] {
  return builtinTemplates
}
