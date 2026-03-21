import { useEffect, useMemo, useRef, useState } from "react"
import { Activity, FilePlus2, Folder, Inbox, LayoutTemplate, Loader2, Search, Settings2, Zap } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/cn"
import {
  buildAppShellCommandSections,
  type AppShellActionEntry,
  type AppShellCommandAction,
  type AppShellCommandEntry,
  type AppShellDesktopCommandEntry,
  type AppShellProjectEntry,
  type AppShellWorkflowEntry,
} from "@/lib/app-shell-command-palette"

function entryIcon(entry: AppShellCommandEntry) {
  if (entry.kind === "start") return FilePlus2
  if (entry.kind === "project") return Folder
  if (entry.kind === "workflow") return null
  if (entry.kind === "desktop_command") return null
  return actionIcon(entry.action)
}

function actionIcon(action: AppShellCommandAction) {
  if (action === "new_process") return FilePlus2
  if (action === "add_project") return Folder
  if (action === "runs_dashboard") return Activity
  if (action === "process_library") return LayoutTemplate
  if (action === "attach_skill") return Zap
  if (action === "inbox") return Inbox
  return Settings2
}

function isActionEntry(entry: AppShellCommandEntry): entry is AppShellActionEntry {
  return entry.kind === "action"
}

function isWorkflowEntry(entry: AppShellCommandEntry): entry is AppShellWorkflowEntry {
  return entry.kind === "workflow"
}

function isProjectEntry(entry: AppShellCommandEntry): entry is AppShellProjectEntry {
  return entry.kind === "project"
}

function isDesktopCommandEntry(entry: AppShellCommandEntry): entry is AppShellDesktopCommandEntry {
  return entry.kind === "desktop_command"
}

interface AppCommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: AppShellCommandEntry[]
  onSelect: (entry: AppShellCommandEntry) => void
  primaryModifierLabel: string
  selectedProject: string | null
  projects: string[]
}

export function AppCommandPalette({
  open,
  onOpenChange,
  entries,
  onSelect,
  primaryModifierLabel,
  selectedProject,
  projects,
}: AppCommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectionMode, setSelectionMode] = useState<"pointer" | "keyboard">("pointer")

  const sections = useMemo(
    () => buildAppShellCommandSections({
      query,
      actions: entries.filter(isActionEntry),
      desktopCommands: entries.filter(isDesktopCommandEntry),
      projectEntries: entries.filter(isProjectEntry),
      workflows: entries.filter(isWorkflowEntry),
      selectedProject,
      projects,
    }),
    [entries, projects, query, selectedProject],
  )
  const filteredEntries = useMemo(
    () => sections.flatMap((section) => section.entries),
    [sections],
  )

  useEffect(() => {
    if (!open) {
      setQuery("")
      setSelectedIndex(0)
      setSelectionMode("pointer")
      return
    }
    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const selectedEntry = filteredEntries[selectedIndex]
    if (!selectedEntry) return

    const frame = window.requestAnimationFrame(() => {
      const target = itemRefs.current[selectedEntry.id]
      if (!target || !listRef.current) return
      target.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [filteredEntries, open, selectedIndex])

  const handleActivate = (entry: AppShellCommandEntry) => {
    onSelect(entry)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent size="lg" className="max-w-[44rem] gap-0 p-0" showCloseButton={false}>
        <CanvasDialogHeader className="command-center-header">
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <DialogDescription className="sr-only">
            Search flows, projects, and app actions.
          </DialogDescription>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="command-center-search-shell">
                <Search size={14} className="text-muted-foreground" />
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault()
                      setSelectionMode("keyboard")
                      setSelectedIndex((previous) =>
                        filteredEntries.length === 0 ? 0 : Math.min(previous + 1, filteredEntries.length - 1),
                      )
                      return
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault()
                      setSelectionMode("keyboard")
                      setSelectedIndex((previous) => Math.max(previous - 1, 0))
                      return
                    }
                    if (event.key === "Enter") {
                      const entry = filteredEntries[selectedIndex]
                      if (!entry) return
                      event.preventDefault()
                      handleActivate(entry)
                    }
                  }}
                  placeholder="Jump to a flow, project, or action"
                  className="h-auto border-0 bg-transparent px-0 py-0 text-body-md shadow-none focus-visible:ring-0"
                  aria-label="Command palette"
                />
              </div>
              <span className="command-center-kbd">
                {primaryModifierLabel}K
              </span>
            </div>
            {selectedProject ? (
              <div className="px-1">
                <span className="text-sidebar-meta text-muted-foreground">
                  {`In ${selectedProject.split(/[\\/]/).filter(Boolean).pop() || selectedProject}`}
                </span>
              </div>
            ) : null}
          </div>
        </CanvasDialogHeader>

        <div
          ref={listRef}
          className="command-center-scroll"
          onPointerMove={() => {
            if (selectionMode !== "pointer") {
              setSelectionMode("pointer")
            }
          }}
        >
          <CanvasDialogBody className="py-2">
            {filteredEntries.length === 0 ? (
              <div className="command-center-empty">
                Nothing matches this query
              </div>
            ) : (
              <div className="space-y-1.5">
                {sections.map((section) => (
                  <div key={section.id} className="command-center-section">
                    <p className="command-center-section-label">{section.label}</p>
                    {section.entries.map((entry) => {
                      const index = filteredEntries.findIndex((candidate) => candidate.id === entry.id)
                      const isSelected = index === selectedIndex
                      const Icon = entryIcon(entry)
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          ref={(node) => {
                            itemRefs.current[entry.id] = node
                          }}
                          onMouseEnter={() => {
                            if (selectionMode !== "pointer") return
                            setSelectedIndex(index)
                          }}
                          onClick={() => handleActivate(entry)}
                          className={cn(
                            "command-center-row",
                            isSelected && "command-center-row--selected",
                          )}
                          aria-selected={isSelected}
                        >
                          <span className="command-center-icon">
                            {entry.kind === "workflow" ? (
                              entry.active ? <Loader2 size={13} className="animate-spin" /> : <span className="command-center-dot" />
                            ) : Icon ? (
                              <Icon size={14} />
                            ) : (
                              <span className="command-center-dot" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-body-sm text-foreground">
                              {entry.label}
                            </span>
                            {entry.kind === "workflow" ? (
                              <span className="block truncate text-sidebar-meta text-muted-foreground">
                                {entry.projectLabel}
                              </span>
                            ) : entry.subtitle ? (
                              <span className="block truncate text-sidebar-meta text-muted-foreground">
                                {entry.subtitle}
                              </span>
                            ) : null}
                          </span>
                          {entry.kind === "workflow" ? (
                            entry.active ? null : (
                              <span className="command-center-meta">
                                {entry.metaLabel}
                              </span>
                            )
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </CanvasDialogBody>
        </div>
        <CanvasDialogFooter className="command-center-footer">
          <div className="flex flex-wrap items-center gap-3 text-sidebar-meta text-muted-foreground">
            <span>↑↓ Move</span>
            <span>Enter Open</span>
            <span>Esc Close</span>
          </div>
          <span className="text-sidebar-meta text-muted-foreground">
            Start, open, switch
          </span>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
