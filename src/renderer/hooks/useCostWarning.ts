import { useCallback, useRef, useState } from "react"
import type { PreflightWarning } from "@/features/execution/preflight"

interface CostWarningState {
  open: boolean
  warning: PreflightWarning | null
}

/**
 * Manages the cost warning dialog lifecycle.
 *
 * Returns a `handlePreflightWarnings` callback suitable for passing to
 * `ExecutionProvider.onPreflightWarnings`. When called, it opens the dialog
 * and returns a promise that resolves to `true` (user confirmed) or `false`
 * (user cancelled).
 */
export function useCostWarning() {
  const [state, setState] = useState<CostWarningState>({ open: false, warning: null })
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null)

  const handlePreflightWarnings = useCallback(async (warnings: PreflightWarning[]): Promise<boolean> => {
    const budgetWarning = warnings.find((w) => w.kind === "token_budget")
    if (!budgetWarning) return true

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setState({ open: true, warning: budgetWarning })
    })
  }, [])

  const confirm = useCallback(() => {
    setState({ open: false, warning: null })
    resolverRef.current?.(true)
    resolverRef.current = null
  }, [])

  const cancel = useCallback(() => {
    setState({ open: false, warning: null })
    resolverRef.current?.(false)
    resolverRef.current = null
  }, [])

  const setOpen = useCallback((open: boolean) => {
    if (!open) {
      cancel()
    }
  }, [cancel])

  return {
    costWarningOpen: state.open,
    costWarning: state.warning,
    setCostWarningOpen: setOpen,
    confirmCostWarning: confirm,
    cancelCostWarning: cancel,
    handlePreflightWarnings,
  }
}
