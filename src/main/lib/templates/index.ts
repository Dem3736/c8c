import type { WorkflowTemplate } from "@shared/types"
import { listPluginTemplates } from "./plugin-templates"
import { parseTemplate } from "./parse"

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
import playwrightVisualAuditRaw from "./playwright-visual-audit.yaml?raw"
import twitterGrowthMachineRaw from "./twitter-growth-machine.yaml?raw"
import resumeTailoringPipelineRaw from "./resume-tailoring-pipeline.yaml?raw"
import fullStackCodeAuditRaw from "./full-stack-code-audit.yaml?raw"
import landingPageGeneratorRaw from "./landing-page-generator.yaml?raw"
import ctoProductSpecRaw from "./cto-product-spec.yaml?raw"
import impeccableUIPipelineRaw from "./impeccable-ui-pipeline.yaml?raw"
import uxUiPolishAuditRaw from "./ux-ui-polish-audit.yaml?raw"
import ctoOptimiseAuditRaw from "./cto-optimise-audit.yaml?raw"
import indispensableJtbdPipelineRaw from "./indispensable-jtbd-pipeline.yaml?raw"
import irresistibleResonancePipelineRaw from "./irresistible-resonance-pipeline.yaml?raw"
import remotionVideoDirectorPipelineRaw from "./remotion-video-director-pipeline.yaml?raw"

const builtinTemplates: WorkflowTemplate[] = [
  parseTemplate(deepResearchRaw, { source: "builtin" }),
  parseTemplate(landingAuditLoopRaw, { source: "builtin" }),
  parseTemplate(segmentResearchGateRaw, { source: "builtin" }),
  parseTemplate(contentPipelineRaw, { source: "builtin" }),
  parseTemplate(leadResearchMachineRaw, { source: "builtin" }),
  parseTemplate(contentRepurposingFactoryRaw, { source: "builtin" }),
  parseTemplate(predictableTextFactoryRaw, { source: "builtin" }),
  parseTemplate(coldOutreachPipelineRaw, { source: "builtin" }),
  parseTemplate(competitorAdIntelligenceRaw, { source: "builtin" }),
  parseTemplate(meetingActionsPlanRaw, { source: "builtin" }),
  parseTemplate(invoiceChaosFixerRaw, { source: "builtin" }),
  parseTemplate(designCodeTestRaw, { source: "builtin" }),
  parseTemplate(playwrightVisualAuditRaw, { source: "builtin" }),
  parseTemplate(twitterGrowthMachineRaw, { source: "builtin" }),
  parseTemplate(resumeTailoringPipelineRaw, { source: "builtin" }),
  parseTemplate(fullStackCodeAuditRaw, { source: "builtin" }),
  parseTemplate(landingPageGeneratorRaw, { source: "builtin" }),
  parseTemplate(ctoProductSpecRaw, { source: "builtin" }),
  parseTemplate(impeccableUIPipelineRaw, { source: "builtin" }),
  parseTemplate(uxUiPolishAuditRaw, { source: "builtin" }),
  parseTemplate(ctoOptimiseAuditRaw, { source: "builtin" }),
  parseTemplate(indispensableJtbdPipelineRaw, { source: "builtin" }),
  parseTemplate(irresistibleResonancePipelineRaw, { source: "builtin" }),
  parseTemplate(remotionVideoDirectorPipelineRaw, { source: "builtin" }),
]

export function getBuiltinTemplates(): WorkflowTemplate[] {
  return builtinTemplates
}

export async function listTemplates(): Promise<WorkflowTemplate[]> {
  const pluginTemplates = await listPluginTemplates()
  return [...builtinTemplates, ...pluginTemplates]
}
