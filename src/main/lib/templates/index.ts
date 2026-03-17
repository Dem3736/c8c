import type { WorkflowTemplate } from "@shared/types"
import { listPluginTemplates } from "./plugin-templates"
import { parseTemplate } from "./parse"

import deliveryMapCodebaseRaw from "./delivery-map-codebase.yaml?raw"
import deliveryShapeProjectRaw from "./delivery-shape-project.yaml?raw"
import deliveryResearchPhaseRaw from "./delivery-research-phase.yaml?raw"
import deliveryPlanPhaseRaw from "./delivery-plan-phase.yaml?raw"
import deliveryVerifyPhaseRaw from "./delivery-verify-phase.yaml?raw"
import contentTrendWatchRaw from "./content-trend-watch.yaml?raw"
import contentPostCalendarRaw from "./content-post-calendar.yaml?raw"
import contentIdeaBacklogRaw from "./content-idea-backlog.yaml?raw"
import contentEditorialCalendarRaw from "./content-editorial-calendar.yaml?raw"
import contentDraftPostRaw from "./content-draft-post.yaml?raw"
import contentQaReviewRaw from "./content-qa-review.yaml?raw"
import contentDistributionBundleRaw from "./content-distribution-bundle.yaml?raw"
import contentReadyPostsRaw from "./content-ready-posts.yaml?raw"
import coursesAudienceOfferRaw from "./courses-audience-offer.yaml?raw"
import coursesCurriculumMapRaw from "./courses-curriculum-map.yaml?raw"
import coursesLessonSystemRaw from "./courses-lesson-system.yaml?raw"
import coursesLaunchAssetsRaw from "./courses-launch-assets.yaml?raw"
import deepResearchRaw from "./deep-research.yaml?raw"
import landingAuditLoopRaw from "./landing-audit-loop.yaml?raw"
import segmentResearchGateRaw from "./segment-research-gate.yaml?raw"
import contentPipelineRaw from "./content-pipeline.yaml?raw"
import leadResearchMachineRaw from "./lead-research-machine.yaml?raw"
import seedAccountMapPipelineRaw from "./seed-account-map-pipeline.yaml?raw"
import verticalPainToTargetListRaw from "./vertical-pain-to-target-list.yaml?raw"
import contentRepurposingFactoryRaw from "./content-repurposing-factory.yaml?raw"
import aiCmoGrowthThesisRaw from "./ai-cmo-growth-thesis.yaml?raw"
import aiCmoSeoEngineRaw from "./ai-cmo-seo-engine.yaml?raw"
import aiCmoGeoEngineRaw from "./ai-cmo-geo-engine.yaml?raw"
import aiCmoXEngineRaw from "./ai-cmo-x-engine.yaml?raw"
import aiCmoRedditEngineRaw from "./ai-cmo-reddit-engine.yaml?raw"
import aiCmoHackerNewsEngineRaw from "./ai-cmo-hacker-news-engine.yaml?raw"
import predictableTextFactoryRaw from "./predictable-text-factory.yaml?raw"
import coldOutreachPipelineRaw from "./cold-outreach-pipeline.yaml?raw"
import rawListToVerifiedContactsRaw from "./raw-list-to-verified-contacts.yaml?raw"
import segmentedOutreachLaunchpadRaw from "./segmented-outreach-launchpad.yaml?raw"
import newVerticalToLiveCampaignRaw from "./new-vertical-to-live-campaign.yaml?raw"
import competitorAdIntelligenceRaw from "./competitor-ad-intelligence.yaml?raw"
import meetingActionsPlanRaw from "./meeting-actions-plan.yaml?raw"
import invoiceChaosFixerRaw from "./invoice-chaos-fixer.yaml?raw"
import designCodeTestRaw from "./design-code-test.yaml?raw"
import playwrightVisualAuditRaw from "./playwright-visual-audit.yaml?raw"
import twitterGrowthMachineRaw from "./twitter-growth-machine.yaml?raw"
import applicationTailoringPipelineRaw from "./application-tailoring-pipeline.yaml?raw"
import fullStackCodeAuditRaw from "./full-stack-code-audit.yaml?raw"
import landingPageGeneratorRaw from "./landing-page-generator.yaml?raw"
import ctoProductSpecRaw from "./cto-product-spec.yaml?raw"
import impeccableUIPipelineRaw from "./impeccable-ui-pipeline.yaml?raw"
import uxUiPolishAuditRaw from "./ux-ui-polish-audit.yaml?raw"
import ctoOptimiseAuditRaw from "./cto-optimise-audit.yaml?raw"
import indispensableJtbdPipelineRaw from "./indispensable-jtbd-pipeline.yaml?raw"
import irresistibleResonancePipelineRaw from "./irresistible-resonance-pipeline.yaml?raw"
import remotionVideoDirectorPipelineRaw from "./remotion-video-director-pipeline.yaml?raw"
import copyQualityPipelineRaw from "./copy-quality-pipeline.yaml?raw"
import gstackFeatureSquadRaw from "./gstack-feature-squad.yaml?raw"
import gstackWebQualityBoardRaw from "./gstack-web-quality-board.yaml?raw"
import gstackPreflightGateRaw from "./gstack-preflight-gate.yaml?raw"
import gstackReleaseRoomRaw from "./gstack-release-room.yaml?raw"

