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
  Loader2,
  RefreshCw,
  ArrowUpRight,
  Trash2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { PageHeader, PageShell, SectionHeading } from "@/components/ui/page-shell"
import { Textarea } from "@/components/ui/textarea"
import {
  currentWorkflowAtom,
  inboxNotificationsAtom,
  mainViewAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  type InboxNotification,
  workflowSavedSnapshotAtom,
} from "@/lib/store"
import { formatRelativeTime } from "@/components/sidebar/projectSidebarUtils"
import { useInboxNotifications } from "@/hooks/useInboxNotifications"
import { useChainExecution } from "@/hooks/useChainExecution"
import { cn } from "@/lib/cn"
import { getRuntimeStagePresentation } from "@/lib/runtime-flow-labels"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { selectedPastRunAtom } from "@/features/execution"
import type { HumanTaskField, HumanTaskSnapshot, HumanTaskSummary, RunResult, Workflow } from "@shared/types"

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

function buildInitialHumanTaskAnswers(task: HumanTaskSnapshot | null): Record<string, unknown> {
  if (!task) return {}
  if (task.latestResponse?.answers) return task.latestResponse.answers
  return task.request.defaults || {}
}

function normalizeHumanFieldValue(field: HumanTaskField, value: unknown): string | number | boolean | string[] {
  if (field.type === "boolean") return Boolean(value)
  if (field.type === "number") return typeof value === "number" ? value : Number(value || 0)
  if (field.type === "multiselect") return Array.isArray(value) ? value.map(String) : []
  return typeof value === "string" ? value : value == null ? "" : JSON.stringify(value, null, 2)
}

function taskSelectionKey(task: Pick<HumanTaskSummary, "workspace" | "taskId">) {
  return `${task.workspace}::${task.taskId}`
}

