import { useMemo } from "react"
import { resolveWorkflowInput } from "@/lib/input-type"
import {
  areTemplateContractsSatisfied,
  buildContinuationArtifactPool,
  deriveTemplateContextJourneyStageLabel,
  formatArtifactContractLabel,
  selectArtifactsForTemplateContracts,
  type WorkflowEntryState,
  type WorkflowTemplateRunContext,
} from "@/lib/workflow-entry"
import { deriveExecutionPolicyFlowRules } from "@/lib/flow-rules"
import { buildProcessSpine, selectProcessSpineFactory } from "@/lib/process-spine"
import { contextRequiresStartApproval } from "@/lib/stage-run-policy"
import type { ArtifactRecord, InputAttachment, ProjectFactoryBlueprint, Workflow, WorkflowTemplate } from "@shared/types"
import {
  deriveEntryNextStepLabel,
  formatInputAttachmentLabel,
  takeLeadingSentence,
} from "./WorkflowPanelInlineSections"

interface UseWorkflowPanelEntryStateParams {
  workflow: Workflow
  selectedWorkflowPath: string | null
  workflowEntryState: WorkflowEntryState | null
  inputValue: string
  inputAttachments: InputAttachment[]
  artifactRecords: ArtifactRecord[]
  projectArtifacts: ArtifactRecord[]
  selectedWorkflowTemplateContext: WorkflowTemplateRunContext | null
  packTemplates: WorkflowTemplate[]
  factoryBlueprint: ProjectFactoryBlueprint | null
  runStatus: string
  runOutcome: string | null
  viewMode: "list" | "canvas" | "settings"
  pendingCreateMessage: Record<string, string>
  chatStatus: string
  workflowPastRunsCount: number
  prepareNewRun: boolean
  projectArtifactsLoading: boolean
  projectArtifactsError: string | null
  selectedProject: string | null
}

