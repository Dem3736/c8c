import type { RefObject } from "react"
import { ApprovalDialog } from "@/components/ApprovalDialog"
import { SkillPicker } from "@/components/SkillPicker"
import { WorkflowChatPanelShell } from "@/components/workflow-panel/WorkflowChatPanelShell"
import { StageStartApprovalDialog } from "@/components/workflow-panel/WorkflowPanelInlineSections"
import type { DiscoveredSkill } from "@shared/types"

export function WorkflowPanelOverlays({
  showEntryLanding,
  showEntryEditor,
  entryStageLabel,
  onAttachCapabilitySelection,
  stageStartGateOpen,
  stageStartFlowName,
  stageStartTitle,
  stageLabel,
  stageStartDescription,
  entryFlowRules,
  expectedArtifact,
  inputPreview,
  inputLabels,
  notes,
  shortcutLabel,
  primaryModifierKey,
  onApproveStageStart,
  onCancelStageStart,
  canShowAgentPanel,
  chatPanelShellRef,
  chatOpen,
  chatPanelWidth,
  onCloseChat,
}: {
  showEntryLanding: boolean
  showEntryEditor: boolean
  entryStageLabel: string | null
  onAttachCapabilitySelection: (skill: DiscoveredSkill) => void
  stageStartGateOpen: boolean
  stageStartFlowName: string | null
  stageStartTitle: string
  stageLabel: string | null
  stageStartDescription: string | null
  entryFlowRules: string[]
  expectedArtifact: string
  inputPreview: string
  inputLabels: string[]
  notes: string[]
  shortcutLabel: string
  primaryModifierKey: string
  onApproveStageStart: () => void | Promise<void>
  onCancelStageStart: () => void
  canShowAgentPanel: boolean
  chatPanelShellRef: RefObject<HTMLDivElement | null>
  chatOpen: boolean
  chatPanelWidth: number
  onCloseChat: () => void
}) {
  return (
    <>
      {showEntryLanding && !showEntryEditor && (
        <SkillPicker
          onAddSkill={onAttachCapabilitySelection}
          title="Attach skill"
          description="Choose a reusable skill to add to the current flow."
          searchPlaceholder="Search skills..."
          emptyStateMessage="No skills found. Enable a plugin pack, keep using local skills, or open a project with project-level skills."
          emptyResultsMessage={(query) => `No skills found for “${query}”`}
          stageLabel={entryStageLabel}
          attachTargetLabel="this flow"
        />
      )}
      <StageStartApprovalDialog
        open={stageStartGateOpen}
        flowName={stageStartFlowName}
        title={stageStartTitle}
        stageLabel={stageLabel}
        stepDescription={stageStartDescription}
        flowRules={entryFlowRules}
        expectedArtifact={expectedArtifact}
        inputPreview={inputPreview}
        inputLabels={inputLabels}
        notes={notes}
        shortcutLabel={shortcutLabel}
        approveConsequence="Runs this step with the current input."
        rejectConsequence="Keeps the flow in edit mode."
        primaryModifierKey={primaryModifierKey}
        onApprove={onApproveStageStart}
        onCancel={onCancelStageStart}
      />
      <ApprovalDialog />

      {canShowAgentPanel && (
        <WorkflowChatPanelShell
          shellRef={chatPanelShellRef}
          open={chatOpen}
          width={chatPanelWidth}
          onClose={onCloseChat}
        />
      )}
    </>
  )
}
