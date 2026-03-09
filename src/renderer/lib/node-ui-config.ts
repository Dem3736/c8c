import type { NodeStatus, NodeType } from "@shared/types"
import {
  BarChart3,
  FileInput,
  FileOutput,
  GitFork,
  Hand,
  Merge,
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
}

export const NODE_LABELS: Record<NodeType, string> = {
  input: "Input",
  output: "Output",
  skill: "Skill",
  evaluator: "Evaluator",
  splitter: "Fan-out",
  merger: "Merge",
  approval: "Approval",
}

export const NODE_ACCENTS: Partial<Record<NodeType, string>> = {
  input: "border-status-info/40",
  output: "border-hairline",
  skill: "border-foreground/20",
  evaluator: "border-status-warning/40",
  splitter: "border-foreground/20",
  merger: "border-foreground/20",
  approval: "border-status-warning/50",
}

export const STATUS_STYLES: Partial<Record<NodeStatus, string>> = {
  running: "node-status-running",
  completed: "border-status-success/60",
  failed: "border-status-danger/60",
  skipped: "border-status-warning/50",
  waiting_approval: "border-status-warning/60",
}