function compactTaskText(value?: string | null, maxLength = 140): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim()
  if (!normalized) return null
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1)}…`
}

function primaryTaskFieldLabel(task: Pick<HumanTaskSnapshot, "request"> | null): string | null {
  const firstField = task?.request.fields[0]
  if (!firstField?.label) return null
  return firstField.label.trim() || null
}

function taskKindLabel(task: Pick<HumanTaskSummary, "kind"> | Pick<HumanTaskSnapshot, "kind">): string {
  return task.kind === "approval" ? "Review" : "Input"
}

function taskActionCopy(task: HumanTaskSnapshot): string {
  if (task.kind === "approval") {
    return task.allowEdit
      ? "Review the proposed content, adjust it if needed, then continue the run."
      : "Review the checkpoint and decide whether the run should continue."
  }
  return "Provide the missing input this flow needs before it can continue."
}

function taskCardPreview(task: HumanTaskSummary | HumanTaskSnapshot): string | null {
  const summary = compactTaskText(task.summary, 120)
  if (summary) return summary
  return compactTaskText(task.instructions, 120)
}

interface TaskStageMeta {
  title: string
  group: string
}

function taskStageKey(task: Pick<HumanTaskSummary, "workflowPath" | "nodeId"> | Pick<HumanTaskSnapshot, "workflowPath" | "nodeId">): string | null {
  if (!task.workflowPath) return null
  return `${task.workflowPath}::${task.nodeId}`
}

function deriveTaskStageMeta(workflow: Workflow, nodeId: string): TaskStageMeta | null {
  const node = workflow.nodes.find((candidate) => candidate.id === nodeId)
  if (!node) return null
  const presentation = getRuntimeStagePresentation(node, { fallbackId: node.id })
  return {
    title: presentation.title,
    group: presentation.group,
  }
}

export function NotificationsPage() {
  const [notifications] = useAtom(inboxNotificationsAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setWorkflow] = useAtom(currentWorkflowAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const { continueWithWorkflow } = useChainExecution()
  const { markRead, markAllRead, clearAll } = useInboxNotifications()
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)
  const [sourceFilter, setSourceFilter] = useState<"all" | InboxNotification["source"]>("all")
  const [humanTasks, setHumanTasks] = useState<HumanTaskSummary[]>([])
  const [humanTasksLoading, setHumanTasksLoading] = useState(false)
  const [humanTasksError, setHumanTasksError] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<HumanTaskSnapshot | null>(null)
  const [taskAnswers, setTaskAnswers] = useState<Record<string, unknown>>({})
  const [taskLoading, setTaskLoading] = useState(false)
  const [taskSubmitting, setTaskSubmitting] = useState(false)
  const [taskStageMetaByKey, setTaskStageMetaByKey] = useState<Record<string, TaskStageMeta>>({})

  useEffect(() => {
    markAllRead()
  }, [markAllRead])

  const refreshHumanTasks = async () => {
    setHumanTasksLoading(true)
    setHumanTasksError(null)
    try {
      const tasks = await window.api.listHumanTasks(selectedProject || undefined)
      setHumanTasks(tasks)
      setSelectedTaskId((previous) => {
        if (previous && tasks.some((task) => taskSelectionKey(task) === previous)) {
          return previous
        }
        return tasks[0] ? taskSelectionKey(tasks[0]) : null
      })
    } catch (error) {
      setHumanTasksError(error instanceof Error ? error.message : String(error))
      setHumanTasks([])
      setSelectedTaskId(null)
    } finally {
      setHumanTasksLoading(false)
    }
  }

  useEffect(() => {
    void refreshHumanTasks()
    // selectedTask is intentionally excluded so project changes don't retrigger on local detail updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject])

  useEffect(() => {
    const summary = selectedTaskId
      ? humanTasks.find((task) => taskSelectionKey(task) === selectedTaskId) || null
      : null
    if (!summary) {
      setSelectedTask(null)
      setTaskAnswers({})
      return
    }
    setTaskLoading(true)
    void window.api.loadHumanTask(summary.taskId, summary.workspace).then((task) => {
      setSelectedTask(task)
      setTaskAnswers(buildInitialHumanTaskAnswers(task))
    }).catch((error) => {
      setHumanTasksError(error instanceof Error ? error.message : String(error))
      setSelectedTask(null)
      setTaskAnswers({})
    }).finally(() => {
      setTaskLoading(false)
    })
  }, [humanTasks, selectedTaskId])

  useEffect(() => {
    const workflowPaths = Array.from(new Set(
      humanTasks
        .map((task) => task.workflowPath)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ))
    if (workflowPaths.length === 0) {
      setTaskStageMetaByKey({})
      return
    }

    let cancelled = false
    void Promise.all(
      workflowPaths.map(async (workflowPath) => ({
        workflowPath,
        workflow: await window.api.loadWorkflow(workflowPath),
      })),
    ).then((loaded) => {
      if (cancelled) return
      const next: Record<string, TaskStageMeta> = {}
      for (const task of humanTasks) {
        const key = taskStageKey(task)
        if (!key || !task.workflowPath) continue
        const workflow = loaded.find((entry) => entry.workflowPath === task.workflowPath)?.workflow
        if (!workflow) continue
        const meta = deriveTaskStageMeta(workflow, task.nodeId)
        if (meta) next[key] = meta
      }
      setTaskStageMetaByKey(next)
    }).catch(() => {
      if (!cancelled) setTaskStageMetaByKey({})
    })

    return () => {
      cancelled = true
    }
  }, [humanTasks])

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
  const openHumanTaskCount = humanTasks.length
  const selectedTaskStageMeta = selectedTask ? taskStageMetaByKey[taskStageKey(selectedTask) || ""] || null : null

  const handleOpenWorkflow = async () => {
    if (!selectedTask?.workflowPath) return
    const workflow = await window.api.loadWorkflow(selectedTask.workflowPath)
    setWorkflow(workflow)
    setWorkflowSavedSnapshot(workflowSnapshot(workflow))
    setSelectedWorkflowPath(selectedTask.workflowPath)
    setSelectedPastRun({
      runId: selectedTask.sourceRunId,
      status: "blocked",
      workflowName: selectedTask.workflowName,
      workflowPath: selectedTask.workflowPath,
      startedAt: selectedTask.createdAt,
      completedAt: selectedTask.updatedAt,
      reportPath: "",
      workspace: selectedTask.workspace,
    })
    setMainView("thread")
  }

  const handleTaskFieldChange = (field: HumanTaskField, value: unknown) => {
    setTaskAnswers((previous) => ({
      ...previous,
      [field.id]: value,
    }))
  }

  const hasMissingRequiredAnswers = (task: HumanTaskSnapshot) => {
    for (const field of task.request.fields) {
      if (!field.required) continue
      const value = taskAnswers[field.id]
      const missing = field.type === "multiselect"
        ? !Array.isArray(value) || value.length === 0
        : field.type === "boolean"
          ? value === undefined
          : value === null || value === undefined || String(value).trim().length === 0
      if (missing) return true
    }
    return false
  }

  const toContinuationRun = (task: HumanTaskSnapshot): RunResult => ({
    runId: task.sourceRunId,
    status: "blocked",
    workflowName: task.workflowName,
    workflowPath: task.workflowPath,
    startedAt: task.createdAt,
    completedAt: task.updatedAt,
    reportPath: "",
    workspace: task.workspace,
  })

  const submitSelectedTask = async () => {
    if (!selectedTask) return false
    if (hasMissingRequiredAnswers(selectedTask)) return false
    const ok = await window.api.submitHumanTask(selectedTask.taskId, selectedTask.workspace, {
      answers: taskAnswers,
    })
    return ok
  }

  const handleSubmitHumanTask = async () => {
    if (!selectedTask) return
    setTaskSubmitting(true)
    try {
      const ok = await submitSelectedTask()
      if (ok) {
        await refreshHumanTasks()
      }
    } finally {
      setTaskSubmitting(false)
    }
  }

  const handleSubmitAndContinue = async () => {
    if (!selectedTask?.workflowPath) return
    setTaskSubmitting(true)
    try {
      const ok = await submitSelectedTask()
      if (!ok) return
      const workflow = await window.api.loadWorkflow(selectedTask.workflowPath)
      setWorkflow(workflow)
      setWorkflowSavedSnapshot(workflowSnapshot(workflow))
      setSelectedWorkflowPath(selectedTask.workflowPath)
      setSelectedPastRun(toContinuationRun(selectedTask))
      const started = await continueWithWorkflow(
        toContinuationRun(selectedTask),
        workflow,
        selectedTask.workflowPath,
      )
      if (started) {
        setMainView("thread")
        return
      }
      await refreshHumanTasks()
    } finally {
      setTaskSubmitting(false)
    }
  }

  const handleRejectHumanTask = async () => {
    if (!selectedTask) return
    setTaskSubmitting(true)
    try {
      const ok = await window.api.rejectHumanTask(selectedTask.taskId, selectedTask.workspace)
      if (ok) {
        await refreshHumanTasks()
      }
    } finally {
      setTaskSubmitting(false)
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Inbox"
        subtitle="Open human tasks live here alongside durable workflow, batch, agent, and system events."
        actions={(
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { void refreshHumanTasks() }}
            >
              <RefreshCw size={14} />
              Refresh
            </Button>
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
          title="Needs your input"
          meta={(
            <span className="ui-meta-text text-muted-foreground">
              {humanTasksLoading ? "Loading..." : `${openHumanTaskCount} open`}
            </span>
          )}
        />

        {humanTasksError ? (
          <article className="rounded-lg surface-panel px-4 py-3 text-body-sm text-status-danger">
            {humanTasksError}
          </article>
        ) : openHumanTaskCount === 0 && !humanTasksLoading ? (
          <article className="rounded-lg surface-panel px-5 py-10 text-center">
            <div className="mx-auto flex h-control-lg w-control-lg items-center justify-center rounded-lg border border-hairline bg-surface-2/80">
              <Inbox size={20} className="text-muted-foreground" />
            </div>
            <p className="mt-4 text-body-md font-medium text-foreground">No open review or input tasks</p>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Flows that need structured answers or review gates will appear here.
            </p>
          </article>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="space-y-3">
              {humanTasks.map((task) => {
                const stageMeta = taskStageMetaByKey[taskStageKey(task) || ""] || null
                return (
                <button
                  key={`${task.workspace}:${task.taskId}`}
                  type="button"
                  onClick={() => setSelectedTaskId(taskSelectionKey(task))}
                  className={cn(
                    "w-full rounded-lg surface-panel px-4 py-3 text-left transition-colors",
                    selectedTaskId === taskSelectionKey(task) && "ring-1 ring-primary/20",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <h2 className="min-w-0 flex-1 truncate text-body-md font-semibold text-foreground">{task.title}</h2>
                    <Badge variant="outline">{taskKindLabel(task)}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 ui-meta-text text-muted-foreground">
                    <span>{task.workflowName}</span>
                    {stageMeta && <span>{stageMeta.title}</span>}
                    {!stageMeta && task.kind === "approval" && <span>Review gate</span>}
                  </div>
                  {stageMeta && (
                    <p className="mt-1 ui-meta-text text-muted-foreground">{stageMeta.group}</p>
                  )}
                  {taskCardPreview(task) && (
                    <p className="mt-2 line-clamp-2 text-body-sm text-muted-foreground">{taskCardPreview(task)}</p>
                  )}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="ui-meta-text text-muted-foreground">{formatRelativeTime(task.createdAt)}</span>
                    <span className="ui-meta-text text-muted-foreground">Open</span>
                  </div>
                </button>
                )
              })}
            </div>

            <article className="rounded-lg surface-panel px-5 py-4">
              {taskLoading ? (
                <div className="flex min-h-[260px] items-center justify-center text-muted-foreground">
                  <Loader2 size={18} className="mr-2 animate-spin" />
                  Loading task...
                </div>
              ) : !selectedTask ? (
                <div className="flex min-h-[260px] items-center justify-center text-body-md text-muted-foreground">
                  Select a task to inspect it.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-title-sm font-semibold text-foreground">{selectedTask.title}</h2>
                        <Badge variant="outline">{taskKindLabel(selectedTask)}</Badge>
                        {selectedTaskStageMeta && (
                          <Badge variant="outline" className="text-muted-foreground">
                            {selectedTaskStageMeta.title}
                          </Badge>
                        )}
                        {primaryTaskFieldLabel(selectedTask) && (
                          <Badge variant="outline" className="text-muted-foreground">
                            {primaryTaskFieldLabel(selectedTask)}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-body-sm text-muted-foreground">
                        Workflow: {selectedTask.workflowName}
                        {selectedTaskStageMeta ? ` · ${selectedTaskStageMeta.group}` : ""}
                      </p>
                      <p className="mt-2 text-body-sm text-muted-foreground">{taskActionCopy(selectedTask)}</p>
                      {selectedTask.instructions && compactTaskText(selectedTask.instructions, 999) !== compactTaskText(selectedTask.summary, 999) && (
                        <p className="mt-2 text-body-sm text-muted-foreground whitespace-pre-wrap">{selectedTask.instructions}</p>
                      )}
                      <p className="mt-2 ui-meta-text text-muted-foreground">
                        If the run is live it will continue immediately. If it was reopened from history, you can resume it after submitting here.
                      </p>
                    </div>
                    {selectedTask.workflowPath && (
                      <Button type="button" variant="outline" size="sm" onClick={() => { void handleOpenWorkflow() }}>
                        <ArrowUpRight size={14} />
                        Open workflow
                      </Button>
                    )}
                  </div>

                  {selectedTask.summary && (
                    <div className="rounded-lg border border-hairline bg-surface-2/80 px-3 py-2 text-body-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedTask.summary}
                    </div>
                  )}

                  <div className="space-y-4">
                    {selectedTask.request.fields.map((field) => {
                      const value = normalizeHumanFieldValue(field, taskAnswers[field.id])

                      if (field.type === "boolean") {
                        return (
                          <div key={field.id} className="flex items-start justify-between gap-4 rounded-lg border border-hairline bg-surface-2/60 px-3 py-3">
                            <div className="min-w-0">
                              <p className="text-body-sm font-medium text-foreground">{field.label}</p>
                              {field.description && (
                                <p className="mt-1 text-body-sm text-muted-foreground">{field.description}</p>
                              )}
                            </div>
                            <Checkbox
                              checked={Boolean(value)}
                              onCheckedChange={(next) => handleTaskFieldChange(field, Boolean(next))}
                            />
                          </div>
                        )
                      }

                      if (field.type === "select") {
                        return (
                          <div key={field.id} className="space-y-2">
                            <label className="ui-meta-text text-muted-foreground">{field.label}</label>
                            <select
                              className="ui-input w-full"
                              value={String(value)}
                              onChange={(event) => handleTaskFieldChange(field, event.target.value)}
                            >
                              <option value="">Select...</option>
                              {(field.options || []).map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                        )
                      }

                      if (field.type === "multiselect") {
                        const selectedValues = Array.isArray(value) ? value : []
                        return (
                          <div key={field.id} className="space-y-2">
                            <label className="ui-meta-text text-muted-foreground">{field.label}</label>
                            <div className="space-y-2 rounded-lg border border-hairline bg-surface-2/60 px-3 py-3">
                              {(field.options || []).map((option) => {
                                const checked = selectedValues.includes(option.value)
                                return (
                                  <label key={option.value} className="flex items-center gap-2 text-body-sm text-foreground">
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(next) => {
                                        const nextValues = next
                                          ? [...selectedValues, option.value]
                                          : selectedValues.filter((item) => item !== option.value)
                                        handleTaskFieldChange(field, nextValues)
                                      }}
                                    />
                                    {option.label}
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        )
                      }

                      if (field.type === "textarea" || field.type === "json") {
                        return (
                          <div key={field.id} className="space-y-2">
                            <label className="ui-meta-text text-muted-foreground">{field.label}</label>
                            <Textarea
                              value={String(value)}
                              placeholder={field.placeholder}
                              className="min-h-[120px]"
                              onChange={(event) => handleTaskFieldChange(field, event.target.value)}
                            />
                          </div>
                        )
                      }

                      return (
                        <div key={field.id} className="space-y-2">
                          <label className="ui-meta-text text-muted-foreground">{field.label}</label>
                          <Input
                            type={field.type === "number" ? "number" : "text"}
                            value={field.type === "number" ? String(value) : String(value)}
                            placeholder={field.placeholder}
                            onChange={(event) => handleTaskFieldChange(
                              field,
                              field.type === "number" ? Number(event.target.value) : event.target.value,
                            )}
                          />
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      type="button"
                      onClick={() => { void handleSubmitHumanTask() }}
                      disabled={taskSubmitting}
                    >
                      {taskSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      {selectedTask.kind === "approval"
                        ? (selectedTask.allowEdit ? "Approve" : "Approve")
                        : "Submit response"}
                    </Button>
                    {selectedTask.workflowPath && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => { void handleSubmitAndContinue() }}
                        disabled={taskSubmitting}
                      >
                        <ArrowUpRight size={14} />
                        {selectedTask.kind === "approval" ? "Approve and continue run" : "Submit and continue run"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { void handleRejectHumanTask() }}
                      disabled={taskSubmitting}
                    >
                      {selectedTask.kind === "approval" ? "Reject" : "Reject task"}
                    </Button>
                  </div>
                </div>
              )}
            </article>
          </div>
        )}
      </section>

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
                variant={active ? "secondary" : "outline"}
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
