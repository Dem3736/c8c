import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAtom, useAtomValue } from "jotai"
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
import { ScopeBanner } from "@/components/ui/scope-banner"
import { Textarea } from "@/components/ui/textarea"
import {
  currentWorkflowAtom,
  factoryBetaEnabledAtom,
  inboxNotificationsAtom,
  mainViewAtom,
  selectedFactoryIdAtom,
  selectedProjectAtom,
  selectedFactoryCaseIdAtom,
  selectedInboxTaskKeyAtom,
  selectedWorkflowPathAtom,
  type InboxNotification,
  workflowTemplateContextsAtom,
  workflowSavedSnapshotAtom,
} from "@/lib/store"
import { formatRelativeTime } from "@/components/sidebar/projectSidebarUtils"
import { useInboxNotifications } from "@/hooks/useInboxNotifications"
import { useChainExecution } from "@/hooks/useChainExecution"
import { cn } from "@/lib/cn"
import { getRuntimeStagePresentation } from "@/lib/runtime-flow-labels"
import { deriveArtifactCaseKey } from "@/lib/workflow-entry"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { selectedPastRunAtom } from "@/features/execution"
import type { ArtifactRecord, HumanTaskField, HumanTaskSnapshot, HumanTaskSummary, RunResult, Workflow } from "@shared/types"

