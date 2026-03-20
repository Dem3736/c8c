import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { ArtifactRecord, ProjectFactoryBlueprint, WorkflowTemplate } from "@shared/types"
import type { WorkflowTemplateRunContext } from "@/lib/workflow-entry"

interface UseWorkflowPanelResourcesParams {
  selectedProject: string | null
  selectedWorkflowTemplateContext: WorkflowTemplateRunContext | null
  artifactRecords: ArtifactRecord[]
}

export function useWorkflowPanelResources({
  selectedProject,
  selectedWorkflowTemplateContext,
  artifactRecords,
}: UseWorkflowPanelResourcesParams) {
  const [projectArtifacts, setProjectArtifacts] = useState<ArtifactRecord[]>([])
  const [projectArtifactsLoading, setProjectArtifactsLoading] = useState(false)
  const [projectArtifactsError, setProjectArtifactsError] = useState<string | null>(null)
  const [factoryBlueprint, setFactoryBlueprint] = useState<ProjectFactoryBlueprint | null>(null)
  const [packTemplates, setPackTemplates] = useState<WorkflowTemplate[]>([])

  useEffect(() => {
    if (!selectedProject) {
      setProjectArtifacts([])
      setProjectArtifactsLoading(false)
      setProjectArtifactsError(null)
      setFactoryBlueprint(null)
      return
    }

    let cancelled = false
    setProjectArtifactsLoading(true)
    setProjectArtifactsError(null)

    void window.api.listProjectArtifacts(selectedProject).then((artifacts) => {
      if (cancelled) return
      setProjectArtifacts(artifacts)
    }).catch((error) => {
      if (cancelled) return
      setProjectArtifacts([])
      setProjectArtifactsError(error instanceof Error ? error.message : String(error))
    }).finally(() => {
      if (!cancelled) {
        setProjectArtifactsLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [selectedProject, artifactRecords])

  useEffect(() => {
    if (!selectedProject) {
      setFactoryBlueprint(null)
      return
    }

    let cancelled = false
    void window.api.loadProjectFactoryBlueprint(selectedProject).then((blueprint) => {
      if (cancelled) return
      setFactoryBlueprint(blueprint)
    }).catch(() => {
      if (!cancelled) {
        setFactoryBlueprint(null)
      }
    })

    return () => {
      cancelled = true
    }
  }, [selectedProject])

  useEffect(() => {
    if (!selectedWorkflowTemplateContext?.pack?.id) {
      setPackTemplates([])
      return
    }

    let cancelled = false
    void window.api.listTemplates().then((templates) => {
      if (cancelled) return
      setPackTemplates(templates)
    }).catch((error) => {
      if (cancelled) return
      console.error("[WorkflowPanel] failed to load pack templates:", error)
      setPackTemplates([])
      toast.error("Could not load library", {
        description: String(error),
      })
    })

    return () => {
      cancelled = true
    }
  }, [selectedWorkflowTemplateContext])

  return {
    projectArtifacts,
    projectArtifactsLoading,
    projectArtifactsError,
    factoryBlueprint,
    packTemplates,
  }
}
