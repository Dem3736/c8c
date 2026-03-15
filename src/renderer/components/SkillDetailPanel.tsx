import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"
import type { DiscoveredSkill } from "@shared/types"
import ReactMarkdown, { type Components as MarkdownComponents } from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  X,
  Loader2,
  FileText,
  Cpu,
  Wrench,
  RotateCw,
  FolderOpen,
  Library,
} from "lucide-react"

const MARKDOWN_COMPONENTS: MarkdownComponents = {
  a: ({ href, children, ...props }) => {
    const safeHref = typeof href === "string" ? href : ""
    return (
      <a
        {...props}
        href={safeHref}
        target="_blank"
        rel="noreferrer noopener"
        onClick={(event) => {
          if (!safeHref) event.preventDefault()
        }}
      >
        {children}
      </a>
    )
  },
}

interface SkillDetailPanelProps {
  skill: DiscoveredSkill
  onAddToWorkflow?: () => void
  canAddToWorkflow?: boolean
  addDisabledReason?: string | null
  onClose: () => void
}

export function SkillDetailPanel({
  skill,
  onAddToWorkflow,
  canAddToWorkflow = false,
  addDisabledReason = null,
  onClose,
}: SkillDetailPanelProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadContent = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const raw = await window.api.readSkillContent(skill.path)
      setContent(raw)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [skill.path])

  useEffect(() => {
    void loadContent()
  }, [loadContent])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  const metaItems: Array<{ icon: typeof Cpu; label: string; value: string }> = []

  if (skill.model) {
    metaItems.push({ icon: Cpu, label: "Model", value: skill.model })
  }
  if (skill.maxTurns != null) {
    metaItems.push({ icon: RotateCw, label: "Max turns", value: String(skill.maxTurns) })
  }
  if (skill.library) {
    metaItems.push({ icon: Library, label: "Library", value: skill.library })
  }

  const toolsList = skill.tools ?? skill.allowedTools ?? []

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-[var(--overlay-scrim)] ui-motion-fast animate-in fade-in-0"
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-[min(32rem,100vw-2rem)]",
          "surface-elevated flex flex-col",
          "animate-in slide-in-from-right duration-[var(--motion-slow)]",
        )}
      >
        {/* Header */}
        <header className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-border">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-title-md text-foreground truncate">{skill.name}</h2>
              <Badge variant="outline" className="ui-meta-text px-1.5 py-0 shrink-0">
                {skill.type}
              </Badge>
            </div>
            {skill.description && (
              <p className="text-body-sm text-muted-foreground mt-1 line-clamp-2">
                {skill.description}
              </p>
            )}
            <p className="ui-meta-text text-muted-foreground mt-1">
              {skill.category}/{skill.name}
            </p>
          </div>
          {onAddToWorkflow && (
            <Button
              variant="outline"
              size="sm"
              onClick={onAddToWorkflow}
              disabled={!canAddToWorkflow}
              title={addDisabledReason || "Add this skill to the current workflow."}
              className="shrink-0 mt-0.5"
            >
              Add to workflow
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="shrink-0 mt-0.5"
            aria-label="Close detail panel"
          >
            <X size={16} />
          </Button>
        </header>

        {/* Metadata */}
        {(metaItems.length > 0 || toolsList.length > 0) && (
          <div className="px-5 py-3 border-b border-border space-y-2.5">
            {metaItems.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-2 text-body-sm">
                <Icon size={14} className="text-muted-foreground shrink-0" />
                <span className="ui-meta-label">{label}:</span>
                <span className="text-foreground font-medium">{value}</span>
              </div>
            ))}

            {toolsList.length > 0 && (
              <div className="flex items-start gap-2 text-body-sm">
                <Wrench size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <span className="ui-meta-label">Tools:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {toolsList.map((tool) => (
                      <Badge key={tool} variant="secondary" className="ui-meta-text font-mono px-1.5 py-0">
                        {tool}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* File path */}
        <div className="px-5 py-2.5 border-b border-border">
          <div className="flex items-center gap-2 text-body-sm">
            <FileText size={14} className="text-muted-foreground shrink-0" />
            <span className="ui-meta-label">File:</span>
            <button
              type="button"
              className="text-foreground font-mono ui-meta-text truncate hover:underline cursor-pointer ui-transition-colors ui-motion-fast"
              title={skill.path}
              onClick={() => void window.api.showInFinder(skill.path)}
            >
              {skill.path}
            </button>
          </div>
          {skill.library && (
            <div className="flex items-center gap-2 text-body-sm mt-1">
              <FolderOpen size={14} className="text-muted-foreground shrink-0" />
              <span className="ui-meta-label">Source:</span>
              <span className="text-foreground">{skill.library}</span>
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 min-h-0 overflow-y-auto ui-scroll-region px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 size={18} className="animate-spin mr-2" />
              Loading skill content...
            </div>
          ) : error ? (
            <div className="rounded-lg surface-danger-soft px-4 py-3 text-body-sm text-status-danger">
              Failed to load skill content: {error}
            </div>
          ) : content ? (
            <div className="prose-c8c">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="text-body-sm text-muted-foreground py-8 text-center">
              No content available.
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
