import { useEffect, useRef } from "react"
import { useAtom } from "jotai"
import { ChatMessageBubble } from "./ChatMessageBubble"
import { cn } from "@/lib/cn"
import {
  chatScrollTopByWorkflowAtom,
  selectedWorkflowPathAtom,
  type ChatMessageDisplay,
} from "@/lib/store"

interface ChatMessagesProps {
  messages: ChatMessageDisplay[]
  status: "idle" | "thinking" | "streaming" | "error"
}

export function ChatMessages({ messages, status }: ChatMessagesProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [chatScrollTopByWorkflow, setChatScrollTopByWorkflow] = useAtom(chatScrollTopByWorkflowAtom)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleScroll = () => {
      const threshold = 80
      isNearBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < threshold
      if (selectedWorkflowPath) {
        setChatScrollTopByWorkflow((prev) => ({ ...prev, [selectedWorkflowPath]: el.scrollTop }))
      }
    }

    el.addEventListener("scroll", handleScroll)
    return () => el.removeEventListener("scroll", handleScroll)
  }, [selectedWorkflowPath, setChatScrollTopByWorkflow])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const savedScrollTop = selectedWorkflowPath ? chatScrollTopByWorkflow[selectedWorkflowPath] : null
    if (typeof savedScrollTop === "number" && savedScrollTop > 0) {
      el.scrollTop = savedScrollTop
      isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      return
    }
    el.scrollTop = el.scrollHeight
    isNearBottomRef.current = true
  }, [selectedWorkflowPath])

  // Auto-scroll when new messages arrive or content streams
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight
      if (selectedWorkflowPath) {
        setChatScrollTopByWorkflow((prev) => ({ ...prev, [selectedWorkflowPath]: el.scrollTop }))
      }
    }
  }, [messages, selectedWorkflowPath, setChatScrollTopByWorkflow, status])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center">
        <div className="text-muted-foreground/60">
          <p className="text-body-md font-medium mb-1">Pipeline Co-pilot</p>
          <p className="ui-meta-text leading-relaxed">
            Ask me to add skills, build pipelines,
            <br />
            or search through your skill library.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-0">
      {messages.map((msg, index) => {
        const prev = messages[index - 1]
        const next = messages[index + 1]
        const isTurnMessage = msg.role === "user" || msg.role === "assistant"
        const groupedWithPrevious = Boolean(
          isTurnMessage
          && prev
          && prev.role === msg.role,
        )
        const groupedWithNext = Boolean(
          isTurnMessage
          && next
          && next.role === msg.role,
        )

        return (
          <div
            key={msg.id}
            className={cn(
              groupedWithPrevious ? "pt-1" : "pt-3",
              index === 0 && "pt-0",
            )}
          >
            <ChatMessageBubble
              message={msg}
              groupedWithPrevious={groupedWithPrevious}
              groupedWithNext={groupedWithNext}
            />
          </div>
        )
      })}
    </div>
  )
}
