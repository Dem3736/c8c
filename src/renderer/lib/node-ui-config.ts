import type { NodeStatus, NodeType } from "@shared/types"
import {
  BarChart3,
  FileInput,
  FileOutput,
  GitFork,
  Hand,
  Merge,
  MessageSquare,
  type LucideIcon,
  Zap,
} from "lucide-react"

export const NODE_ICONS: Record<NodeType, LucideIcon> = {
  input: FileInput,
  output: FileOutput,
  skill: Zap,
  evaluator: BarChart3,
  splitter: GitFork,
  merger: Merge,
  approval: Hand,
  human: MessageSquare,
}

export const NODE_LABELS: Record<NodeType, string> = {
  input: "Input",
  output: "Output",
  skill: "Skill",
  evaluator: "Evaluator",
  splitter: "Split work",
  merger: "Merge",
  approval: "Approval",
  human: "Human",
}

export const NODE_ICON_TONES: Record<NodeType, string> = {
  input: "border-status-info/30 bg-status-info/10 text-status-info",
  output: "border-hairline bg-surface-1 text-muted-foreground",
  skill: "border-foreground/20 bg-foreground/10 text-foreground-subtle",
  evaluator: "border-status-warning/30 bg-status-warning/10 text-status-warning",
  splitter: "border-foreground/20 bg-foreground/10 text-foreground-subtle",
  merger: "border-foreground/20 bg-foreground/10 text-foreground-subtle",
  approval: "border-status-warning/30 bg-status-warning/10 text-status-warning",
  human: "border-status-warning/30 bg-status-warning/10 text-status-warning",
}

export const NODE_ACCENTS: Partial<Record<NodeType, string>> = {
  input: "border-status-info/40",
  output: "border-hairline",
  skill: "border-foreground/20",
  evaluator: "border-status-warning/40",
  splitter: "border-foreground/20",
  merger: "border-foreground/20",
  approval: "border-status-warning/50",
  human: "border-status-warning/50",
}

export const STATUS_STYLES: Partial<Record<NodeStatus, string>> = {
  running: "node-status-running",
  completed: "node-status-completed",
  failed: "border-status-danger/60",
  skipped: "border-status-warning/50",
  waiting_approval: "border-status-warning/60",
  waiting_human: "border-status-warning/60",
}
