import { ArrowUpRight, Check, Loader2 } from "lucide-react"
import type { HumanTaskField, HumanTaskSnapshot } from "@shared/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  compactTaskText,
  normalizeHumanFieldValue,
  primaryTaskFieldLabel,
  taskActionCopy,
  taskKindLabel,
  type TaskStageMeta,
} from "./task-ui"

interface SelectedTaskPanelProps {
  selectedTask: HumanTaskSnapshot | null
  taskLoading: boolean
  taskSubmitting: boolean
  taskAnswers: Record<string, unknown>
  selectedTaskStageMeta: TaskStageMeta | null
  onOpenWorkflow: () => void
  onFieldChange: (field: HumanTaskField, value: unknown) => void
  onSubmit: () => void
  onSubmitAndContinue: () => void
  onReject: () => void
}

export function SelectedTaskPanel({
  selectedTask,
  taskLoading,
  taskSubmitting,
  taskAnswers,
  selectedTaskStageMeta,
  onOpenWorkflow,
  onFieldChange,
  onSubmit,
  onSubmitAndContinue,
  onReject,
}: SelectedTaskPanelProps) {
  const selectedTaskPrimaryField = primaryTaskFieldLabel(selectedTask)

  return (
    <article className="rounded-lg surface-soft px-5 py-4">
      {taskLoading ? (
        <div className="flex min-h-[260px] items-center justify-center text-muted-foreground">
          <Loader2 size={18} className="mr-2 animate-spin" />
          Loading task...
        </div>
      ) : !selectedTask ? (
        <div className="flex min-h-[260px] items-center justify-center text-body-md text-muted-foreground">
          Select a task to inspect it.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-title-sm font-semibold text-foreground">{selectedTask.title}</h2>
                <Badge variant={selectedTask.kind === "approval" ? "warning" : "info"} size="pill">
                  {taskKindLabel(selectedTask)}
                </Badge>
                {selectedTaskStageMeta && (
                  <Badge variant="outline" size="pill" className="text-muted-foreground">
                    {selectedTaskStageMeta.title}
                  </Badge>
                )}
                {selectedTaskPrimaryField && (
                  <Badge variant="outline" size="pill" className="text-muted-foreground">
                    {selectedTaskPrimaryField}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-body-sm text-muted-foreground">
                Flow: {selectedTask.workflowName}
                {selectedTaskStageMeta ? ` · ${selectedTaskStageMeta.group}` : ""}
              </p>
              <div className="mt-3 rounded-lg surface-info-soft px-3 py-2">
                <p className="text-body-sm text-foreground">{taskActionCopy(selectedTask)}</p>
                <p className="mt-1 ui-meta-text text-muted-foreground">
                  If the run is live it will continue immediately. If it was reopened from history, you can resume it after submitting here.
                </p>
              </div>
              {selectedTask.instructions && compactTaskText(selectedTask.instructions, 999) !== compactTaskText(selectedTask.summary, 999) && (
                <p className="mt-2 text-body-sm text-muted-foreground whitespace-pre-wrap">{selectedTask.instructions}</p>
              )}
            </div>
            {selectedTask.workflowPath && (
              <Button type="button" variant="outline" size="sm" onClick={onOpenWorkflow}>
                <ArrowUpRight size={14} />
                Open flow
              </Button>
            )}
          </div>

          {selectedTask.summary && (
            <div className="rounded-lg surface-soft px-3 py-2 text-body-sm text-muted-foreground whitespace-pre-wrap">
              {selectedTask.summary}
            </div>
          )}

          <div className="space-y-3">
            {selectedTask.request.fields.map((field) => {
              const value = normalizeHumanFieldValue(field, taskAnswers[field.id])

              if (field.type === "boolean") {
                return (
                  <div key={field.id} className="surface-inset-card flex items-start justify-between gap-4 p-3">
                    <div className="min-w-0">
                      <p className="text-body-sm font-medium text-foreground">{field.label}</p>
                      {field.description && (
                        <p className="mt-1 text-body-sm text-muted-foreground">{field.description}</p>
                      )}
                    </div>
                    <Checkbox
                      checked={Boolean(value)}
                      onChange={(e) => onFieldChange(field, e.target.checked)}
                    />
                  </div>
                )
              }

              if (field.type === "select") {
                return (
                  <div key={field.id} className="space-y-2">
                    <label className="ui-meta-text text-muted-foreground">{field.label}</label>
                    <select
                      className="ui-input w-full"
                      value={String(value)}
                      onChange={(event) => onFieldChange(field, event.target.value)}
                    >
                      <option value="">Select...</option>
                      {(field.options || []).map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                )
              }

              if (field.type === "multiselect") {
                const selectedValues = Array.isArray(value) ? value : []
                return (
                  <div key={field.id} className="space-y-2">
                    <label className="ui-meta-text text-muted-foreground">{field.label}</label>
                    <div className="surface-inset-card space-y-2 p-3">
                      {(field.options || []).map((option) => {
                        const checked = selectedValues.includes(option.value)
                        return (
                          <label key={option.value} className="flex items-center gap-2 text-body-sm text-foreground">
                            <Checkbox
                              checked={checked}
                              onChange={(e) => {
                                const nextValues = e.target.checked
                                  ? [...selectedValues, option.value]
                                  : selectedValues.filter((item) => item !== option.value)
                                onFieldChange(field, nextValues)
                              }}
                            />
                            {option.label}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              }

              if (field.type === "textarea" || field.type === "json") {
                return (
                  <div key={field.id} className="space-y-2">
                    <label className="ui-meta-text text-muted-foreground">{field.label}</label>
                    <Textarea
                      value={String(value)}
                      placeholder={field.placeholder}
                      className="min-h-[120px]"
                      onChange={(event) => onFieldChange(field, event.target.value)}
                    />
                  </div>
                )
              }

              return (
                <div key={field.id} className="space-y-2">
                  <label className="ui-meta-text text-muted-foreground">{field.label}</label>
                  <Input
                    type={field.type === "number" ? "number" : "text"}
                    value={String(value)}
                    placeholder={field.placeholder}
                    onChange={(event) => onFieldChange(
                      field,
                      field.type === "number" ? Number(event.target.value) : event.target.value,
                    )}
                  />
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-hairline pt-3">
            <Button
              type="button"
              onClick={onSubmit}
              disabled={taskSubmitting}
              isLoading={taskSubmitting}
            >
              {!taskSubmitting && <Check size={14} />}
              {selectedTask.kind === "approval" ? "Approve" : "Submit response"}
            </Button>
            {selectedTask.workflowPath && (
              <Button
                type="button"
                variant="outline"
                onClick={onSubmitAndContinue}
                disabled={taskSubmitting}
              >
                <ArrowUpRight size={14} />
                {selectedTask.kind === "approval" ? "Approve and continue run" : "Submit and continue run"}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={onReject}
              disabled={taskSubmitting}
            >
              {selectedTask.kind === "approval" ? "Reject" : "Reject task"}
            </Button>
          </div>
        </div>
      )}
    </article>
  )
}
