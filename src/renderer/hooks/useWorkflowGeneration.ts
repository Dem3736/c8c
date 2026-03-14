import { useEffect, useRef, useState } from "react"
import type { DiscoveredSkill, GenerationProgress, Workflow, WorkflowFile } from "@shared/types"
import { toast } from "sonner"
import { cloneWorkflow } from "@/lib/workflow-graph-utils"
import { workflowSnapshot } from "@/lib/workflow-snapshot"

type GenerationTarget = "replace" | "new"

interface UseWorkflowGenerationArgs {
  workflow: Workflow
  setWorkflow: (next: Workflow) => void
  selectedWorkflowPath: string | null
  setSelectedWorkflowPath: (next: string | null) => void
  setWorkflowSavedSnapshot: (next: string) => void
  setWorkflows: (next: WorkflowFile[]) => void
  skills: DiscoveredSkill[]
  setSkills: (next: DiscoveredSkill[]) => void
  selectedProject: string | null
  onOpenChange: (open: boolean) => void
}

export function useWorkflowGeneration({
  workflow,
  setWorkflow,
  selectedWorkflowPath,
  setSelectedWorkflowPath,
  setWorkflowSavedSnapshot,
  setWorkflows,
  skills,
  setSkills,
  selectedProject,
  onOpenChange,
}: UseWorkflowGenerationArgs) {
  const [description, setDescription] = useState("")
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const generationTokenRef = useRef(0)

  useEffect(() => {
    return () => {
      generationTokenRef.current += 1
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [])

  const cancelPendingGeneration = () => {
    generationTokenRef.current += 1
    cleanupRef.current?.()
    cleanupRef.current = null
    setGenerating(false)
    setProgress(null)
    window.api.cancelGenerate()
  }

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && generating) {
      cancelPendingGeneration()
    }
    onOpenChange(nextOpen)
  }

  const hasWorkflowContent = (candidate: Workflow): boolean =>
    candidate.nodes.some((node) => node.type !== "input" && node.type !== "output")
      || candidate.name.trim().length > 0
      || (candidate.description || "").trim().length > 0

  const generate = async (target: GenerationTarget) => {
    if (!description.trim()) return
    if (target === "new" && !selectedProject) {
      setError("Select a project before generating a new workflow file.")
      return
    }

    const token = generationTokenRef.current + 1
    generationTokenRef.current = token

    setGenerating(true)
    setError(null)
    setProgress({ step: "starting", count: 0 })

    cleanupRef.current?.()
    cleanupRef.current = window.api.onGenerateProgress((nextProgress) => {
      if (generationTokenRef.current !== token) return
      setProgress(nextProgress)
    })

    try {
      const skillInfos = skills.map((skill) => ({
        name: skill.name,
        category: skill.category,
        description: skill.description,
      }))

      const generatedWorkflow = await window.api.generateWorkflow(
        description,
        skillInfos,
        selectedProject || undefined,
      )
      if (generationTokenRef.current !== token) return

      const previousWorkflow = cloneWorkflow(workflow)
      const previousWorkflowPath = selectedWorkflowPath

      if (target === "new") {
        const baseName = generatedWorkflow.name.trim() || "generated-workflow"
        const createdPath = await window.api.createWorkflow(selectedProject!, baseName, generatedWorkflow)
        const savedWorkflow = await window.api.loadWorkflow(createdPath)
        const refreshed = await window.api.listProjectWorkflows(selectedProject!)

        if (generationTokenRef.current !== token) return

        setWorkflows(refreshed)
        setSelectedWorkflowPath(createdPath)
        setWorkflow(savedWorkflow)
        setWorkflowSavedSnapshot(workflowSnapshot(savedWorkflow))
        toast.success("Generated and saved as new workflow")
      } else {
        setWorkflow(generatedWorkflow)
        // Replacing current workflow intentionally marks editor dirty.
        toast.success("Workflow generated", {
          action: hasWorkflowContent(previousWorkflow)
            ? {
              label: "Undo",
              onClick: () => {
                setWorkflow(previousWorkflow)
                setSelectedWorkflowPath(previousWorkflowPath)
              },
            }
            : undefined,
        })
      }

      onOpenChange(false)
      // Keep description so user can refine and regenerate

      if (selectedProject) {
        const updatedSkills = await window.api.scanSkills(selectedProject)
        if (generationTokenRef.current !== token) return
        setSkills(updatedSkills)
      }
    } catch (err) {
      if (generationTokenRef.current !== token) return
      const msg = String(err).replace(/^Error: Error invoking remote method '[^']+': Error: /, "")
      setError(msg)
    } finally {
      if (generationTokenRef.current !== token) return
      setGenerating(false)
      setProgress(null)
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }

  return {
    description,
    setDescription,
    generating,
    error,
    progress,
    generate,
    cancelPendingGeneration,
    handleDialogOpenChange,
  }
}
