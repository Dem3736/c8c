import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getSkillSourceKind, getSkillSourceLabel } from "@/lib/skill-source"
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
  Package,
  type LucideIcon,
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

  const metaItems: Array<{ icon: LucideIcon; label: string; value: string }> = []
  const sourceKind = getSkillSourceKind(skill)
  const sourceLabel = getSkillSourceLabel(skill)

  if (skill.model) {
    metaItems.push({ icon: Cpu, label: "Model", value: skill.model })
  }
  if (skill.maxTurns != null) {
    metaItems.push({ icon: RotateCw, label: "Max turns", value: String(skill.maxTurns) })
  }
  if (sourceKind === "library") {
    metaItems.push({ icon: Library, label: "Library", value: skill.library || "library" })
  }
  if (sourceKind === "plugin") {
    metaItems.push({ icon: Package, label: "Plugin", value: sourceLabel })
    if (skill.marketplaceName) {
      metaItems.push({ icon: Library, label: "Marketplace", value: skill.marketplaceName })
    }
  }

  const toolsList = skill.tools ?? skill.allowedTools ?? []

  return (
    <aside className="w-full lg:w-[22rem] lg:max-h-[calc(100vh-var(--titlebar-height)-6rem)] lg:self-start lg:sticky lg:top-0 flex-shrink-0 overflow-hidden rounded-xl surface-panel flex flex-col">
      <header className="border-b border-border px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-control-lg w-control-lg shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2">
            <Wrench size={16} className="text-muted-foreground" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-body-md font-semibold text-foreground">{skill.name}</h2>
              <Badge variant="outline" size="compact">
                {skill.type}
              </Badge>
              <Badge variant="secondary" size="compact">
                {sourceLabel}
              </Badge>
            </div>
            <p className="ui-meta-text text-muted-foreground mt-1">
              {skill.category}/{skill.name}
            </p>
            {skill.description && (
              <p className="text-body-sm text-muted-foreground mt-2">
                {skill.description}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="shrink-0"
            aria-label="Close detail panel"
          >
            <X size={16} />
          </Button>
        </div>
      </header>

      {(metaItems.length > 0 || toolsList.length > 0) && (
        <div className="border-b border-border px-4 py-3 space-y-3">
          {metaItems.length > 0 && (
            <div className="space-y-2.5">
              {metaItems.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-2 text-body-sm">
                  <Icon size={14} className="text-muted-foreground shrink-0" />
                  <span className="ui-meta-label">{label}:</span>
                  <span className="text-foreground font-medium">{value}</span>
                </div>
              ))}
            </div>
          )}

          {toolsList.length > 0 && (
            <div className="flex items-start gap-2 text-body-sm">
              <Wrench size={14} className="text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <span className="ui-meta-label">Tools:</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {toolsList.map((tool) => (
                    <Badge key={tool} variant="secondary" size="compact" className="font-mono">
                      {tool}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="border-b border-border px-4 py-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-body-sm">
            <FileText size={14} className="text-muted-foreground shrink-0" />
            <span className="ui-meta-label">File:</span>
            <Button
              type="button"
              variant="link"
              size="bare"
              className="min-w-0 !justify-start font-mono ui-meta-text text-foreground"
              title={skill.path}
              onClick={() => void window.api.showInFinder(skill.path)}
            >
              {skill.path}
            </Button>
          </div>
          {(sourceKind === "library" || sourceKind === "plugin" || sourceKind === "user") && (
            <div className="flex items-center gap-2 text-body-sm">
              {sourceKind === "plugin" ? (
                <Package size={14} className="text-muted-foreground shrink-0" />
              ) : (
                <FolderOpen size={14} className="text-muted-foreground shrink-0" />
              )}
              <span className="ui-meta-label">Source:</span>
              <span className="text-foreground">{sourceLabel}</span>
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto ui-scroll-region px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 size={18} className="mr-2 animate-spin" />
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
          <div className="py-8 text-center text-body-sm text-muted-foreground">
            No content available.
          </div>
        )}
      </div>

      {onAddToWorkflow && (
        <div className="border-t border-border px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onAddToWorkflow}
            disabled={!canAddToWorkflow}
            title={addDisabledReason || "Add this skill to the current workflow."}
            className="w-full"
          >
            Add to workflow
          </Button>
        </div>
      )}
    </aside>
  )
}