const builtinTemplates: WorkflowTemplate[] = [
  parseTemplate(deliveryMapCodebaseRaw, { source: "builtin" }),
  parseTemplate(deliveryShapeProjectRaw, { source: "builtin" }),
  parseTemplate(deliveryResearchPhaseRaw, { source: "builtin" }),
  parseTemplate(deliveryPlanPhaseRaw, { source: "builtin" }),
  parseTemplate(deliveryVerifyPhaseRaw, { source: "builtin" }),
  parseTemplate(contentTrendWatchRaw, { source: "builtin" }),
  parseTemplate(contentPostCalendarRaw, { source: "builtin" }),
  parseTemplate(contentIdeaBacklogRaw, { source: "builtin" }),
  parseTemplate(contentEditorialCalendarRaw, { source: "builtin" }),
  parseTemplate(contentDraftPostRaw, { source: "builtin" }),
  parseTemplate(contentQaReviewRaw, { source: "builtin" }),
  parseTemplate(contentDistributionBundleRaw, { source: "builtin" }),
  parseTemplate(contentReadyPostsRaw, { source: "builtin" }),
  parseTemplate(coursesAudienceOfferRaw, { source: "builtin" }),
  parseTemplate(coursesCurriculumMapRaw, { source: "builtin" }),
  parseTemplate(coursesLessonSystemRaw, { source: "builtin" }),
  parseTemplate(coursesLaunchAssetsRaw, { source: "builtin" }),
  parseTemplate(deepResearchRaw, { source: "builtin" }),
  parseTemplate(landingAuditLoopRaw, { source: "builtin" }),
  parseTemplate(segmentResearchGateRaw, { source: "builtin" }),
  parseTemplate(contentPipelineRaw, { source: "builtin" }),
  parseTemplate(leadResearchMachineRaw, { source: "builtin" }),
  parseTemplate(seedAccountMapPipelineRaw, { source: "builtin" }),
  parseTemplate(verticalPainToTargetListRaw, { source: "builtin" }),
  parseTemplate(contentRepurposingFactoryRaw, { source: "builtin" }),
  parseTemplate(aiCmoGrowthThesisRaw, { source: "builtin" }),
  parseTemplate(aiCmoSeoEngineRaw, { source: "builtin" }),
  parseTemplate(aiCmoGeoEngineRaw, { source: "builtin" }),
  parseTemplate(aiCmoXEngineRaw, { source: "builtin" }),
  parseTemplate(aiCmoRedditEngineRaw, { source: "builtin" }),
  parseTemplate(aiCmoHackerNewsEngineRaw, { source: "builtin" }),
  parseTemplate(predictableTextFactoryRaw, { source: "builtin" }),
  parseTemplate(coldOutreachPipelineRaw, { source: "builtin" }),
  parseTemplate(rawListToVerifiedContactsRaw, { source: "builtin" }),
  parseTemplate(segmentedOutreachLaunchpadRaw, { source: "builtin" }),
  parseTemplate(newVerticalToLiveCampaignRaw, { source: "builtin" }),
  parseTemplate(competitorAdIntelligenceRaw, { source: "builtin" }),
  parseTemplate(meetingActionsPlanRaw, { source: "builtin" }),
  parseTemplate(invoiceChaosFixerRaw, { source: "builtin" }),
  parseTemplate(designCodeTestRaw, { source: "builtin" }),
  parseTemplate(playwrightVisualAuditRaw, { source: "builtin" }),
  parseTemplate(twitterGrowthMachineRaw, { source: "builtin" }),
  parseTemplate(applicationTailoringPipelineRaw, { source: "builtin" }),
  parseTemplate(fullStackCodeAuditRaw, { source: "builtin" }),
  parseTemplate(landingPageGeneratorRaw, { source: "builtin" }),
  parseTemplate(ctoProductSpecRaw, { source: "builtin" }),
  parseTemplate(impeccableUIPipelineRaw, { source: "builtin" }),
  parseTemplate(uxUiPolishAuditRaw, { source: "builtin" }),
  parseTemplate(ctoOptimiseAuditRaw, { source: "builtin" }),
  parseTemplate(indispensableJtbdPipelineRaw, { source: "builtin" }),
  parseTemplate(irresistibleResonancePipelineRaw, { source: "builtin" }),
  parseTemplate(remotionVideoDirectorPipelineRaw, { source: "builtin" }),
  parseTemplate(copyQualityPipelineRaw, { source: "builtin" }),
  parseTemplate(gstackFeatureSquadRaw, { source: "builtin" }),
  parseTemplate(gstackWebQualityBoardRaw, { source: "builtin" }),
  parseTemplate(gstackPreflightGateRaw, { source: "builtin" }),
  parseTemplate(gstackReleaseRoomRaw, { source: "builtin" }),
]

export function getBuiltinTemplates(): WorkflowTemplate[] {
  return builtinTemplates
}

export async function listTemplates(): Promise<WorkflowTemplate[]> {
  const pluginTemplates = await listPluginTemplates()
  return [...builtinTemplates, ...pluginTemplates]
}
