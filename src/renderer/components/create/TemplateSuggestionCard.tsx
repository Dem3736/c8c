import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { WorkflowTemplate } from "@shared/types"
import { getWorkflowTemplateDisplayName } from "@/lib/template-display"
import { deriveTemplateCardCopy } from "@/lib/workflow-entry"

export function TemplateSuggestionCard({
  template,
  onSelect,
  title,
  summary,
  eyebrow,
  recommended = false,
}: {
  template: WorkflowTemplate
  onSelect: (template: WorkflowTemplate) => void
  title?: string
  summary?: string
  eyebrow?: string
  recommended?: boolean
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="bare"
      onClick={() => onSelect(template)}
      className="ui-interactive-card-subtle h-auto w-full !items-start gap-2.5 rounded-[1rem] border border-hairline/80 bg-surface-1/78 px-3 py-3 text-left !whitespace-normal"
    >
      <div className="surface-inset-card flex h-9 w-9 shrink-0 items-center justify-center p-0 text-[15px]">
        <span aria-hidden>{template.emoji}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {eyebrow ? (
            <Badge variant="outline" size="compact">
              {eyebrow}
            </Badge>
          ) : null}
          {recommended ? (
            <Badge variant="secondary" size="compact">
              Suggested
            </Badge>
          ) : null}
        </div>
        <p className="truncate text-body-sm font-medium text-foreground">
          {title || getWorkflowTemplateDisplayName(template)}
        </p>
        <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">
          {summary || template.headline || deriveTemplateCardCopy(template)}
        </p>
      </div>
    </Button>
  )
}

export function PendingTemplateDetails({
  intentLabel,
  executionSummary,
}: {
  intentLabel: string | null
  executionSummary: string | null
}) {
  if (!intentLabel && !executionSummary) return null

  return (
    <div className="rounded-lg surface-inset-card px-3 py-3">
      <div className="flex flex-wrap gap-3">
        {intentLabel ? (
          <div className="space-y-1">
            <p className="ui-meta-text text-muted-foreground">Intent</p>
            <p className="text-body-sm text-foreground">{intentLabel}</p>
          </div>
        ) : null}
        {executionSummary ? (
          <div className="space-y-1">
            <p className="ui-meta-text text-muted-foreground">Flow rules</p>
            <p className="text-body-sm text-foreground">{executionSummary}</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
