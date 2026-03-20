import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SectionHeading } from "@/components/ui/page-shell"
import { SkillDetailPanel } from "@/components/SkillDetailPanel"
import { cn } from "@/lib/cn"
import { deriveSkillProvenanceLabel, deriveSkillSourceBadge } from "@/lib/skill-fit"
import { getSkillSourceLabel } from "@/lib/skill-source"
import type { DiscoveredSkill } from "@shared/types"

type SkillGroup = {
  id: string
  title: string
  description: string
  items: DiscoveredSkill[]
}

export function SkillsAttachSection({
  filteredSkills,
  allSkillsCount,
  currentFlowLabel,
  groupedSkills,
  selectedSkill,
  onSelectSkill,
  onAttachSkill,
  addToFlowDisabledReason,
  selectedFlowPath,
  onCloseSkillDetail,
}: {
  filteredSkills: DiscoveredSkill[]
  allSkillsCount: number
  currentFlowLabel: string | null
  groupedSkills: SkillGroup[]
  selectedSkill: DiscoveredSkill | null
  onSelectSkill: (skill: DiscoveredSkill) => void
  onAttachSkill: (skill: DiscoveredSkill) => void
  addToFlowDisabledReason: string | null
  selectedFlowPath: string | null
  onCloseSkillDetail: () => void
}) {
  return (
    <section className="space-y-3">
      <SectionHeading title="Attach skills" meta={
        <Badge variant="outline">
          {filteredSkills.length !== allSkillsCount
            ? `${filteredSkills.length}/${allSkillsCount}`
            : filteredSkills.length}
        </Badge>
      } />

      <div className="flex flex-wrap items-center gap-2 rounded-lg surface-inset-card px-3 py-2">
        {currentFlowLabel ? (
          <>
            <Badge variant="outline" size="compact">Attach to current flow</Badge>
            <span className="text-body-sm font-medium text-foreground">{currentFlowLabel}</span>
          </>
        ) : (
          <span className="ui-meta-text text-muted-foreground">
            Open a flow to attach skills directly from this page.
          </span>
        )}
      </div>

      {filteredSkills.length === 0 ? (
        <div className="rounded-lg surface-panel ui-empty-state px-4 text-body-sm text-muted-foreground">
          No skills match this filter. Install a library or plugin, or clear search.
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="min-w-0 flex-1 space-y-4">
            {groupedSkills.map((section) => (
              <section key={section.id} className="rounded-lg surface-panel overflow-hidden">
                <div className="surface-depth-header flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <h3 className="text-body-md font-semibold text-foreground">{section.title}</h3>
                    <p className="ui-meta-text text-muted-foreground">{section.description}</p>
                  </div>
                  <Badge variant="outline" size="compact">{section.items.length}</Badge>
                </div>

                <div className="divide-y divide-hairline" role="list" aria-label={section.title}>
                  {section.items.map((skill) => {
                    const isSelected = selectedSkill?.path === skill.path
                    const sourceLabel = getSkillSourceLabel(skill)
                    const provenanceLabel = deriveSkillProvenanceLabel(skill)

                    return (
                      <div
                        key={`${skill.path}-${skill.name}`}
                        className="flex items-start gap-3 px-3 py-3"
                        role="listitem"
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="bare"
                          onClick={() => onSelectSkill(skill)}
                          aria-pressed={isSelected}
                          className={cn(
                            "ui-interactive-card min-w-0 flex-1 !justify-start gap-3 rounded-md border border-transparent text-left !whitespace-normal",
                            isSelected && "surface-inset-card shadow-inset-highlight",
                          )}
                        >
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="ui-body-text-medium truncate">{skill.name}</span>
                              <Badge variant="outline" size="compact">{skill.type}</Badge>
                              <Badge variant="secondary" size="compact">
                                {deriveSkillSourceBadge(skill)}
                              </Badge>
                            </div>
                            {skill.description && (
                              <p className="text-body-sm text-muted-foreground line-clamp-2">
                                {skill.description}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline" size="compact">{sourceLabel}</Badge>
                              {provenanceLabel !== sourceLabel ? (
                                <Badge variant="outline" size="compact">{provenanceLabel}</Badge>
                              ) : null}
                              <span className="ui-meta-text text-muted-foreground">
                                {skill.category}/{skill.name}
                              </span>
                            </div>
                          </div>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(event) => {
                            event.stopPropagation()
                            onAttachSkill(skill)
                          }}
                          disabled={!!addToFlowDisabledReason}
                          title={addToFlowDisabledReason || "Attach this skill to the current flow."}
                        >
                          Attach
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>

          {selectedSkill && (
            <SkillDetailPanel
              skill={selectedSkill}
              onAddToWorkflow={() => onAttachSkill(selectedSkill)}
              canAddToWorkflow={!addToFlowDisabledReason}
              addDisabledReason={addToFlowDisabledReason}
              onClose={onCloseSkillDetail}
            />
          )}
        </div>
      )}

      {!selectedFlowPath && (
        <p className="ui-meta-text text-muted-foreground">
          Open a flow to enable &ldquo;Attach&rdquo;.
        </p>
      )}
    </section>
  )
}