const LEVEL_META: Record<InboxNotification["level"], { icon: typeof CheckCircle2; tone: string; badgeClass: string }> = {
  info: {
    icon: Clock3,
    tone: "text-status-info",
    badgeClass: "ui-status-badge-info",
  },
  success: {
    icon: CheckCircle2,
    tone: "text-status-success",
    badgeClass: "ui-status-badge-success",
  },
  warning: {
    icon: AlertTriangle,
    tone: "text-status-warning",
    badgeClass: "ui-status-badge-warning",
  },
  error: {
    icon: AlertTriangle,
    tone: "text-status-danger",
    badgeClass: "ui-status-badge-danger",
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

interface CaseOption {
  id: string
  label: string
  updatedAt: number
  factoryId?: string | null
  factoryLabel?: string | null
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
  const [factoryBetaEnabled] = useAtom(factoryBetaEnabledAtom)
  const [selectedFactoryId] = useAtom(selectedFactoryIdAtom)
  const [selectedCaseId, setSelectedCaseId] = useAtom(selectedFactoryCaseIdAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setWorkflow] = useAtom(currentWorkflowAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const workflowTemplateContexts = useAtomValue(workflowTemplateContextsAtom)
  const { continueWithWorkflow } = useChainExecution()
  const { markRead, markAllRead, clearAll } = useInboxNotifications()
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)
  const [sourceFilter, setSourceFilter] = useState<"all" | InboxNotification["source"]>("all")
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([])
  const [artifactsLoading, setArtifactsLoading] = useState(false)
  const [humanTasks, setHumanTasks] = useState<HumanTaskSummary[]>([])
  const [humanTasksLoading, setHumanTasksLoading] = useState(false)
  const [humanTasksError, setHumanTasksError] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useAtom(selectedInboxTaskKeyAtom)
  const [selectedTask, setSelectedTask] = useState<HumanTaskSnapshot | null>(null)
  const [taskAnswers, setTaskAnswers] = useState<Record<string, unknown>>({})
  const [taskLoading, setTaskLoading] = useState(false)
  const [taskSubmitting, setTaskSubmitting] = useState(false)
  const [taskStageMetaByKey, setTaskStageMetaByKey] = useState<Record<string, TaskStageMeta>>({})
  const humanTasksRequestIdRef = useRef(0)
  const artifactsRequestIdRef = useRef(0)
  const selectedTaskRequestIdRef = useRef(0)

  useEffect(() => {
    markAllRead()
  }, [markAllRead])

  const refreshHumanTasks = useCallback(async () => {
    const requestId = humanTasksRequestIdRef.current + 1
    humanTasksRequestIdRef.current = requestId
    setHumanTasksLoading(true)
    setHumanTasksError(null)
    try {
      const tasks = await window.api.listHumanTasks(selectedProject || undefined)
      if (humanTasksRequestIdRef.current !== requestId) return
      setHumanTasks(tasks)
    } catch (error) {
      if (humanTasksRequestIdRef.current !== requestId) return
      setHumanTasksError(error instanceof Error ? error.message : String(error))
      setHumanTasks([])
    } finally {
      if (humanTasksRequestIdRef.current !== requestId) return
      setHumanTasksLoading(false)
    }
  }, [selectedProject])

  const refreshArtifacts = useCallback(async () => {
    const requestId = artifactsRequestIdRef.current + 1
    artifactsRequestIdRef.current = requestId
    if (!selectedProject) {
      setArtifacts([])
      setArtifactsLoading(false)
      return
    }
    setArtifactsLoading(true)
    try {
      const nextArtifacts = await window.api.listProjectArtifacts(selectedProject)
      if (artifactsRequestIdRef.current !== requestId) return
      setArtifacts(nextArtifacts)
    } catch {
      if (artifactsRequestIdRef.current !== requestId) return
      setArtifacts([])
    } finally {
      if (artifactsRequestIdRef.current !== requestId) return
      setArtifactsLoading(false)
    }
  }, [selectedProject])

  useEffect(() => {
    void refreshHumanTasks()
    void refreshArtifacts()
    // selectedTask is intentionally excluded so project changes don't retrigger on local detail updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, refreshArtifacts, refreshHumanTasks])

  const caseScope = useMemo(() => {
    const caseByWorkflowPath = new Map<string, string>()
    const caseByRunId = new Map<string, string>()
    const caseMetaById = new Map<string, CaseOption>()
    const rememberCase = (
      id: string,
      label: string,
      updatedAt: number,
      factoryId?: string | null,
      factoryLabel?: string | null,
    ) => {
      const existing = caseMetaById.get(id)
      if (existing) {
        caseMetaById.set(id, {
          id,
          label: existing.label || label,
          updatedAt: Math.max(existing.updatedAt, updatedAt),
          factoryId: existing.factoryId || factoryId,
          factoryLabel: existing.factoryLabel || factoryLabel,
        })
        return
      }
      caseMetaById.set(id, { id, label, updatedAt, factoryId, factoryLabel })
    }

    for (const artifact of artifacts) {
      const caseId = deriveArtifactCaseKey(artifact)
      rememberCase(
        caseId,
        artifact.caseLabel || artifact.workflowName || artifact.title || "Case",
        artifact.updatedAt,
        artifact.factoryId,
        artifact.factoryLabel,
      )
      if (artifact.workflowPath) caseByWorkflowPath.set(artifact.workflowPath, caseId)
      caseByRunId.set(artifact.runId, caseId)
    }

    for (const [workflowKey, context] of Object.entries(workflowTemplateContexts)) {
      if (!context.caseId) continue
      rememberCase(
        context.caseId,
        context.caseLabel || context.workflowName || context.templateName || "Case",
        0,
        context.factoryId,
        context.factoryLabel,
      )
      if (context.workflowPath) {
        caseByWorkflowPath.set(context.workflowPath, context.caseId)
      } else if (workflowKey !== "__draft__") {
        caseByWorkflowPath.set(workflowKey, context.caseId)
      }
    }

    return {
      caseByWorkflowPath,
      caseByRunId,
      caseOptions: Array.from(caseMetaById.values()).sort((left, right) => right.updatedAt - left.updatedAt),
    }
  }, [artifacts, workflowTemplateContexts])

  const visibleCaseOptions = useMemo(
    () => selectedFactoryId
      ? caseScope.caseOptions.filter((entry) => entry.factoryId === selectedFactoryId)
      : caseScope.caseOptions,
    [caseScope.caseOptions, selectedFactoryId],
  )

  const selectedFactoryLabel = useMemo(() => {
    if (!selectedFactoryId) return null
    return visibleCaseOptions[0]?.factoryLabel
      || artifacts.find((artifact) => artifact.factoryId === selectedFactoryId)?.factoryLabel
      || (selectedFactoryId.startsWith("pack:") ? selectedFactoryId.replace(/^pack:/, "") : "Factory")
  }, [artifacts, selectedFactoryId, visibleCaseOptions])

  const caseIdByTaskKey = useMemo(() => {
    const next = new Map<string, string>()
    for (const task of humanTasks) {
      const caseId = (task.workflowPath && caseScope.caseByWorkflowPath.get(task.workflowPath))
        || caseScope.caseByRunId.get(task.sourceRunId)
      if (!caseId) continue
      next.set(taskSelectionKey(task), caseId)
    }
    return next
  }, [caseScope.caseByRunId, caseScope.caseByWorkflowPath, humanTasks])

  const caseLabelById = useMemo(
    () => new Map(caseScope.caseOptions.map((entry) => [entry.id, entry.label])),
    [caseScope.caseOptions],
  )

  const visibleHumanTasks = useMemo(() => {
    return humanTasks.filter((task) => {
      const taskCaseId = caseIdByTaskKey.get(taskSelectionKey(task)) || null
      if (selectedFactoryId) {
        const taskCase = caseScope.caseOptions.find((entry) => entry.id === taskCaseId)
        if (!taskCase || taskCase.factoryId !== selectedFactoryId) return false
      }
      if (selectedCaseId) {
        return taskCaseId === selectedCaseId
      }
      return true
    })
  }, [caseIdByTaskKey, caseScope.caseOptions, humanTasks, selectedCaseId, selectedFactoryId])

  const selectedCaseOption = useMemo(
    () => visibleCaseOptions.find((entry) => entry.id === selectedCaseId) || null,
    [selectedCaseId, visibleCaseOptions],
  )

  useEffect(() => {
    if (!selectedCaseId) return
    if (!visibleCaseOptions.some((entry) => entry.id === selectedCaseId)) {
      setSelectedCaseId(null)
    }
  }, [selectedCaseId, setSelectedCaseId, visibleCaseOptions])

  useEffect(() => {
    if (selectedTaskId && visibleHumanTasks.some((task) => taskSelectionKey(task) === selectedTaskId)) {
      return
    }
    setSelectedTaskId(visibleHumanTasks[0] ? taskSelectionKey(visibleHumanTasks[0]) : null)
  }, [selectedTaskId, setSelectedTaskId, visibleHumanTasks])

  useEffect(() => {
    const summary = selectedTaskId
      ? visibleHumanTasks.find((task) => taskSelectionKey(task) === selectedTaskId) || null
      : null
    if (!summary) {
      selectedTaskRequestIdRef.current += 1
      setSelectedTask(null)
      setTaskAnswers({})
      setTaskLoading(false)
      return
    }

    const requestId = selectedTaskRequestIdRef.current + 1
    selectedTaskRequestIdRef.current = requestId
    let cancelled = false

    setSelectedTask(null)
    setTaskAnswers({})
    setTaskLoading(true)
    void window.api.loadHumanTask(summary.taskId, summary.workspace).then((task) => {
      if (cancelled || selectedTaskRequestIdRef.current !== requestId) return
      setSelectedTask(task)
      setTaskAnswers(buildInitialHumanTaskAnswers(task))
    }).catch((error) => {
      if (cancelled || selectedTaskRequestIdRef.current !== requestId) return
      setHumanTasksError(error instanceof Error ? error.message : String(error))
      setSelectedTask(null)
      setTaskAnswers({})
    }).finally(() => {
      if (cancelled || selectedTaskRequestIdRef.current !== requestId) return
      setTaskLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [selectedTaskId, visibleHumanTasks])

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
  const openHumanTaskCount = visibleHumanTasks.length
  const selectedTaskStageMeta = selectedTask ? taskStageMetaByKey[taskStageKey(selectedTask) || ""] || null : null
  const selectedTaskPrimaryField = primaryTaskFieldLabel(selectedTask)

  const openWorkflowPath = useCallback(async (workflowPath: string) => {
    const workflow = await window.api.loadWorkflow(workflowPath)
    setWorkflow(workflow)
    setWorkflowSavedSnapshot(workflowSnapshot(workflow))
    setSelectedWorkflowPath(workflowPath)
    setSelectedPastRun(null)
    setMainView("thread")
  }, [setMainView, setSelectedPastRun, setSelectedWorkflowPath, setWorkflow, setWorkflowSavedSnapshot])

  const handleOpenWorkflow = async () => {
    if (!selectedTask?.workflowPath) return
    await openWorkflowPath(selectedTask.workflowPath)
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
  }

  const handleNotificationAction = async (notification: InboxNotification) => {
    if (!notification.action) return
    if (notification.action.kind === "open_workflow") {
      await openWorkflowPath(notification.action.workflowPath)
      markRead(notification.id)
      return
    }
    if (notification.action.kind === "open_inbox_task") {
      setSelectedTaskId(notification.action.taskKey)
      setMainView("inbox")
      markRead(notification.id)
    }
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
        subtitle={
          selectedCaseOption
            ? `Review open gates for ${selectedCaseOption.label} and keep up with important workflow, batch, agent, and system events.`
            : selectedFactoryLabel
              ? `Review open gates for ${selectedFactoryLabel} and keep up with important workflow, batch, agent, and system events.`
              : "Review open workflow tasks and keep up with important workflow, batch, agent, and system events."
        }
        actions={(
          <>
            {selectedCaseId && factoryBetaEnabled && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMainView("factory")}
              >
                <ArrowUpRight size={14} />
                Back to case
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { void refreshHumanTasks() }}
            >
              <RefreshCw size={14} />
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowUnreadOnly((value) => !value)}
            >
              <BellRing size={14} />
              {showUnreadOnly ? "Show all" : "Unread only"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => markAllRead()}
              disabled={unreadCount === 0}
            >
              <CheckCheck size={14} />
              Mark all read
            </Button>
            <Button
              type="button"
              variant="outline"
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

      {(selectedFactoryLabel || selectedCaseOption || visibleCaseOptions.length > 1) && (
        <section className="rounded-xl surface-panel p-4 space-y-3">
          {selectedFactoryLabel && !selectedCaseOption ? (
            <ScopeBanner
              eyebrow="Path scope"
              description={
                artifactsLoading
                  ? "Resolving factory scope..."
                  : `Showing ${openHumanTaskCount} open review gate${openHumanTaskCount === 1 ? "" : "s"} for ${selectedFactoryLabel}.`
              }
              actions={factoryBetaEnabled ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setMainView("factory")}>
                  <ArrowUpRight size={14} />
                  Back to factory
                </Button>
              ) : undefined}
            />
          ) : null}

          {selectedCaseOption ? (
            <ScopeBanner
              eyebrow="Case scope"
              description={
                artifactsLoading
                  ? "Resolving case lineage..."
                  : `Showing ${openHumanTaskCount} open gate${openHumanTaskCount === 1 ? "" : "s"} for ${selectedCaseOption.label}${selectedFactoryLabel ? ` inside ${selectedFactoryLabel}` : ""}.`
              }
              actions={(
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedCaseId(null)}>
                  Show all cases
                </Button>
              )}
            />
          ) : null}

          {visibleCaseOptions.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={selectedCaseId === null ? "secondary" : "outline"}
                size="sm"
                onClick={() => setSelectedCaseId(null)}
              >
                All cases
              </Button>
              {visibleCaseOptions.slice(0, 6).map((entry) => (
                <Button
                  key={entry.id}
                  type="button"
                  variant={selectedCaseId === entry.id ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCaseId(entry.id)}
                >
                  {entry.label}
                </Button>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl surface-panel p-5 space-y-4">
        <SectionHeading
          title="Needs your input"
          meta={(
            <span className="control-badge border border-hairline bg-surface-2/70 ui-meta-text text-muted-foreground">
              {humanTasksLoading ? "Loading..." : `${openHumanTaskCount} open`}
            </span>
          )}
        />
        <p className="text-body-sm text-muted-foreground">
          Open review gates and structured input requests appear here while a flow is waiting on you.
        </p>

        {humanTasksError ? (
          <article className="rounded-lg surface-danger-soft px-4 py-3 text-body-sm text-status-danger">
            {humanTasksError}
          </article>
        ) : openHumanTaskCount === 0 && !humanTasksLoading ? (
          <article className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-5 py-10 text-center">
            <div className="mx-auto flex h-control-lg w-control-lg items-center justify-center rounded-lg border border-hairline bg-surface-2/80">
              <Inbox size={20} className="text-muted-foreground" />
            </div>
            <p className="mt-4 text-body-md font-medium text-foreground">
              {selectedCaseOption ? "No open gates for this case" : "No open review or input tasks"}
            </p>
            <p className="mt-1 text-body-sm text-muted-foreground">
              {selectedCaseOption
                ? (factoryBetaEnabled
                    ? "Switch to all cases or continue this case in Factory if you want to move it forward."
                    : "Switch to all cases or continue the related workflow if you want to move it forward.")
                : "Flows that need structured answers or review gates will appear here."}
            </p>
          </article>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="overflow-hidden rounded-lg surface-soft">
              {visibleHumanTasks.map((task) => {
                const stageMeta = taskStageMetaByKey[taskStageKey(task) || ""] || null
                const taskCaseId = caseIdByTaskKey.get(taskSelectionKey(task)) || null
                const taskCaseLabel = taskCaseId ? caseLabelById.get(taskCaseId) || null : null
                return (
                  <button
                    key={`${task.workspace}:${task.taskId}`}
                    type="button"
                    onClick={() => setSelectedTaskId(taskSelectionKey(task))}
                    className={cn(
                      "ui-interactive-card-subtle w-full border-b border-hairline px-4 py-3 text-left last:border-b-0",
                      selectedTaskId === taskSelectionKey(task)
                        ? "bg-surface-1 ring-1 ring-primary/15"
                        : "bg-transparent hover:bg-surface-1/70",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="min-w-0 flex-1 truncate text-body-md font-semibold text-foreground">{task.title}</h2>
                          <Badge variant={task.kind === "approval" ? "warning" : "info"} size="pill">
                            {taskKindLabel(task)}
                          </Badge>
                          {!selectedCaseId && taskCaseLabel && (
                            <Badge variant="outline" size="pill" className="text-muted-foreground">
                              {taskCaseLabel}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 ui-meta-text text-muted-foreground">
                          <span>{task.workflowName}</span>
                          {stageMeta && <span>· {stageMeta.title}</span>}
                          {!stageMeta && task.kind === "approval" && <span>· Review gate</span>}
                        </div>
                        {stageMeta && (
                          <p className="mt-1 ui-meta-text text-muted-foreground">{stageMeta.group}</p>
                        )}
                        {taskCardPreview(task) && (
                          <p className="mt-2 line-clamp-2 text-body-sm text-muted-foreground">{taskCardPreview(task)}</p>
                        )}
                      </div>
                      <span className="shrink-0 ui-meta-text text-muted-foreground">{formatRelativeTime(task.createdAt)}</span>
                    </div>
                  </button>
                )
              })}
            </div>

            <article className="rounded-lg surface-soft px-5 py-4">
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
                        <Badge variant={selectedTask.kind === "approval" ? "warning" : "info"} size="pill">
                          {taskKindLabel(selectedTask)}
                        </Badge>
                        {selectedTaskStageMeta && (
                          <Badge variant="outline" size="pill" className="text-muted-foreground">
                            {selectedTaskStageMeta.title}
                          </Badge>
                        )}
                        {selectedTaskPrimaryField && (
                          <Badge variant="outline" size="pill" className="text-muted-foreground">
                            {selectedTaskPrimaryField}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-body-sm text-muted-foreground">
                        Workflow: {selectedTask.workflowName}
                        {selectedTaskStageMeta ? ` · ${selectedTaskStageMeta.group}` : ""}
                      </p>
                      <div className="mt-3 rounded-lg surface-info-soft px-3 py-2">
                        <p className="text-body-sm text-foreground">{taskActionCopy(selectedTask)}</p>
                        <p className="mt-1 ui-meta-text text-muted-foreground">
                          If the run is live it will continue immediately. If it was reopened from history, you can resume it after submitting here.
                        </p>
                      </div>
                      {selectedTask.instructions && compactTaskText(selectedTask.instructions, 999) !== compactTaskText(selectedTask.summary, 999) && (
                        <p className="mt-2 text-body-sm text-muted-foreground whitespace-pre-wrap">{selectedTask.instructions}</p>
                      )}
                    </div>
                    {selectedTask.workflowPath && (
                      <Button type="button" variant="outline" size="sm" onClick={() => { void handleOpenWorkflow() }}>
                        <ArrowUpRight size={14} />
                        Open workflow
                      </Button>
                    )}
                  </div>

                  {selectedTask.summary && (
                    <div className="rounded-lg surface-soft px-3 py-2 text-body-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedTask.summary}
                    </div>
                  )}

                  <div className="space-y-3">
                    {selectedTask.request.fields.map((field) => {
                      const value = normalizeHumanFieldValue(field, taskAnswers[field.id])

                      if (field.type === "boolean") {
                        return (
                          <div key={field.id} className="surface-inset-card flex items-start justify-between gap-4 p-3">
                            <div className="min-w-0">
                              <p className="text-body-sm font-medium text-foreground">{field.label}</p>
                              {field.description && (
                                <p className="mt-1 text-body-sm text-muted-foreground">{field.description}</p>
                              )}
                            </div>
                            <Checkbox
                              checked={Boolean(value)}
                              onChange={(e) => handleTaskFieldChange(field, e.target.checked)}
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
                            <div className="surface-inset-card space-y-2 p-3">
                              {(field.options || []).map((option) => {
                                const checked = selectedValues.includes(option.value)
                                return (
                                  <label key={option.value} className="flex items-center gap-2 text-body-sm text-foreground">
                                    <Checkbox
                                      checked={checked}
                                      onChange={(e) => {
                                        const nextValues = e.target.checked
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

                  <div className="flex flex-wrap gap-2 border-t border-hairline pt-3">
                    <Button
                      type="button"
                      onClick={() => { void handleSubmitHumanTask() }}
                      disabled={taskSubmitting}
                      isLoading={taskSubmitting}
                    >
                      {!taskSubmitting && <Check size={14} />}
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
                      variant="ghost"
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

      <section className="rounded-xl surface-panel p-5 space-y-4">
        <SectionHeading
          title="Recent events"
          meta={(
            <span className="control-badge border border-hairline bg-surface-2/70 ui-meta-text text-muted-foreground">
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
          <article className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-5 py-10 text-center">
            <div className="mx-auto flex h-control-lg w-control-lg items-center justify-center rounded-lg border border-hairline bg-surface-2/80">
              <Inbox size={20} className="text-muted-foreground" />
            </div>
            <p className="mt-4 text-body-md font-medium text-foreground">Inbox is clear</p>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Important confirmations and errors will accumulate here as you work.
            </p>
          </article>
        ) : (
          <div className="overflow-hidden rounded-lg surface-soft">
            {visibleNotifications.map((notification) => {
              const levelMeta = LEVEL_META[notification.level]
              const LevelIcon = levelMeta.icon

              return (
                <article
                  key={notification.id}
                  className={cn(
                    "border-b border-hairline px-4 py-3 last:border-b-0",
                    !notification.read ? "bg-surface-1" : "bg-transparent",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-hairline bg-surface-2/80", levelMeta.tone)}>
                      <LevelIcon size={16} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-body-md font-semibold text-foreground">{notification.title}</h2>
                        <span className={cn("ui-status-badge ui-meta-text", levelMeta.badgeClass)}>
                          {SOURCE_LABELS[notification.source]}
                        </span>
                        {!notification.read && (
                          <Badge variant="secondary" size="pill">Unread</Badge>
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

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {notification.action && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => { void handleNotificationAction(notification) }}
                        >
                          <ArrowUpRight size={14} />
                          {notification.action.label || "Open"}
                        </Button>
                      )}
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
