import { useCallback, useEffect, useMemo, useState } from "react"
import { useAtom } from "jotai"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  currentWorkflowAtom,
  librariesAtom,
  mainViewAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  skillsAtom,
  type SkillLibrary,
} from "@/lib/store"
import { cn } from "@/lib/cn"
import { addSkillNodeToWorkflow } from "@/lib/workflow-mutations"
import type { DiscoveredSkill, Workflow } from "@shared/types"
import { Eye, Library, Loader2, Plus, RefreshCw, Search } from "lucide-react"
import { toast } from "sonner"
import { PageHeader, PageShell, SectionHeading } from "@/components/ui/page-shell"
import { SkillDetailPanel } from "@/components/SkillDetailPanel"

type LibraryAction = "installing" | "updating" | "removing"

const LIBRARY_ACTION_LABEL: Record<LibraryAction, string> = {
  installing: "Installing",
  updating: "Updating",
  removing: "Removing",
}

const LIBRARY_PREVIEW_HINTS: Record<string, string[]> = {
  "agency-agents": [
    "Product manager and growth planning agents",
    "Frontend, backend, and QA engineering agents",
    "Marketing and copywriting support agents",
  ],
  "gtm-skills": [
    "Market research and ICP definition",
    "Outbound email drafting and sequencing",
    "Lead enrichment and account profiling",
  ],
  "anthropic-skills": [
    "PDF, DOCX, and XLSX processing",
    "Presentation analysis and summarization",
    "Website and design QA skills",
  ],
  "jeff-allan-skills": [
    "Architecture and code review workflows",
    "Debugging and incident-response helpers",
    "Testing and CI/CD optimization skills",
  ],
  "composio-skills": [
    "SaaS integrations and automation helpers",
    "Content and creative production skills",
    "Research and operations accelerators",
  ],
}

function normalizeSkillRef(value: string): string {
  return value.trim().replace(/^\/+/, "").replace(/\/+/g, "/").toLowerCase()
}

function skillRefCandidates(skill: DiscoveredSkill): string[] {
  const name = normalizeSkillRef(skill.name)
  const category = normalizeSkillRef(skill.category || "")
  const full = normalizeSkillRef(`${category}/${name}`)
  return Array.from(new Set([name, full])).filter(Boolean)
}

function findWorkflowRefsByLibrary(workflow: Workflow, librarySkills: DiscoveredSkill[]): string[] {
  if (librarySkills.length === 0) return []
  const candidates = new Set(librarySkills.flatMap(skillRefCandidates))
  const impacted = new Set<string>()

  for (const node of workflow.nodes) {
    if (node.type !== "skill") continue
    const rawRef = typeof node.config.skillRef === "string" ? node.config.skillRef : ""
    const normalizedRef = normalizeSkillRef(rawRef)
    if (!normalizedRef) continue
    const matches = Array.from(candidates).some((candidate) =>
      normalizedRef === candidate || normalizedRef.endsWith(`/${candidate}`),
    )
    if (matches) impacted.add(rawRef)
  }

  return Array.from(impacted)
}

function SkillLibraryCard({
  library,
  installedSkillsCount,
  busy,
  actionLabel,
  onToggle,
  onUpdate,
  onPreview,
}: {
  library: SkillLibrary
  installedSkillsCount: number
  busy: boolean
  actionLabel: string | null
  onToggle: (nextChecked: boolean) => void
  onUpdate: () => void
  onPreview: () => void
}) {
  return (
    <article
      className={cn(
        "ui-interactive-card rounded-lg surface-panel px-4 py-3",
        "flex items-center gap-3",
      )}
    >
      <div className="h-control-lg w-control-lg rounded-lg border border-border bg-surface-2 flex items-center justify-center">
        <Library size={18} className="text-muted-foreground" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-body-md font-semibold truncate">{library.name}</h3>
          {library.installed && (
            <Badge variant="outline">
              {installedSkillsCount} skills
            </Badge>
          )}
          {actionLabel && (
            <Badge variant="secondary">{actionLabel}</Badge>
          )}
        </div>
        <p className="text-body-sm text-muted-foreground truncate">
          {library.description}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPreview}
          disabled={busy}
          aria-label={`Preview ${library.name}`}
        >
          <Eye size={14} />
        </Button>
        {library.installed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onUpdate}
            disabled={busy}
            aria-label={`Update ${library.name}`}
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
          </Button>
        )}
        <Switch
          checked={library.installed}
          onCheckedChange={onToggle}
          disabled={busy}
          aria-label={library.installed ? `Uninstall ${library.name}` : `Install ${library.name}`}
        />
      </div>
    </article>
  )
}

