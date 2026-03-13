import { useState, useMemo } from "react"
import { useAtom } from "jotai"
import {
  skillsAtom,
  skillPickerOpenAtom,
  type DiscoveredSkill,
} from "@/lib/store"
import { cn } from "@/lib/cn"
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

const TYPE_ICONS = {
  skill: Zap,
  agent: Bot,
  command: Terminal,
} as const

interface SkillPickerProps {
  onAddSkill: (skill: DiscoveredSkill) => void
}

export function SkillPicker({ onAddSkill }: SkillPickerProps) {
  const [skills] = useAtom(skillsAtom)
  const [pickerOpen, setPickerOpen] = useAtom(skillPickerOpenAtom)
  const [search, setSearch] = useState("")
  const [sourceFilter, setSourceFilter] = useState<string | null>(null)

  // Collect unique sources
  const sources = useMemo(() => {
    const s = new Set<string>()
    for (const skill of skills) {
      s.add(skill.library || "project")
    }
    return Array.from(s)
  }, [skills])

  const grouped = useMemo(() => {
    const filtered = skills.filter((s) => {
      if (sourceFilter) {
        const skillSource = s.library || "project"
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
    const groups = new Map<string, DiscoveredSkill[]>()
    for (const skill of filtered) {
      const key = skill.category || "uncategorized"
      const list = groups.get(key) || []
      list.push(skill)
      groups.set(key, list)
    }
    return groups
  }, [skills, search, sourceFilter])

  const handleAddSkill = (skill: DiscoveredSkill) => {
    onAddSkill(skill)
    setPickerOpen(false)
  }

  return (
    <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
      <CanvasDialogContent className="p-0 gap-0 max-h-[75vh] flex flex-col" showCloseButton>
        <CanvasDialogHeader className="border-b border-hairline bg-gradient-to-b from-surface-1 to-surface-2/70">
          <DialogTitle>Add Skill</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a skill to add to your workflow
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
                placeholder="Search skills..."
                aria-label="Search skills"
                autoFocus
                className="pl-8"
              />
            </div>

            {sources.length > 1 && (
              <div className="flex gap-1 flex-wrap" role="group" aria-label="Filter by source">
                <Button
                  type="button"
                  variant={!sourceFilter ? "default" : "secondary"}
                  size="sm"
                  className="h-auto px-2 py-0 ui-meta-text"
                  onClick={() => setSourceFilter(null)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSourceFilter(null) } }}
                  aria-pressed={!sourceFilter}
                >
                  All
                </Button>
                {sources.map((source) => (
                  <Button
                    type="button"
                    key={source}
                    variant={sourceFilter === source ? "default" : "secondary"}
                    size="sm"
                    className="h-auto px-2 py-0 ui-meta-text"
                    onClick={() =>
                      setSourceFilter(sourceFilter === source ? null : source)
                    }
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSourceFilter(sourceFilter === source ? null : source) } }}
                    aria-pressed={sourceFilter === source}
                  >
                    {source}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Skill list */}
          <div className="flex-1 overflow-y-auto px-3 py-2 bg-surface-1/40">
            <div role="status" aria-live="polite" aria-atomic="true">
              {skills.length === 0 && (
                <div className="text-center py-8 text-body-md text-muted-foreground">
                  No skills found. Install a library in Skills or open a project with local skills.
                </div>
              )}
              {skills.length > 0 && grouped.size === 0 && (
                <div className="text-center py-8 text-body-md text-muted-foreground">
                  No results for &ldquo;{search}&rdquo;
                </div>
              )}
            </div>

            {Array.from(grouped.entries()).map(([category, categorySkills]) => (
              <div key={category} className="mb-3">
                <div className="px-2 py-1 section-kicker">
                  {category}
                </div>
                {categorySkills.map((skill) => {
                  const Icon = TYPE_ICONS[skill.type]
                  return (
                    <Button
                      type="button"
                      key={skill.path}
                      onClick={() => handleAddSkill(skill)}
                      aria-label={`Add ${skill.name} skill`}
                      variant="ghost"
                      size="auto"
                      className="h-auto w-full justify-start items-start gap-3 rounded-md border border-transparent px-2 py-2 text-left whitespace-normal ui-transition-surface ui-motion-fast hover:border-hairline hover:bg-surface-3/80"
                    >
                      <Icon
                        size={16}
                        aria-hidden="true"
                        className="text-muted-foreground mt-0.5 flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="ui-badge-row">
                          <span className="text-body-md font-medium truncate">{skill.name}</span>
                          {skill.library && (
                            <Badge
                              variant="secondary"
                              className={cn("px-2 py-0 text-muted-foreground")}
                            >
                              {skill.library}
                            </Badge>
                          )}
                        </div>
                        {skill.description && (
                          <div className="mt-1 line-clamp-2 ui-meta-text">
                            {skill.description}
                          </div>
                        )}
                      </div>
                      <Badge variant="outline" className="mt-0.5 px-2 py-0">
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
