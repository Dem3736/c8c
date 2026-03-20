import { useEffect, useMemo, useRef, useState } from "react"
import type { ArtifactRecord, CaseStateRecord, HumanTaskSummary, WorkflowTemplate } from "@shared/types"
import {
  deriveWorkflowCreateContinuations,
  type WorkflowCreateContinuationCandidate,
} from "@/lib/workflow-create-continuation"

interface WorkflowCreateContinuationResources {
  artifacts: ArtifactRecord[]
  caseStates: CaseStateRecord[]
  humanTasks: HumanTaskSummary[]
}

export function startWorkflowCreateContinuationResourceLoad({
  projectPath,
  requestIdRef,
  readResources,
  onReset,
  onLoaded,
  onLoadingChange,
}: {
  projectPath: string | null
  requestIdRef: { current: number }
  readResources: (projectPath: string) => Promise<WorkflowCreateContinuationResources>
  onReset: () => void
  onLoaded: (resources: WorkflowCreateContinuationResources) => void
  onLoadingChange: (loading: boolean) => void
}) {
  const requestId = requestIdRef.current + 1
  requestIdRef.current = requestId

  onReset()

  if (!projectPath) {
    onLoadingChange(false)
    return
  }

  onLoadingChange(true)

  void readResources(projectPath)
    .then((resources) => {
      if (requestIdRef.current !== requestId) return
      onLoaded(resources)
    })
    .finally(() => {
      if (requestIdRef.current === requestId) {
        onLoadingChange(false)
      }
    })
}

export function useWorkflowCreateContinuation({
  projectPath,
  templates,
  templatesLoading,
}: {
  projectPath: string | null
  templates: WorkflowTemplate[]
  templatesLoading: boolean
}) {
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([])
  const [caseStates, setCaseStates] = useState<CaseStateRecord[]>([])
  const [humanTasks, setHumanTasks] = useState<HumanTaskSummary[]>([])
  const [resourcesLoading, setResourcesLoading] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    startWorkflowCreateContinuationResourceLoad({
      projectPath,
      requestIdRef,
      readResources: async (nextProjectPath) => {
        const [nextArtifacts, nextCaseStates, nextHumanTasks] = await Promise.all([
          window.api.listProjectArtifacts(nextProjectPath).catch(() => [] as ArtifactRecord[]),
          window.api.listProjectCaseStates(nextProjectPath).catch(() => [] as CaseStateRecord[]),
          window.api.listHumanTasks(nextProjectPath).catch(() => [] as HumanTaskSummary[]),
        ])
        return {
          artifacts: nextArtifacts,
          caseStates: nextCaseStates,
          humanTasks: nextHumanTasks,
        }
      },
      onReset: () => {
        setArtifacts([])
        setCaseStates([])
        setHumanTasks([])
      },
      onLoaded: (resources) => {
        setArtifacts(resources.artifacts)
        setCaseStates(resources.caseStates)
        setHumanTasks(resources.humanTasks)
      },
      onLoadingChange: setResourcesLoading,
    })
  }, [projectPath])

  const continuations = useMemo(
    () => deriveWorkflowCreateContinuations({ artifacts, caseStates, humanTasks, templates }),
    [artifacts, caseStates, humanTasks, templates],
  )

  return {
    loading: Boolean(projectPath) && (resourcesLoading || templatesLoading),
    primaryContinuation: (continuations[0] ?? null) as WorkflowCreateContinuationCandidate | null,
    secondaryContinuations: continuations.slice(1),
  }
}