export function useWorkflowPanelEntryState({
  workflow,
  selectedWorkflowPath,
  workflowEntryState,
  inputValue,
  inputAttachments,
  artifactRecords,
  projectArtifacts,
  selectedWorkflowTemplateContext,
  packTemplates,
  factoryBlueprint,
  runStatus,
  runOutcome,
  viewMode,
  pendingCreateMessage,
  chatStatus,
  workflowPastRunsCount,
  prepareNewRun,
  projectArtifactsLoading,
  projectArtifactsError,
  selectedProject,
}: UseWorkflowPanelEntryStateParams) {
  const activeEntryState = useMemo(() => {
    if (!workflowEntryState) return null
    if (workflowEntryState.workflowPath) {
      return workflowEntryState.workflowPath === selectedWorkflowPath
        ? workflowEntryState
        : null
    }
    return workflowEntryState.workflowName === workflow.name
      ? workflowEntryState
      : null
  }, [selectedWorkflowPath, workflow.name, workflowEntryState])

  const inputNode = workflow.nodes.find((node) => node.type === "input")
  const inputValidation = resolveWorkflowInput(inputValue, {
    inputType: inputNode?.type === "input" ? inputNode.config.inputType : undefined,
    required: inputNode?.type === "input" ? inputNode.config.required : undefined,
    defaultValue: inputNode?.type === "input" ? inputNode.config.defaultValue : undefined,
  })
  const readyToRun = inputValidation.valid && workflow.nodes.some((node) => node.type === "skill")

  const combinedArtifactRecords = useMemo(() => {
    const byId = new Map<string, ArtifactRecord>()
    for (const artifact of projectArtifacts) {
      byId.set(artifact.id, artifact)
    }
    for (const artifact of artifactRecords) {
      byId.set(artifact.id, artifact)
    }
    return Array.from(byId.values()).sort((left, right) => right.updatedAt - left.updatedAt)
  }, [artifactRecords, projectArtifacts])

  const continuationArtifactRecords = useMemo(
    () => buildContinuationArtifactPool({
      currentArtifacts: artifactRecords,
      projectArtifacts,
      context: selectedWorkflowTemplateContext,
    }),
    [artifactRecords, projectArtifacts, selectedWorkflowTemplateContext],
  )

  const nextStageSelection = useMemo(() => {
    const recommendedNext = selectedWorkflowTemplateContext?.pack?.recommendedNext || []
    if (recommendedNext.length === 0 || packTemplates.length === 0) {
      return { template: null, artifacts: [] as ArtifactRecord[] }
    }

    const orderedCandidates = recommendedNext
      .map((templateId) => packTemplates.find((template) => template.id === templateId) || null)
      .filter((template): template is WorkflowTemplate => template !== null)

    const preferredTemplate = orderedCandidates.find((template) =>
      areTemplateContractsSatisfied(template.contractIn, continuationArtifactRecords),
    ) || null
    if (preferredTemplate) {
      return {
        template: preferredTemplate,
        artifacts: selectArtifactsForTemplateContracts(preferredTemplate.contractIn, continuationArtifactRecords),
      }
    }

    return { template: null, artifacts: [] as ArtifactRecord[] }
  }, [continuationArtifactRecords, packTemplates, selectedWorkflowTemplateContext])

  const nextStageTemplate = nextStageSelection.template
  const nextStageArtifacts = nextStageSelection.artifacts
  const entryStageLabel = useMemo(
    () => deriveTemplateContextJourneyStageLabel(selectedWorkflowTemplateContext),
    [selectedWorkflowTemplateContext],
  )
  const entryFlowRules = useMemo(
    () => deriveExecutionPolicyFlowRules(selectedWorkflowTemplateContext?.executionPolicy, {
      defaultScope: entryStageLabel || "Run",
    }),
    [entryStageLabel, selectedWorkflowTemplateContext],
  )
  const startApprovalRequired = useMemo(
    () => runStatus === "idle" && contextRequiresStartApproval(selectedWorkflowTemplateContext),
    [runStatus, selectedWorkflowTemplateContext],
  )
  const entryNextStepLabel = useMemo(
    () => deriveEntryNextStepLabel({ readyToRun, nextStageTemplate }),
    [nextStageTemplate, readyToRun],
  )
  const stageStartInputLabels = useMemo(() => {
    if (inputAttachments.length > 0) {
      return inputAttachments.map(formatInputAttachmentLabel)
    }
    return (selectedWorkflowTemplateContext?.contractIn || []).map((contract) => formatArtifactContractLabel(contract))
  }, [inputAttachments, selectedWorkflowTemplateContext])
  const stageStartPolicyNotes = useMemo(
    () => (selectedWorkflowTemplateContext?.executionPolicy?.notes || [])
      .map((note) => note.trim())
      .filter((note) => note.length > 0 && !note.startsWith("\"Target operator:"))
      .slice(0, 3),
    [selectedWorkflowTemplateContext],
  )
  const stageStartFlowName = workflow.name
    || selectedWorkflowTemplateContext?.workflowName
    || selectedWorkflowTemplateContext?.templateName
    || activeEntryState?.workflowName
    || "Untitled flow"
  const stageStartDescription = takeLeadingSentence(
    activeEntryState?.summary || selectedWorkflowTemplateContext?.inputText,
    "Run this step with the current input.",
  )
  const workflowHasGeneratedSteps = workflow.nodes.some(
    (node) => node.type !== "input" && node.type !== "output",
  )
  const showCreateDraftSkeleton = (
    viewMode === "list"
    && selectedWorkflowPath != null
    && (
      Boolean(selectedWorkflowPath && pendingCreateMessage[selectedWorkflowPath])
      || (
        (chatStatus === "thinking" || chatStatus === "streaming")
        && !workflowHasGeneratedSteps
      )
    )
  )
  const showEntryLanding = (
    viewMode === "list"
    && runStatus === "idle"
    && activeEntryState !== null
    && !showCreateDraftSkeleton
  )
  const showIdleReviewMode = (
    runStatus === "idle"
    && activeEntryState === null
    && !showCreateDraftSkeleton
    && workflowPastRunsCount > 0
    && !prepareNewRun
  )
  const processSpineFactory = useMemo(
    () => selectProcessSpineFactory(factoryBlueprint, selectedWorkflowTemplateContext),
    [factoryBlueprint, selectedWorkflowTemplateContext],
  )
  const processSpineStages = useMemo(
    () => buildProcessSpine({
      context: selectedWorkflowTemplateContext,
      nextTemplate: nextStageTemplate,
      templates: packTemplates,
      factory: processSpineFactory,
      runStatus,
      runOutcome,
      reviewingPastRun: showIdleReviewMode,
    }),
    [
      nextStageTemplate,
      packTemplates,
      processSpineFactory,
      runOutcome,
      runStatus,
      selectedWorkflowTemplateContext,
      showIdleReviewMode,
    ],
  )
  const showIdleInputPanel = (
    viewMode === "list"
    && runStatus === "idle"
    && Boolean(inputNode)
    && !showCreateDraftSkeleton
    && !showEntryLanding
    && !showIdleReviewMode
  )
  const showProjectArtifactsPanel = (
    Boolean(selectedProject)
    && (
      projectArtifactsLoading
      || Boolean(projectArtifactsError)
      || combinedArtifactRecords.length > 0
      || (selectedWorkflowTemplateContext?.contractIn?.length ?? 0) > 0
    )
  )

  return {
    activeEntryState,
    readyToRun,
    combinedArtifactRecords,
    nextStageTemplate,
    nextStageArtifacts,
    entryStageLabel,
    entryFlowRules,
    startApprovalRequired,
    entryNextStepLabel,
    stageStartInputLabels,
    stageStartPolicyNotes,
    stageStartFlowName,
    stageStartDescription,
    showCreateDraftSkeleton,
    showEntryLanding,
    showIdleReviewMode,
    processSpineStages,
    showIdleInputPanel,
    showProjectArtifactsPanel,
  }
}
