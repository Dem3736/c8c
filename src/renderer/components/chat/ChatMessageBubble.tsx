import { useState } from "react"
import { AlertCircle, ChevronDown, ChevronRight, CheckCircle2, Wrench, Loader2, Bot } from "lucide-react"
import { cn } from "@/lib/cn"
import type { ChatMessageDisplay } from "@/lib/store"
import ReactMarkdown, { type Components as MarkdownComponents } from "react-markdown"
import remarkGfm from "remark-gfm"

interface ChatMessageBubbleProps {
  message: ChatMessageDisplay
  groupedWithPrevious?: boolean
  groupedWithNext?: boolean
}

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
          if (!safeHref) {
            event.preventDefault()
          }
        }}
      >
        {children}
      </a>
    )
  },
}

function compactPreview(value: string | undefined, maxLen = 120): string | null {
  if (!value) return null
  const firstLine = value
    .replace(/\s+/g, " ")
    .trim()
  if (!firstLine) return null
  if (firstLine.length <= maxLen) return firstLine
  return `${firstLine.slice(0, maxLen - 1)}…`
}

export function ChatMessageBubble({
  message,
  groupedWithPrevious = false,
  groupedWithNext = false,
}: ChatMessageBubbleProps) {
  const [toolExpanded, setToolExpanded] = useState(false)

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className={cn(
          "max-w-[85%] rounded-lg bg-primary/10 border border-primary/20 px-3 py-2",
          groupedWithPrevious && "rounded-tr-md",
          groupedWithNext && "rounded-br-md",
        )}>
          <p className="text-body-md whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    )
  }

  if (message.role === "assistant") {
    return (
      <div className="flex gap-2">
        <div className="shrink-0 w-control-xs h-control-xs mt-0.5">
          {!groupedWithPrevious && (
            <div className="w-control-xs h-control-xs rounded-full bg-surface-3 flex items-center justify-center">
              <Bot size={13} className="text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="max-w-[90%]">
          {message.streaming && !message.content ? (
            <div className="flex items-center gap-2 ui-meta-text text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              Thinking...
            </div>
          ) : (
            <div className="prose-c8c">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (message.role === "tool_call") {
    const preview = compactPreview(
      message.toolInput ? JSON.stringify(message.toolInput) : undefined,
    )

    return (
      <div className="ml-8 rounded-lg border border-status-info/20 bg-status-info/5">
        <button
          type="button"
          onClick={() => setToolExpanded(!toolExpanded)}
          className={cn(
            "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg",
            "ui-meta-text text-status-info ui-transition-colors ui-motion-fast hover:bg-status-info/10",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-control-xs w-control-xs shrink-0 items-center justify-center rounded-md bg-status-info/15">
              <Wrench size={11} />
            </span>
            <span className="min-w-0 text-left">
              <span className="block font-medium truncate">{message.toolName || "tool"}</span>
              <span className="block text-sidebar-label text-muted-foreground">Running tool</span>
            </span>
          </span>
          {toolExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        {!toolExpanded && preview && (
          <div className="px-2.5 pb-2 ui-meta-text text-muted-foreground truncate">
            {preview}
          </div>
        )}

        {toolExpanded && message.toolInput && (
          <pre className="mx-2.5 mb-2 ui-meta-text font-mono rounded-md border border-hairline/40 bg-surface-2/70 p-2 overflow-x-auto max-w-full max-h-[220px] overflow-y-auto">
            {JSON.stringify(message.toolInput, null, 2)}
          </pre>
        )}
      </div>
    )
  }

  if (message.role === "tool_result") {
    const body = message.toolError || message.toolOutput || message.content
    const preview = compactPreview(body)
    const isError = Boolean(message.toolError)

    return (
      <div className={cn(
        "ml-8 rounded-lg border",
        isError
          ? "border-status-danger/30 bg-status-danger/10"
          : "border-status-success/25 bg-status-success/10",
      )}>
        <button
          type="button"
          onClick={() => setToolExpanded(!toolExpanded)}
          className={cn(
            "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg",
            "ui-meta-text ui-transition-colors ui-motion-fast",
            isError
              ? "text-status-danger hover:bg-status-danger/10"
              : "text-status-success hover:bg-status-success/10",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className={cn(
              "inline-flex h-control-xs w-control-xs shrink-0 items-center justify-center rounded-md",
              isError ? "bg-status-danger/15" : "bg-status-success/15",
            )}>
              {isError ? <AlertCircle size={11} /> : <CheckCircle2 size={11} />}
            </span>
            <span className="min-w-0 text-left">
              <span className="block font-medium truncate">{message.toolName} result</span>
              <span className={cn(
                "block text-sidebar-label",
                isError ? "text-status-danger/75" : "text-status-success/75",
              )}>
                {isError ? "Error" : "Success"}
              </span>
            </span>
          </span>
          {toolExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        {!toolExpanded && preview && (
          <div className={cn(
            "px-2.5 pb-2 ui-meta-text truncate",
            isError ? "text-status-danger/80" : "text-muted-foreground",
          )}>
            {preview}
          </div>
        )}

        {toolExpanded && (
          <pre className={cn(
            "mx-2.5 mb-2 ui-meta-text font-mono rounded-md p-2 overflow-x-auto max-w-full max-h-[220px] overflow-y-auto border",
            isError
              ? "bg-status-danger/10 border-status-danger/30 text-status-danger"
              : "bg-surface-2/70 border-hairline/40 text-muted-foreground",
          )}>
            {body}
          </pre>
        )}
      </div>
    )
  }

  return null
}
