import type {
  ApprovalNodeConfig,
  EvaluatorNodeConfig,
  MergerNodeConfig,
  SkillNodeConfig,
  SplitterNodeConfig,
} from "@shared/types"

export const DEFAULT_EVALUATOR_CONFIG: Omit<EvaluatorNodeConfig, "retryFrom"> = {
  criteria: "Score 1-10 on clarity, engagement, and effectiveness",
  threshold: 7,
  maxRetries: 3,
}

export const DEFAULT_FANOUT_PATTERN: {
  splitter: SplitterNodeConfig
  worker: Pick<SkillNodeConfig, "skillRef" | "prompt">
  merger: Pick<MergerNodeConfig, "strategy">
} = {
  splitter: {
    strategy: "Split into independent subtasks",
    maxBranches: 8,
  },
  worker: {
    skillRef: "",
    prompt: "Process this subtask",
  },
  merger: {
    strategy: "concatenate",
  },
}

export const DEFAULT_APPROVAL_CONFIG: ApprovalNodeConfig = {
  message: "Review and approve this step before continuing.",
  show_content: true,
  allow_edit: false,
}
