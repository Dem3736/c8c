import type { RefObject } from "react"
import { Button } from "@/components/ui/button"
import type { ResultModeConfigField } from "@/lib/result-mode-config"
import type { WorkflowCreatePromptScaffold } from "@/lib/workflow-create-prompt"
import { ModeConfigField, ScaffoldField } from "@/components/create/CreateDetailFields"

type ScaffoldPlaceholders = {
  goal: string
  input: string
  constraints: string
  successCriteria: string
}

export function WorkflowCreateDetailsPanel({
  open,
  helperRef,
  scrollRef,
  optionalDetailCount,
  modeConfigFields,
  modeConfig,
  onModeConfigChange,
  promptScaffold,
  scaffoldPlaceholders,
  onPromptScaffoldChange,
  onClearOptionalDetails,
}: {
  open: boolean
  helperRef: RefObject<HTMLDivElement | null>
  scrollRef: RefObject<HTMLDivElement | null>
  optionalDetailCount: number
  modeConfigFields: ResultModeConfigField[]
  modeConfig: Record<string, string>
  onModeConfigChange: (fieldId: string, value: string) => void
  promptScaffold: WorkflowCreatePromptScaffold
  scaffoldPlaceholders: ScaffoldPlaceholders
  onPromptScaffoldChange: (next: WorkflowCreatePromptScaffold) => void
  onClearOptionalDetails: () => void
}) {
  return (
    <div data-open={open ? "true" : "false"} className="ui-collapsible">
      <div className="ui-collapsible-inner">
        <div className="px-2 pt-1">
          <div ref={helperRef} className="overflow-hidden border-t border-hairline/70">
            <div className="flex flex-wrap items-start justify-between gap-3 px-2 pb-0 pt-3">
              <div>
                <p className="section-kicker">Details</p>
              </div>
              {optionalDetailCount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="shrink-0 text-muted-foreground"
                  onClick={onClearOptionalDetails}
                >
                  Clear details
                </Button>
              ) : null}
            </div>

            <div
              ref={scrollRef}
              className="ui-scroll-region max-h-[min(56vh,36rem)] overflow-y-auto border-t border-hairline/70 px-2 py-4"
            >
              <div className="space-y-5">
                <div className="space-y-3">
                  <p className="ui-meta-label text-muted-foreground">Mode details</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {modeConfigFields.map((field) => (
                      <ModeConfigField
                        key={field.id}
                        field={field}
                        value={modeConfig[field.id] || ""}
                        onChange={(value) => onModeConfigChange(field.id, value)}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-3 border-t border-hairline/70 pt-4">
                  <p className="ui-meta-label text-muted-foreground">Request scaffold</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ScaffoldField
                      id="workflow-helper-goal"
                      label="Goal"
                      placeholder={scaffoldPlaceholders.goal}
                      value={promptScaffold.goal}
                      onChange={(value) => onPromptScaffoldChange({ ...promptScaffold, goal: value })}
                    />
                    <ScaffoldField
                      id="workflow-helper-input"
                      label="Input"
                      placeholder={scaffoldPlaceholders.input}
                      value={promptScaffold.input}
                      onChange={(value) => onPromptScaffoldChange({ ...promptScaffold, input: value })}
                    />
                    <ScaffoldField
                      id="workflow-helper-constraints"
                      label="Constraints"
                      placeholder={scaffoldPlaceholders.constraints}
                      value={promptScaffold.constraints}
                      onChange={(value) => onPromptScaffoldChange({ ...promptScaffold, constraints: value })}
                    />
                    <ScaffoldField
                      id="workflow-helper-success"
                      label="Success criteria"
                      placeholder={scaffoldPlaceholders.successCriteria}
                      value={promptScaffold.successCriteria}
                      onChange={(value) => onPromptScaffoldChange({ ...promptScaffold, successCriteria: value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
