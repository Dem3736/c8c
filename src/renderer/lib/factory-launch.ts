import type { ArtifactRecord, InputAttachment, ProjectFactoryDefinition, WorkflowFile, WorkflowTemplate } from "@shared/types"
import type { WebSearchBackend } from "@/lib/web-search-backend"
import { resolveTemplateWorkflow } from "@/lib/web-search-backend"
import {
  buildArtifactAttachmentSeedInput,
  buildTemplateRunContext,
  buildTemplateWorkflowEntryState,
  type WorkflowTemplateCaseOverride,
} from "@/lib/workflow-entry"
import { workflowSnapshot } from "@/lib/workflow-snapshot"

export async function prepareTemplateStageLaunch({
  projectPath,
  template,
  webSearchBackend,
  artifacts,
  factory = null,
  caseOverride = null,
  inputSeedPrefix = null,
}: {
  projectPath: string
  template: WorkflowTemplate
  webSearchBackend: WebSearchBackend
  artifacts: ArtifactRecord[]
  factory?: Pick<ProjectFactoryDefinition, "id" | "label"> | null
  caseOverride?: WorkflowTemplateCaseOverride | null
  inputSeedPrefix?: string | null
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

  const baseInputSeed = buildArtifactAttachmentSeedInput(artifactAttachments)
  const inputSeed = inputSeedPrefix?.trim()
    ? `${inputSeedPrefix.trim()}\n\n---\n\n${baseInputSeed}`
    : baseInputSeed

  return {
    filePath,
    loadedWorkflow,
    refreshedWorkflows,
    artifactAttachments,
    inputSeed,
    entryState: buildTemplateWorkflowEntryState({
      template: hydratedTemplate,
      workflowPath: filePath,
    }),
    templateContext: buildTemplateRunContext({
      template: hydratedTemplate,
      workflowPath: filePath,
      sourceArtifacts: artifacts,
      factory,
      caseOverride,
    }),
    savedSnapshot: workflowSnapshot(loadedWorkflow),
  }
}
