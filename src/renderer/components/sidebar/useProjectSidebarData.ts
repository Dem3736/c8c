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
    let cancelled = false

    void window.api.listProjects().then((projects) => {
      if (cancelled) return
      setProjects(projects)
    }).catch((error) => {
      if (cancelled) return
      setProjects([])
      toast.error("Could not load projects", {
        description: String(error),
      })
    })

    void window.api.getSelectedProject().then((projectPath) => {
      if (cancelled || !projectPath) return
      setSelectedProject(projectPath)
    }).catch((error) => {
      if (cancelled) return
      toast.error("Could not restore the selected project", {
        description: String(error),
      })
    })

    return () => {
      cancelled = true
    }
  }, [setProjects, setSelectedProject])

  useEffect(() => {
    if (selectedProject) {
      let cancelled = false

      void Promise.all([
        window.api.listProjectWorkflows(selectedProject),
        window.api.scanSkills(selectedProject),
      ]).then(([workflows, skills]) => {
        if (cancelled) return
        setWorkflows(workflows)
        setSkills(skills)
      }).catch((error) => {
        if (cancelled) return
        setWorkflows([])
        setSkills([])
        toast.error("Could not load project data", {
          description: String(error),
        })
      })

      void window.api.setSelectedProject(selectedProject).catch((error) => {
        if (cancelled) return
        toast.error("Could not persist the selected project", {
          description: String(error),
        })
      })

      return () => {
        cancelled = true
      }
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
    let cancelled = false

    for (const path of expandedProjects) {
      if (path === selectedProject) continue
      if (projectWorkflowsCache[path]) continue
      void window.api.listProjectWorkflows(path).then((wfs) => {
        if (cancelled) return
        setProjectWorkflowsCache((prev) => ({ ...prev, [path]: wfs }))
      }).catch(() => {
        // Ignore background prefetch failures; the active project effect surfaces foreground errors.
      })
    }

    return () => {
      cancelled = true
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
