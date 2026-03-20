import { useState, useMemo } from "react"
import { useAtom } from "jotai"
import {
  skillsAtom,
  skillPickerOpenAtom,
  type DiscoveredSkill,
} from "@/lib/store"
import { getSkillSourceKey, getSkillSourceLabel } from "@/lib/skill-source"
import { Search, Zap, Bot, Terminal } from "lucide-react"
import {
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogHeader,
  Dialog,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  compareSkillsForStage,
  deriveSkillProvenanceLabel,
  deriveSkillSourceBadge,
  deriveSkillStageFit,
} from "@/lib/skill-fit"

const TYPE_ICONS = {
  skill: Zap,
  agent: Bot,
  command: Terminal,
} as const

interface SkillPickerProps {
  onAddSkill: (skill: DiscoveredSkill) => void
  title?: string
  description?: string
  searchPlaceholder?: string
  emptyStateMessage?: string
  emptyResultsMessage?: (query: string) => string
  stageLabel?: string | null
  attachTargetLabel?: string
}

export function SkillPicker({
  onAddSkill,
  title = "Add Skill",
  description = "Choose a skill to add to your flow",
  searchPlaceholder = "Search skills...",
  emptyStateMessage = "No skills found. Install a plugin pack in Plugins, keep using legacy libraries, or open a project with local skills.",
  emptyResultsMessage = (query) => `No results for “${query}”`,
  stageLabel = null,
  attachTargetLabel = "This flow",
}: SkillPickerProps) {
  const [skills] = useAtom(skillsAtom)
  const [pickerOpen, setPickerOpen] = useAtom(skillPickerOpenAtom)
  const [search, setSearch] = useState("")
  const [sourceFilter, setSourceFilter] = useState<string | null>(null)

  // Collect unique sources
  const sources = useMemo(() => {
    const sourceMap = new Map<string, string>()
    for (const skill of skills) {
      sourceMap.set(getSkillSourceKey(skill), getSkillSourceLabel(skill))
    }
    return Array.from(sourceMap.entries()).map(([key, label]) => ({ key, label }))
  }, [skills])

  const grouped = useMemo(() => {
    const filtered = skills
      .filter((s) => {
      if (sourceFilter) {
        const skillSource = getSkillSourceKey(s)
        if (skillSource !== sourceFilter) return false
      }
      if (!search) return true
      const q = search.toLowerCase()
      return (
        s.name.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
        )
      })
      .sort((left, right) => compareSkillsForStage(left, right, stageLabel))

    const featured = filtered.filter((skill) => deriveSkillStageFit(skill, stageLabel).score >= 3).slice(0, 6)
    const featuredPaths = new Set(featured.map((skill) => skill.path))
    const remaining = filtered.filter((skill) => !featuredPaths.has(skill.path))

    const groups = new Map<string, DiscoveredSkill[]>()
    for (const skill of remaining) {
      const key = skill.category || "uncategorized"
      const list = groups.get(key) || []
      list.push(skill)
      groups.set(key, list)
    }
    return {
      featured,
      groups,
    }
  }, [skills, search, sourceFilter, stageLabel])

  const handleAddSkill = (skill: DiscoveredSkill) => {
    onAddSkill(skill)
    setPickerOpen(false)
  }

  return (
    <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
      <CanvasDialogContent className="p-0 gap-0 max-h-[75vh] flex flex-col" showCloseButton>
        <CanvasDialogHeader className="surface-depth-header">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            {description}
          </DialogDescription>
        </CanvasDialogHeader>

        <CanvasDialogBody className="flex flex-col min-h-0 p-0">
          {/* Search + source filter */}
          <div className="ui-dialog-gutter py-3 border-b border-hairline space-y-2 bg-surface-1/70">
            <div className="relative">
              <Search
                size={14}
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label="Search skills"
                autoFocus
                className="pl-8"
              />
            </div>

            {sources.length > 1 && (
              <div className="flex gap-1 flex-wrap" role="group" aria-label="Filter by source">
                <Button
                  type="button"
                  variant={!sourceFilter ? "secondary" : "outline"}
                  size="xs"
                  className="px-2 ui-meta-text"
                  onClick={() => setSourceFilter(null)}
                  aria-pressed={!sourceFilter}
                >
                  All
                </Button>
                {sources.map((source) => (
                  <Button
                    type="button"
                    key={source.key}
                    variant={sourceFilter === source.key ? "secondary" : "outline"}
                    size="xs"
                    className="px-2 ui-meta-text"
                    onClick={() =>
                      setSourceFilter(sourceFilter === source.key ? null : source.key)
                    }
                    aria-pressed={sourceFilter === source.key}
                  >
                    {source.label}
                  </Button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" size="compact">Attach to {attachTargetLabel}</Badge>
              {stageLabel && (
                <Badge variant="outline" size="compact">Current step: {stageLabel}</Badge>
              )}
            </div>
          </div>

          {/* Skill list */}
          <div className="ui-scroll-region flex-1 overflow-y-auto px-3 py-2 bg-surface-1/40">
            <div role="status" aria-live="polite" aria-atomic="true">
              {skills.length === 0 && (
                <div className="ui-empty-state text-body-md text-muted-foreground">
                  {emptyStateMessage}
                </div>
              )}
              {skills.length > 0 && grouped.featured.length === 0 && grouped.groups.size === 0 && (
                <div className="ui-empty-state text-body-md text-muted-foreground">
                  {emptyResultsMessage(search)}
                </div>
              )}
            </div>

            {grouped.featured.length > 0 && (
              <div className="mb-3">
                <div className="px-2 py-1 section-kicker">
                  Best fit now
                </div>
                {grouped.featured.map((skill) => {
                  const Icon = TYPE_ICONS[skill.type]
                  const fit = deriveSkillStageFit(skill, stageLabel)
                  return (
                    <Button
                      type="button"
                      key={`featured-${skill.path}`}
                      onClick={() => handleAddSkill(skill)}
                      aria-label={`Attach ${skill.name}`}
                      variant="ghost"
                      size="auto"
                      className="ui-interactive-card h-auto w-full justify-start items-start gap-3 rounded-md px-2 py-2 text-left whitespace-normal"
                    >
                      <Icon
                        size={16}
                        aria-hidden="true"
                        className="text-muted-foreground mt-0.5 flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="ui-badge-row">
                          <span className="text-body-md font-medium truncate">{skill.name}</span>
                          <Badge variant="success" size="compact">{fit.label}</Badge>
                          <Badge variant="outline" size="compact">{deriveSkillSourceBadge(skill)}</Badge>
                        </div>
                        <div className="mt-1 ui-meta-text text-muted-foreground">{fit.reason}</div>
                        <div className="mt-1 ui-badge-row">
                          <Badge variant="secondary" size="compact">{deriveSkillProvenanceLabel(skill)}</Badge>
                          <Badge variant="outline" size="compact">{skill.type}</Badge>
                        </div>
                      </div>
                    </Button>
                  )
                })}
              </div>
            )}

            {Array.from(grouped.groups.entries()).map(([category, categorySkills]) => (
              <div key={category} className="mb-3">
                <div className="px-2 py-1 section-kicker">
                  {category}
                </div>
                {categorySkills.map((skill) => {
                  const Icon = TYPE_ICONS[skill.type]
                  const fit = deriveSkillStageFit(skill, stageLabel)
                  return (
                    <Button
                      type="button"
                      key={skill.path}
                      onClick={() => handleAddSkill(skill)}
                      aria-label={`Add ${skill.name} skill`}
                      variant="ghost"
                      size="auto"
                      className="ui-interactive-card h-auto w-full justify-start items-start gap-3 rounded-md px-2 py-2 text-left whitespace-normal"
                    >
                      <Icon
                        size={16}
                        aria-hidden="true"
                        className="text-muted-foreground mt-0.5 flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="ui-badge-row">
                          <span className="text-body-md font-medium truncate">{skill.name}</span>
                          <Badge variant={fit.score >= 3 ? "success" : "outline"} size="compact">
                            {fit.label}
                          </Badge>
                          <Badge variant="outline" size="compact">{deriveSkillSourceBadge(skill)}</Badge>
                        </div>
                        <div className="mt-1 line-clamp-2 ui-meta-text">
                          {fit.score >= 3 ? fit.reason : skill.description}
                        </div>
                        <div className="mt-1 ui-meta-text text-muted-foreground">
                          {deriveSkillProvenanceLabel(skill)}
                        </div>
                      </div>
                      <Badge variant="outline" size="compact" className="mt-0.5">
                        {skill.type}
                      </Badge>
                    </Button>
                  )
                })}
              </div>
            ))}
          </div>
        </CanvasDialogBody>
      </CanvasDialogContent>
    </Dialog>
  )
}
