import { useEffect, useRef } from "react"
import { useAtom, useSetAtom } from "jotai"
import { currentWorkflowAtom, validationErrorsAtom } from "@/lib/store"
import { validateWorkflow } from "@/lib/validate-workflow"

export function useWorkflowValidation() {
  const [workflow] = useAtom(currentWorkflowAtom)
  const setValidationErrors = useSetAtom(validationErrorsAtom)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const errors = validateWorkflow(workflow)
      const grouped: Record<string, typeof errors> = {}
      for (const error of errors) {
        if (!grouped[error.nodeId]) grouped[error.nodeId] = []
        grouped[error.nodeId].push(error)
      }
      setValidationErrors(grouped)
    }, 500)
    return () => clearTimeout(timerRef.current)
  }, [workflow, setValidationErrors])
}
