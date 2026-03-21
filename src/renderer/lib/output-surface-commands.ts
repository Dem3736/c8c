export type OutputSurfaceCommandId =
  | "output.view_result"
  | "output.view_activity"
  | "output.view_log"
  | "output.view_history"
  | "output.rerun_from_step"
  | "output.use_in_new_flow"

export interface OutputSurfaceCommandState {
  result: boolean
  activity: boolean
  log: boolean
  history: boolean
  rerunFromStep: boolean
  useInNewFlow: boolean
}

export function createDefaultOutputSurfaceCommandState(): OutputSurfaceCommandState {
  return {
    result: false,
    activity: false,
    log: false,
    history: false,
    rerunFromStep: false,
    useInNewFlow: false,
  }
}
