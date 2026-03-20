import { useEffect, useMemo, useRef, useState } from "react"
import type { ArtifactRecord, HumanTaskSummary, WorkflowTemplate } from "@shared/types"
import {
  deriveWorkflowCreateContinuations,
  type WorkflowCreateContinuationCandidate,
} from "@/lib/workflow-create-continuation"

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
  const [humanTasks, setHumanTasks] = useState<HumanTaskSummary[]>([])
  const [resourcesLoading, setResourcesLoading] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (!projectPath) {
      setArtifacts([])
      setHumanTasks([])
      setResourcesLoading(false)
      return
    }

    setResourcesLoading(true)

    void Promise.all([
      window.api.listProjectArtifacts(projectPath).catch(() => [] as ArtifactRecord[]),
      window.api.listHumanTasks(projectPath).catch(() => [] as HumanTaskSummary[]),
    ]).then(([nextArtifacts, nextHumanTasks]) => {
      if (requestIdRef.current !== requestId) return
      setArtifacts(nextArtifacts)
      setHumanTasks(nextHumanTasks)
    }).finally(() => {
      if (requestIdRef.current === requestId) {
        setResourcesLoading(false)
      }
    })
  }, [projectPath])

  const continuations = useMemo(
    () => deriveWorkflowCreateContinuations({ artifacts, humanTasks, templates }),
    [artifacts, humanTasks, templates],
  )

  return {
    loading: Boolean(projectPath) && (resourcesLoading || templatesLoading),
    primaryContinuation: (continuations[0] ?? null) as WorkflowCreateContinuationCandidate | null,
    secondaryContinuations: continuations.slice(1, 4),
    hiddenContinuationCount: Math.max(0, continuations.length - 4),
  }
}
