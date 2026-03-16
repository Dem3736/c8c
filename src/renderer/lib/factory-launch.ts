import type { ArtifactRecord, InputAttachment, WorkflowFile, WorkflowTemplate } from "@shared/types"
import type { WebSearchBackend } from "@/lib/web-search-backend"
import { resolveTemplateWorkflow } from "@/lib/web-search-backend"
import {
  buildArtifactAttachmentSeedInput,
  buildTemplateRunContext,
  buildTemplateWorkflowEntryState,
} from "@/lib/workflow-entry"
import { workflowSnapshot } from "@/lib/workflow-snapshot"

export async function prepareTemplateStageLaunch({
  projectPath,
  template,
  webSearchBackend,
  artifacts,
}: {
  projectPath: string
  template: WorkflowTemplate
  webSearchBackend: WebSearchBackend
  artifacts: ArtifactRecord[]
}): Promise<{
  filePath: string
  loadedWorkflow: WorkflowTemplate["workflow"]
  refreshedWorkflows: WorkflowFile[]
  artifactAttachments: InputAttachment[]
  inputSeed: string
  entryState: ReturnType<typeof buildTemplateWorkflowEntryState>
  templateContext: ReturnType<typeof buildTemplateRunContext>
  savedSnapshot: string
}> {
  const nextWorkflow = resolveTemplateWorkflow(template, webSearchBackend)
  const filePath = await window.api.createWorkflow(projectPath, template.name, nextWorkflow)
  const loadedWorkflow = await window.api.loadWorkflow(filePath)
  const refreshedWorkflows = await window.api.listProjectWorkflows(projectPath)
  await window.api.recordProjectTemplateUsage(projectPath, template.id).catch(() => undefined)

  const artifactAttachments: InputAttachment[] = artifacts.map((artifact) => ({
    kind: "file",
    path: artifact.relativePath,
    name: artifact.title,
  }))
  const hydratedTemplate = {
    ...template,
    workflow: loadedWorkflow,
  }

  return {
    filePath,
    loadedWorkflow,
    refreshedWorkflows,
    artifactAttachments,
    inputSeed: buildArtifactAttachmentSeedInput(artifactAttachments),
    entryState: buildTemplateWorkflowEntryState({
      template: hydratedTemplate,
      workflowPath: filePath,
    }),
    templateContext: buildTemplateRunContext({
      template: hydratedTemplate,
      workflowPath: filePath,
      sourceArtifacts: artifacts,
    }),
    savedSnapshot: workflowSnapshot(loadedWorkflow),
  }
}