export function SkillsPage() {
  const [libraries, setLibraries] = useAtom(librariesAtom)
  const [skills, setSkills] = useAtom(skillsAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [currentWorkflow, setCurrentWorkflow] = useAtom(currentWorkflowAtom)
  const [, setMainView] = useAtom(mainViewAtom)

  const [query, setQuery] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [libraryAction, setLibraryAction] = useState<{ id: string; action: LibraryAction } | null>(null)
  const [statusMessage, setStatusMessage] = useState("")
  const [pendingUninstall, setPendingUninstall] = useState<SkillLibrary | null>(null)
  const [previewLibrary, setPreviewLibrary] = useState<SkillLibrary | null>(null)
  const [acknowledgeBrokenRefs, setAcknowledgeBrokenRefs] = useState(false)
  const [selectedSkill, setSelectedSkill] = useState<DiscoveredSkill | null>(null)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const loadedLibraries = await window.api.listLibraries()
      setLibraries(loadedLibraries)

      if (selectedProject) {
        const scanned = await window.api.scanSkills(selectedProject)
        setSkills(scanned)
      }
    } catch (error) {
      toast.error(`Failed to refresh skills: ${String(error)}`)
    } finally {
      setRefreshing(false)
    }
  }, [selectedProject, setLibraries, setSkills])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    setAcknowledgeBrokenRefs(false)
  }, [pendingUninstall?.id])

  const skillsCountByLibrary = useMemo(() => {
    const counter = new Map<string, number>()
    for (const skill of skills) {
      if (!skill.library) continue
      counter.set(skill.library, (counter.get(skill.library) ?? 0) + 1)
    }
    return counter
  }, [skills])

  const skillsByLibrary = useMemo(() => {
    const map = new Map<string, DiscoveredSkill[]>()
    for (const skill of skills) {
      if (!skill.library) continue
      const list = map.get(skill.library) || []
      list.push(skill)
      map.set(skill.library, list)
    }
    return map
  }, [skills])

  const libraryById = useMemo(() => {
    return new Map(libraries.map((library) => [library.id, library]))
  }, [libraries])

  const filteredLibraries = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return libraries
    return libraries.filter((library) =>
      `${library.name} ${library.description} ${library.id}`.toLowerCase().includes(q),
    )
  }, [libraries, query])

  const filteredSkills = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = !q
      ? skills
      : skills.filter((skill) =>
        `${skill.name} ${skill.description} ${skill.category} ${skill.library || "project"}`.toLowerCase().includes(q),
      )
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [skills, query])

  const installedLibraries = filteredLibraries.filter((library) => library.installed)
  const recommendedLibraries = filteredLibraries.filter((library) => !library.installed)

  const pendingUninstallRefs = useMemo(() => {
    if (!pendingUninstall) return []
    const librarySkills = skillsByLibrary.get(pendingUninstall.id) || []
    return findWorkflowRefsByLibrary(currentWorkflow, librarySkills)
  }, [currentWorkflow, pendingUninstall, skillsByLibrary])

  const setLibraryInstalled = useCallback(async (library: SkillLibrary, nextChecked: boolean) => {
    if (!nextChecked) {
      setPendingUninstall(library)
      return
    }

    setLibraryAction({ id: library.id, action: "installing" })
    try {
      await window.api.installLibrary(library.id)
      toast.success(`Library installed: ${library.name}`)
      setStatusMessage(`${library.name} installed`)
      await refresh()
    } catch (error) {
      toast.error(`Failed to install ${library.name}: ${String(error)}`)
      setStatusMessage(`Failed to install ${library.name}`)
    } finally {
      setLibraryAction(null)
    }
  }, [refresh])

  const updateLibrary = useCallback(async (library: SkillLibrary) => {
    setLibraryAction({ id: library.id, action: "updating" })
    try {
      await window.api.installLibrary(library.id)
      toast.success(`Library updated: ${library.name}`)
      setStatusMessage(`${library.name} updated`)
      await refresh()
    } catch (error) {
      toast.error(`Failed to update ${library.name}: ${String(error)}`)
      setStatusMessage(`Failed to update ${library.name}`)
    } finally {
      setLibraryAction(null)
    }
  }, [refresh])

  const commitUninstall = useCallback(async () => {
    const library = pendingUninstall
    if (!library) return
    if (pendingUninstallRefs.length > 0 && !acknowledgeBrokenRefs) {
      return
    }
    setPendingUninstall(null)
    setLibraryAction({ id: library.id, action: "removing" })
    try {
      await window.api.removeLibrary(library.id)
      toast.success(`Library removed: ${library.name}`)
      setStatusMessage(`${library.name} removed`)
      await refresh()
    } catch (error) {
      toast.error(`Failed to remove ${library.name}: ${String(error)}`)
      setStatusMessage(`Failed to remove ${library.name}`)
    } finally {
      setLibraryAction(null)
      setAcknowledgeBrokenRefs(false)
    }
  }, [acknowledgeBrokenRefs, pendingUninstall, pendingUninstallRefs.length, refresh])

  const addSkillToWorkflow = useCallback((skill: DiscoveredSkill) => {
    if (!selectedProject) {
      toast.error("Select a project first.")
      return
    }
    if (!selectedWorkflowPath) {
      setMainView("thread")
      toast.error("Open a workflow first, then add a skill.")
      return
    }

    setCurrentWorkflow((prev) => addSkillNodeToWorkflow(prev, skill))
    setMainView("thread")
    toast.success(`Skill added: ${skill.name}`, {
      description: "Configure the new step in the workflow editor.",
    })
    setStatusMessage(`${skill.name} added to workflow`)
  }, [selectedProject, selectedWorkflowPath, setCurrentWorkflow, setMainView])

  const createSkill = async () => {
    if (!selectedProject) {
      toast.error("Select a project first, then create a skill.")
      return
    }
    try {
      const skillPath = await window.api.createSkillTemplate(selectedProject)
      await refresh()
      const openError = await window.api.openPath(skillPath)
      const fileName = skillPath.split("/").pop() || "skill file"
      if (openError) {
        toast.success(`Skill created: ${fileName}`, {
          description: "Template is ready. Open it from your file explorer.",
          action: {
            label: "Open file",
            onClick: () => void window.api.openPath(skillPath),
          },
        })
      } else {
        toast.success(`Skill created and opened: ${fileName}`)
      }
      setStatusMessage("Skill template created")
    } catch (error) {
      toast.error(`Failed to create skill template: ${String(error)}`)
      setStatusMessage("Failed to create skill template")
    }
  }

  const previewItems = previewLibrary
    ? (skillsByLibrary.get(previewLibrary.id) || []).map((skill) => `${skill.category}/${skill.name}`)
    : []
  const previewHints = previewLibrary ? (LIBRARY_PREVIEW_HINTS[previewLibrary.id] || []) : []
  const currentLibraryActionLabel = libraryAction
    ? `${LIBRARY_ACTION_LABEL[libraryAction.action]} ${libraryById.get(libraryAction.id)?.name || "library"}...`
    : null

  return (
    <PageShell>
      <PageHeader
        title="Skills"
        subtitle="Install libraries, preview capabilities, and add skills to workflows from one place."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={refreshing}>
              {refreshing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Refresh
            </Button>

            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search libraries and skills"
                aria-label="Search libraries and skills"
                className="w-44 sm:w-64 pl-8 bg-surface-2"
              />
            </div>

            <Button
              size="sm"
              variant="default"
              onClick={() => void createSkill()}
              disabled={!selectedProject}
            >
              <Plus size={14} />
              New skill
            </Button>
          </>
        }
      />

      {currentLibraryActionLabel && (
        <div className="ui-alert-info text-status-info flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          {currentLibraryActionLabel}
        </div>
      )}

      <section className="space-y-3">
        <SectionHeading title="Installed" meta={<Badge variant="outline">{installedLibraries.length}</Badge>} />

        {installedLibraries.length === 0 ? (
          <div className="rounded-lg surface-panel px-4 py-8 text-body-sm text-muted-foreground">
            Install a library from Recommended to unlock more skills.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {installedLibraries.map((library) => {
              const cardBusy = refreshing || libraryAction?.id === library.id
              const actionLabel = libraryAction?.id === library.id
                ? LIBRARY_ACTION_LABEL[libraryAction.action]
                : null
              return (
                <SkillLibraryCard
                  key={library.id}
                  library={library}
                  installedSkillsCount={skillsCountByLibrary.get(library.id) ?? 0}
                  busy={cardBusy}
                  actionLabel={actionLabel}
                  onToggle={(nextChecked) => void setLibraryInstalled(library, nextChecked)}
                  onUpdate={() => void updateLibrary(library)}
                  onPreview={() => setPreviewLibrary(library)}
                />
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading title="Recommended" meta={<Badge variant="outline">{recommendedLibraries.length}</Badge>} />

        {recommendedLibraries.length === 0 ? (
          <div className="rounded-lg surface-panel px-4 py-8 text-body-sm text-muted-foreground">
            Adjust the search query to discover more libraries to install.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {recommendedLibraries.map((library) => {
              const cardBusy = refreshing || libraryAction?.id === library.id
              const actionLabel = libraryAction?.id === library.id
                ? LIBRARY_ACTION_LABEL[libraryAction.action]
                : null
              return (
                <SkillLibraryCard
                  key={library.id}
                  library={library}
                  installedSkillsCount={0}
                  busy={cardBusy}
                  actionLabel={actionLabel}
                  onToggle={(nextChecked) => void setLibraryInstalled(library, nextChecked)}
                  onUpdate={() => undefined}
                  onPreview={() => setPreviewLibrary(library)}
                />
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading title="Browse & Use" meta={
          <Badge variant="outline">
            {filteredSkills.length !== skills.length
              ? `${filteredSkills.length}/${skills.length}`
              : filteredSkills.length}
          </Badge>
        } />

        {filteredSkills.length === 0 ? (
          <div className="rounded-lg surface-panel px-4 py-8 text-body-sm text-muted-foreground">
            No skills match this filter. Install a library or clear search.
          </div>
        ) : (
          <div className="rounded-lg surface-panel divide-y divide-hairline">
            {filteredSkills.map((skill) => (
              <div
                key={`${skill.path}-${skill.name}`}
                className="px-3 py-2 flex items-start gap-3 cursor-pointer ui-transition-colors ui-motion-fast hover:bg-surface-2/60"
                onClick={() => setSelectedSkill(skill)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedSkill(skill) } }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-body-md font-medium truncate">{skill.name}</span>
                    <Badge variant="outline" className="ui-meta-text px-1.5 py-0">{skill.type}</Badge>
                    <Badge variant="secondary" className="ui-meta-text px-1.5 py-0">
                      {skill.library || "project"}
                    </Badge>
                  </div>
                  <p className="ui-meta-text text-muted-foreground mt-0.5">
                    {skill.category}/{skill.name}
                  </p>
                  {skill.description && (
                    <p className="ui-meta-text text-muted-foreground line-clamp-2 mt-0.5">
                      {skill.description}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); addSkillToWorkflow(skill) }}
                  disabled={!selectedWorkflowPath}
                >
                  Add to workflow
                </Button>
              </div>
            ))}
          </div>
        )}

        {!selectedWorkflowPath && (
          <p className="ui-meta-text text-muted-foreground">
            Open a workflow to enable &ldquo;Add to workflow&rdquo;.
          </p>
        )}
      </section>

      <div aria-live="polite" className="sr-only">{statusMessage}</div>

      <Dialog open={pendingUninstall !== null} onOpenChange={(open) => !open && setPendingUninstall(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Uninstall library?</DialogTitle>
            <DialogDescription>
              Remove &ldquo;{pendingUninstall?.name || "library"}&rdquo; and its installed skills from this app profile?
            </DialogDescription>
          </DialogHeader>

          {pendingUninstallRefs.length > 0 && (
            <div className="ui-alert-warning space-y-2">
              <p className="text-body-sm text-status-warning">
                Dependency warning: current workflow references skills from this library.
              </p>
              <div className="flex flex-wrap gap-1">
                {pendingUninstallRefs.slice(0, 6).map((skillRef) => (
                  <Badge key={skillRef} variant="outline" className="font-mono">{skillRef}</Badge>
                ))}
                {pendingUninstallRefs.length > 6 && (
                  <Badge variant="outline">+{pendingUninstallRefs.length - 6} more</Badge>
                )}
              </div>
              <Label htmlFor="acknowledge-broken-refs" className="text-body-sm flex items-center gap-2 cursor-pointer">
                <Switch
                  id="acknowledge-broken-refs"
                  checked={acknowledgeBrokenRefs}
                  onCheckedChange={setAcknowledgeBrokenRefs}
                />
                I understand this may break `skillRef` in the current workflow.
              </Label>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingUninstall(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void commitUninstall()} disabled={pendingUninstallRefs.length > 0 && !acknowledgeBrokenRefs}>
              Uninstall
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewLibrary !== null} onOpenChange={(open) => !open && setPreviewLibrary(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{previewLibrary?.name || "Library"} preview</DialogTitle>
            <DialogDescription>
              {previewLibrary?.installed
                ? "Detected skills from this installed library."
                : "Typical capabilities available after installation."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {previewLibrary?.installed && previewItems.length > 0 ? (
              <div className="rounded-md border border-hairline bg-surface-2/60 p-2 max-h-56 overflow-y-auto ui-scroll-region space-y-1">
                {previewItems.slice(0, 20).map((item) => (
                  <div key={item} className="ui-meta-text font-mono text-foreground-subtle">{item}</div>
                ))}
                {previewItems.length > 20 && (
                  <div className="ui-meta-text text-muted-foreground">+{previewItems.length - 20} more</div>
                )}
              </div>
            ) : previewHints.length > 0 ? (
              <div className="rounded-md border border-hairline bg-surface-2/60 p-2 space-y-1">
                {previewHints.map((item) => (
                  <div key={item} className="text-body-sm text-foreground-subtle">{item}</div>
                ))}
              </div>
            ) : (
              <p className="text-body-sm text-muted-foreground">
                Install this library to scan exact skills for your project.
              </p>
            )}

            {previewLibrary && (
              <p className="ui-meta-text text-muted-foreground">
                Source: {previewLibrary.repo}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreviewLibrary(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedSkill && (
        <SkillDetailPanel
          skill={selectedSkill}
          onClose={() => setSelectedSkill(null)}
        />
      )}
    </PageShell>
  )
}
