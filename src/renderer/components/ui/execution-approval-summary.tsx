import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/cn"

interface ExecutionApprovalSummaryProps {
  flowName: string
  stepName: string
  stepKind?: string | null
  stepDescription?: string | null
  expectedResult: string
  inputPreview?: string | null
  inputLabels?: string[]
  approveLabel?: string
  approveConsequence: string
  rejectLabel?: string
  rejectConsequence: string
  topBadges?: ReactNode
  className?: string
}

function collapseText(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ")
}

export function ExecutionApprovalSummary({
  flowName,
  stepName,
  stepKind = null,
  stepDescription = null,
  expectedResult,
  inputPreview = null,
  inputLabels = [],
  approveLabel = "Approve",
  approveConsequence,
  rejectLabel = "Reject",
  rejectConsequence,
  topBadges = null,
  className,
}: ExecutionApprovalSummaryProps) {
  const previewText = inputPreview?.trim() || "Current input"
  const compactDescription = collapseText(stepDescription)

  return (
    <section className={cn("rounded-lg border border-hairline bg-surface-2/70 p-3 space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" size="compact">Flow</Badge>
        <span className="text-body-sm font-medium text-foreground">{flowName}</span>
        {stepKind ? <Badge variant="outline" size="compact">{stepKind}</Badge> : null}
        {topBadges}
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <div className="rounded-md border border-hairline bg-surface-1/80 px-3 py-2.5">
          <div className="ui-meta-label text-muted-foreground">This step</div>
          <div className="mt-1 text-body-sm font-medium text-foreground">{stepName}</div>
          {compactDescription ? (
            <div className="mt-1 line-clamp-2 ui-meta-text text-muted-foreground">
              {compactDescription}
            </div>
          ) : null}
        </div>
        <div className="rounded-md border border-hairline bg-surface-1/80 px-3 py-2.5">
          <div className="ui-meta-label text-muted-foreground">Expected result</div>
          <div className="mt-1 text-body-sm font-medium text-foreground">{expectedResult}</div>
        </div>
        <div className="rounded-md border border-hairline bg-surface-1/80 px-3 py-2.5">
          <div className="ui-meta-label text-muted-foreground">Runs with</div>
          {inputLabels.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {inputLabels.map((label) => (
                <Badge key={label} variant="outline" className="ui-meta-text px-2 py-0">
                  {label}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="mt-1 ui-meta-text text-muted-foreground">Current input</div>
          )}
        </div>
      </div>

      <div className="rounded-md border border-hairline bg-surface-1/80 px-3 py-2.5">
        <div className="ui-meta-label text-muted-foreground">Input preview</div>
        <div className="mt-1 line-clamp-4 whitespace-pre-wrap text-body-sm text-foreground">
          {previewText}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-status-success/20 bg-status-success/5 px-3 py-2.5">
          <div className="ui-meta-label text-status-success">{approveLabel}</div>
          <div className="mt-1 text-body-sm font-medium text-foreground">{approveConsequence}</div>
        </div>
        <div className="rounded-md border border-status-danger/20 bg-status-danger/5 px-3 py-2.5">
          <div className="ui-meta-label text-status-danger">{rejectLabel}</div>
          <div className="mt-1 text-body-sm font-medium text-foreground">{rejectConsequence}</div>
        </div>
      </div>
    </section>
  )
}
