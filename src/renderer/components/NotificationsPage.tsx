import { useEffect, useMemo, useState } from "react"
import { useAtom } from "jotai"
import {
  AlertTriangle,
  BellRing,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock3,
  Inbox,
  Trash2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PageHeader, PageShell, SectionHeading } from "@/components/ui/page-shell"
import { inboxNotificationsAtom, type InboxNotification } from "@/lib/store"
import { formatRelativeTime } from "@/components/sidebar/projectSidebarUtils"
import { useInboxNotifications } from "@/hooks/useInboxNotifications"
import { cn } from "@/lib/cn"

const LEVEL_META: Record<InboxNotification["level"], { icon: typeof CheckCircle2; tone: string; badge: string }> = {
  info: {
    icon: Clock3,
    tone: "text-muted-foreground",
    badge: "border-hairline text-muted-foreground",
  },
  success: {
    icon: CheckCircle2,
    tone: "text-status-success",
    badge: "border-status-success/30 text-status-success",
  },
  warning: {
    icon: AlertTriangle,
    tone: "text-status-warning",
    badge: "border-status-warning/30 text-status-warning",
  },
  error: {
    icon: AlertTriangle,
    tone: "text-status-danger",
    badge: "border-status-danger/30 text-status-danger",
  },
}

const SOURCE_LABELS: Record<InboxNotification["source"], string> = {
  workflow: "Workflow",
  batch: "Batch",
  agent: "Agent",
  system: "System",
}

export function NotificationsPage() {
  const [notifications] = useAtom(inboxNotificationsAtom)
  const { markRead, markAllRead, clearAll } = useInboxNotifications()
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)
  const [sourceFilter, setSourceFilter] = useState<"all" | InboxNotification["source"]>("all")

  useEffect(() => {
    markAllRead()
  }, [markAllRead])

  const visibleNotifications = useMemo(
    () =>
      notifications.filter((notification) => {
        if (showUnreadOnly && notification.read) return false
        if (sourceFilter !== "all" && notification.source !== sourceFilter) return false
        return true
      }),
    [notifications, showUnreadOnly, sourceFilter],
  )

  const unreadCount = notifications.filter((notification) => !notification.read).length

  return (
    <PageShell>
      <PageHeader
        title="Inbox"
        subtitle="Durable memory for workflow, batch, agent, and system events that outlive toasts."
        actions={(
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowUnreadOnly((value) => !value)}
            >
              <BellRing size={14} />
              {showUnreadOnly ? "Show all" : "Unread only"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => markAllRead()}
              disabled={unreadCount === 0}
            >
              <CheckCheck size={14} />
              Mark all read
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => clearAll()}
              disabled={notifications.length === 0}
            >
              <Trash2 size={14} />
              Clear
            </Button>
          </>
        )}
      />

      <section className="space-y-3">
        <SectionHeading
          title="Recent events"
          meta={(
            <span className="ui-meta-text text-muted-foreground">
              {notifications.length} total · {unreadCount} unread
            </span>
          )}
        />

        <div className="flex flex-wrap gap-2">
          {(["all", "workflow", "batch", "agent", "system"] as const).map((value) => {
            const active = sourceFilter === value
            const label = value === "all" ? "All" : SOURCE_LABELS[value]
            return (
              <Button
                key={value}
                type="button"
                variant={active ? "default" : "outline"}
                size="sm"
                onClick={() => setSourceFilter(value)}
              >
                {label}
              </Button>
            )
          })}
        </div>

        {visibleNotifications.length === 0 ? (
          <article className="rounded-lg surface-panel px-5 py-10 text-center">
            <div className="mx-auto flex h-control-lg w-control-lg items-center justify-center rounded-lg border border-hairline bg-surface-2/80">
              <Inbox size={20} className="text-muted-foreground" />
            </div>
            <p className="mt-4 text-body-md font-medium text-foreground">Inbox is clear</p>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Important confirmations and errors will accumulate here as you work.
            </p>
          </article>
        ) : (
          <div className="space-y-3">
            {visibleNotifications.map((notification) => {
              const levelMeta = LEVEL_META[notification.level]
              const LevelIcon = levelMeta.icon

              return (
                <article
                  key={notification.id}
                  className={cn(
                    "rounded-lg surface-panel px-4 py-3",
                    !notification.read && "ring-1 ring-primary/15",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-hairline bg-surface-2/80", levelMeta.tone)}>
                      <LevelIcon size={16} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-body-md font-semibold text-foreground">{notification.title}</h2>
                        <Badge variant="outline" className={levelMeta.badge}>
                          {SOURCE_LABELS[notification.source]}
                        </Badge>
                        {!notification.read && (
                          <Badge variant="secondary">Unread</Badge>
                        )}
                        <span className="ui-meta-text text-muted-foreground">
                          {formatRelativeTime(notification.createdAt)}
                        </span>
                      </div>

                      {notification.description && (
                        <p className="mt-1 text-body-sm text-muted-foreground whitespace-pre-wrap">
                          {notification.description}
                        </p>
                      )}
                    </div>

                    {!notification.read && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => markRead(notification.id)}
                      >
                        <Check size={14} />
                        Mark read
                      </Button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </PageShell>
  )
}
