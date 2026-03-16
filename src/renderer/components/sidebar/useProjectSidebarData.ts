import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react"
import type { DiscoveredSkill, Workflow, WorkflowFile } from "@shared/types"
import { toast } from "sonner"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { restoreSelectedWorkflowIfNeeded, shouldRestoreSelectedWorkflow } from "./workflowRestore"

interface UseProjectSidebarDataParams {
  selectedProject: string | null
  setProjects: Dispatch<SetStateAction<string[]>>
  setSelectedProject: Dispatch<SetStateAction<string | null>>
  expandedProjects: string[]
  setExpandedProjects: Dispatch<SetStateAction<string[]>>
  setWorkflows: Dispatch<SetStateAction<WorkflowFile[]>>
  setSkills: Dispatch<SetStateAction<DiscoveredSkill[]>>
  selectedWorkflowPath: string | null
  setSelectedWorkflowPath: Dispatch<SetStateAction<string | null>>
  currentWorkflow: Workflow
  setCurrentWorkflow: Dispatch<SetStateAction<Workflow>>
  setWorkflowSavedSnapshot: Dispatch<SetStateAction<string>>
}

export function useProjectSidebarData({
  selectedProject,
  setProjects,
  setSelectedProject,
  expandedProjects,
  setExpandedProjects,
  setWorkflows,
  setSkills,
  selectedWorkflowPath,
  setSelectedWorkflowPath,
  currentWorkflow,
  setCurrentWorkflow,
  setWorkflowSavedSnapshot,
}: UseProjectSidebarDataParams) {
  const [projectWorkflowsCache, setProjectWorkflowsCache] = useState<Record<string, WorkflowFile[]>>({})
  const [globalWorkflows, setGlobalWorkflows] = useState<WorkflowFile[]>([])

  useEffect(() => {
    window.api.listProjects().then(setProjects)
    window.api.getSelectedProject().then((projectPath) => {
      if (!projectPath) return
      setSelectedProject(projectPath)
    })
  }, [setProjects, setSelectedProject])

  useEffect(() => {
    if (selectedProject) {
      window.api.listProjectWorkflows(selectedProject).then(setWorkflows)
      window.api.scanSkills(selectedProject).then(setSkills)
      window.api.setSelectedProject(selectedProject)
      return
    }

    setWorkflows([])
    setSkills([])
  }, [selectedProject, setSkills, setWorkflows])

  useEffect(() => {
    window.api.listGlobalWorkflows().then(setGlobalWorkflows).catch(() => setGlobalWorkflows([]))
  }, [])

  useEffect(() => {
    if (!shouldRestoreSelectedWorkflow(selectedWorkflowPath, currentWorkflow)) return

    let cancelled = false

    void restoreSelectedWorkflowIfNeeded({
      selectedWorkflowPath,
      currentWorkflow,
      loadWorkflow: (workflowPath) => window.api.loadWorkflow(workflowPath),
    }).then((loadedWorkflow) => {
      if (cancelled || !loadedWorkflow) return
      setCurrentWorkflow(loadedWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
    }).catch((error) => {
      if (cancelled) return
      setSelectedWorkflowPath(null)
      const emptyWorkflow = createEmptyWorkflow()
      setCurrentWorkflow(emptyWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(emptyWorkflow))
      toast.error("Could not restore the previously opened workflow", {
        description: String(error),
      })
    })

    return () => {
      cancelled = true
    }
  }, [
    currentWorkflow,
    selectedWorkflowPath,
    setCurrentWorkflow,
    setSelectedWorkflowPath,
    setWorkflowSavedSnapshot,
  ])

  useEffect(() => {
    setExpandedProjects((prev) => {
      if (prev.length < 2) return prev
      const unique = Array.from(new Set(prev))
      return unique.length === prev.length ? prev : unique
    })
  }, [setExpandedProjects])

  useEffect(() => {
    for (const path of expandedProjects) {
      if (path === selectedProject) continue
      if (projectWorkflowsCache[path]) continue
      window.api.listProjectWorkflows(path).then((wfs) => {
        setProjectWorkflowsCache((prev) => ({ ...prev, [path]: wfs }))
      })
    }
  }, [expandedProjects, projectWorkflowsCache, selectedProject])

  const toggleProjectExpansion = (projectPath: string) => {
    setExpandedProjects((prev) =>
      prev.includes(projectPath)
        ? prev.filter((path) => path !== projectPath)
        : [...prev, projectPath],
    )
  }

  return {
    projectWorkflowsCache,
    setProjectWorkflowsCache,
    globalWorkflows,
    toggleProjectExpansion,
  }
}
