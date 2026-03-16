import { useCallback, useEffect, useMemo, useState } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  ArrowUpRight,
  FileStack,
  FolderOpen,
  Inbox,
  Loader2,
  RefreshCw,
  Rocket,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { BoardLane } from "@/components/ui/board-lane"
import { Button } from "@/components/ui/button"
import { PageHeader, PageShell, SectionHeading } from "@/components/ui/page-shell"
import { SummaryRail } from "@/components/ui/summary-rail"
import { formatRelativeTime, projectFolderName } from "@/components/sidebar/projectSidebarUtils"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import {
  currentWorkflowAtom,
  inputAttachmentsAtom,
  inputValueAtom,
  mainViewAtom,
  selectedProjectAtom,
  selectedFactoryCaseIdAtom,
  selectedInboxTaskKeyAtom,
  selectedWorkflowPathAtom,
  setWorkflowTemplateContextForKeyAtom,
  workflowEntryStateAtom,
  workflowSavedSnapshotAtom,
  workflowDirtyAtom,
  workflowTemplateContextsAtom,
  webSearchBackendAtom,
  workflowsAtom,
} from "@/lib/store"
import { workflowExecutionStatesAtom, pastRunsAtom } from "@/features/execution"
import { prepareTemplateStageLaunch } from "@/lib/factory-launch"
import { buildRunProgressSummary, formatElapsedTime } from "@/lib/run-progress"
import {
  areTemplateContractsSatisfied,
  deriveArtifactCaseKey,
  deriveTemplateExecutionDisciplineLabels,
  deriveTemplateJourneyStageLabel,
  formatArtifactContractLabel,
  selectArtifactsForTemplateContracts,
} from "@/lib/workflow-entry"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { isRunInFlight, toWorkflowExecutionKey, type WorkflowExecutionState } from "@/lib/workflow-execution"
import type { ArtifactRecord, HumanTaskSummary, RunResult, WorkflowTemplate } from "@shared/types"

interface FactoryRunEntry {
  workflowKey: string
  workflowPath: string | null
  workflowName: string
  reportPath: string | null
  runStartedAt: number | null
  lastUpdatedAt: number | null
  projectPath: string | null
  summary: ReturnType<typeof buildRunProgressSummary>
  state: WorkflowExecutionState
}

interface FactoryCase {
  id: string
  label: string
  artifacts: ArtifactRecord[]
  tasks: HumanTaskSummary[]
  relatedRuns: RunResult[]
  workflowPaths: string[]
  latestArtifact: ArtifactRecord | null
  activeRun: FactoryRunEntry | null
  latestRun: FactoryRunEntry | null
  nextTemplates: WorkflowTemplate[]
  lineageLabels: string[]
  status: "active" | "blocked" | "ready" | "completed"
}

interface FactoryActionItem {
  id: string
  caseId: string
  caseLabel: string
  kind: "review_gate" | "monitor_run" | "open_stage"
  title: string
  description: string
  timestamp: number
  tone: "warning" | "info" | "success"
  task?: HumanTaskSummary
  run?: FactoryRunEntry
  template?: WorkflowTemplate
  artifacts: ArtifactRecord[]
}

interface CaseSummaryField {
  label: string
  value: string
  hint?: string
  tone?: "default" | "info" | "warning" | "success"
}

function isVisibleProjectExecutionState(state: WorkflowExecutionState, projectPath: string) {
  if (state.projectPath !== projectPath) return false
  return isRunInFlight(state.runStatus)
    || state.runOutcome !== null
    || state.workspace !== null
    || state.reportPath !== null
    || state.finalContent.trim().length > 0
    || state.lastError !== null
    || Object.keys(state.nodeStates).length > 0
}

function cardToneClass(kind: "info" | "success" | "warning" | "danger") {
  if (kind === "success") return "border-status-success/25 bg-status-success/8 text-status-success"
  if (kind === "warning") return "border-status-warning/25 bg-status-warning/8 text-status-warning"
  if (kind === "danger") return "border-status-danger/25 bg-status-danger/8 text-status-danger"
  return "border-status-info/25 bg-status-info/8 text-status-info"
}

function factoryCaseStatusLabel(status: FactoryCase["status"]) {
  if (status === "active") return "Active"
  if (status === "blocked") return "Waiting on you"
  if (status === "ready") return "Ready"
  return "Completed"
}

function factoryCaseStatusTone(status: FactoryCase["status"]): "info" | "success" | "warning" | "danger" {
  if (status === "active") return "info"
  if (status === "blocked") return "warning"
  if (status === "ready") return "success"
  return "success"
}

function factoryActionLabel(kind: FactoryActionItem["kind"]) {
  if (kind === "review_gate") return "Review gate"
  if (kind === "monitor_run") return "Live run"
  return "Open stage"
}

function latestLineageLabel(entry: FactoryCase) {
  return entry.lineageLabels[entry.lineageLabels.length - 1] || null
}

function factoryLaneMeta(status: FactoryCase["status"]) {
  if (status === "blocked") {
    return {
      title: "Waiting on you",
      description: "Cases blocked on human review or missing input.",
      tone: "warning" as const,
    }
  }
  if (status === "active") {
    return {
      title: "Running",
      description: "Cases with live execution already in progress.",
      tone: "info" as const,
    }
  }
  if (status === "ready") {
    return {
      title: "Ready",
      description: "Cases that can move to the next stage now.",
      tone: "success" as const,
    }
  }
  return {
    title: "Completed",
    description: "Cases with no open gate and no immediate next stage.",
    tone: "default" as const,
  }
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <article className="rounded-xl surface-panel px-4 py-4">
      <div className="ui-meta-label text-muted-foreground">{label}</div>
      <div className="mt-2 text-title-md text-foreground">{value}</div>
      <div className="mt-1 text-body-sm text-muted-foreground">{hint}</div>
    </article>
  )
}

export function FactoryPage() {
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setWorkflow] = useAtom(currentWorkflowAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [, setWorkflowEntryState] = useAtom(workflowEntryStateAtom)
  const [, setInputValue] = useAtom(inputValueAtom)
  const [, setInputAttachments] = useAtom(inputAttachmentsAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
  const workflowDirty = useAtomValue(workflowDirtyAtom)
  const workflowTemplateContexts = useAtomValue(workflowTemplateContextsAtom)
  const setWorkflowTemplateContextForKey = useSetAtom(setWorkflowTemplateContextForKeyAtom)
  const [workflowExecutionStates] = useAtom(workflowExecutionStatesAtom)
  const [pastRuns] = useAtom(pastRunsAtom)
  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()
  const [humanTasks, setHumanTasks] = useState<HumanTaskSummary[]>([])
  const [humanTasksLoading, setHumanTasksLoading] = useState(false)
  const [humanTasksError, setHumanTasksError] = useState<string | null>(null)
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([])
  const [artifactsLoading, setArtifactsLoading] = useState(false)
  const [artifactsError, setArtifactsError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [launchingTemplateId, setLaunchingTemplateId] = useState<string | null>(null)
  const [selectedCaseId, setSelectedCaseId] = useAtom(selectedFactoryCaseIdAtom)
  const [, setSelectedInboxTaskKey] = useAtom(selectedInboxTaskKeyAtom)

  const refreshHumanTasks = useCallback(async () => {
    if (!selectedProject) {
      setHumanTasks([])
      setHumanTasksLoading(false)
      setHumanTasksError(null)
      return
    }

    setHumanTasksLoading(true)
    setHumanTasksError(null)
    try {
      const nextTasks = await window.api.listHumanTasks(selectedProject)
      setHumanTasks(nextTasks)
    } catch (error) {
      setHumanTasks([])
      setHumanTasksError(error instanceof Error ? error.message : String(error))
    } finally {
      setHumanTasksLoading(false)
    }
  }, [selectedProject])

  const refreshArtifacts = useCallback(async () => {
    if (!selectedProject) {
      setArtifacts([])
      setArtifactsLoading(false)
      setArtifactsError(null)
      return
    }

    setArtifactsLoading(true)
    setArtifactsError(null)
    try {
      const nextArtifacts = await window.api.listProjectArtifacts(selectedProject)
      setArtifacts(nextArtifacts)
    } catch (error) {
      setArtifacts([])
      setArtifactsError(error instanceof Error ? error.message : String(error))
    } finally {
      setArtifactsLoading(false)
    }
  }, [selectedProject])

  const refreshFactoryData = useCallback(async () => {
    await Promise.all([
      refreshHumanTasks(),
      refreshArtifacts(),
    ])
  }, [refreshArtifacts, refreshHumanTasks])

  useEffect(() => {
    void refreshFactoryData()
  }, [refreshFactoryData])

  useEffect(() => {
    let cancelled = false
    setTemplatesLoading(true)
    setTemplatesError(null)

    void window.api.listTemplates().then((nextTemplates) => {
      if (cancelled) return
      setTemplates(nextTemplates)
    }).catch((error) => {
      if (cancelled) return
      setTemplates([])
      setTemplatesError(error instanceof Error ? error.message : String(error))
    }).finally(() => {
      if (!cancelled) {
        setTemplatesLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const liveRunEntries = useMemo<FactoryRunEntry[]>(() => {
    if (!selectedProject) return []

    return Object.entries(workflowExecutionStates)
      .filter(([, state]) => isVisibleProjectExecutionState(state, selectedProject))
      .map(([workflowKey, state]) => ({
        workflowKey,
        workflowPath: workflowKey === "__draft__" ? null : workflowKey,
        workflowName: state.workflowName || "Untitled workflow",
        reportPath: state.reportPath,
        runStartedAt: state.runStartedAt,
        lastUpdatedAt: state.lastUpdatedAt,
        projectPath: state.projectPath,
        summary: buildRunProgressSummary({
          workflow: state.workflowSnapshot || createEmptyWorkflow(),
          runtimeNodes: state.runtimeNodes,
          runtimeMeta: state.runtimeMeta,
          nodeStates: state.nodeStates,
          runStatus: state.runStatus,
          runOutcome: state.runOutcome,
          activeNodeId: state.activeNodeId,
        }),
        state,
      }))
      .sort((left, right) =>
        (right.lastUpdatedAt || right.runStartedAt || 0) - (left.lastUpdatedAt || left.runStartedAt || 0),
      )
  }, [selectedProject, workflowExecutionStates])

  const recentRuns = useMemo(() => pastRuns.slice(0, 4), [pastRuns])
  const recentArtifacts = useMemo(() => artifacts.slice(0, 4), [artifacts])
  const compatibleTemplates = useMemo(() => {
    return templates
      .filter((template) => (template.contractIn?.length || 0) > 0)
      .filter((template) => areTemplateContractsSatisfied(template.contractIn, artifacts))
  }, [artifacts, templates])
  const readyTemplates = useMemo(() => compatibleTemplates.slice(0, 4), [compatibleTemplates])
  const activeRunsCount = useMemo(
    () => liveRunEntries.filter((entry) => isRunInFlight(entry.state.runStatus)).length,
    [liveRunEntries],
  )
  const cases = useMemo<FactoryCase[]>(() => {
    const templateById = new Map(templates.map((template) => [template.id, template]))
    const caseByRunId = new Map<string, string>()
    const caseByWorkflowPath = new Map<string, string>()
    const next = new Map<string, {
      id: string
      label: string
      artifacts: ArtifactRecord[]
      tasks: HumanTaskSummary[]
      relatedRuns: RunResult[]
      workflowPaths: Set<string>
      latestArtifact: ArtifactRecord | null
      activeRun: FactoryRunEntry | null
      latestRun: FactoryRunEntry | null
      lineageLabels: string[]
    }>()

    const ensureCase = (caseId: string, label: string) => {
      const existing = next.get(caseId)
      if (existing) {
        if (!existing.label && label) existing.label = label
        return existing
      }

      const created = {
        id: caseId,
        label,
        artifacts: [],
        tasks: [],
        relatedRuns: [],
        workflowPaths: new Set<string>(),
        latestArtifact: null,
        activeRun: null,
        latestRun: null,
        lineageLabels: [],
      }
      next.set(caseId, created)
      return created
    }

    for (const artifact of artifacts) {
      const caseId = deriveArtifactCaseKey(artifact)
      const stageLabel = artifact.templateId
        ? deriveTemplateJourneyStageLabel(templateById.get(artifact.templateId) || ({
            pack: undefined,
          } as WorkflowTemplate))
        : null
      const entry = ensureCase(caseId, artifact.caseLabel || artifact.workflowName || artifact.title)
      entry.artifacts.push(artifact)
      if (artifact.workflowPath) {
        entry.workflowPaths.add(artifact.workflowPath)
        caseByWorkflowPath.set(artifact.workflowPath, caseId)
      }
      caseByRunId.set(artifact.runId, caseId)
      if (!entry.latestArtifact || artifact.updatedAt > entry.latestArtifact.updatedAt) {
        entry.latestArtifact = artifact
      }
      if (stageLabel && !entry.lineageLabels.includes(stageLabel)) {
        entry.lineageLabels.push(stageLabel)
      }
    }

    for (const [workflowKey, context] of Object.entries(workflowTemplateContexts)) {
      if (!context.caseId) continue
      const entry = ensureCase(context.caseId, context.caseLabel || context.workflowName || context.templateName)
      if (context.workflowPath) {
        entry.workflowPaths.add(context.workflowPath)
        caseByWorkflowPath.set(context.workflowPath, context.caseId)
      } else if (workflowKey !== "__draft__") {
        entry.workflowPaths.add(workflowKey)
        caseByWorkflowPath.set(workflowKey, context.caseId)
      }
      const stageLabel = context.pack?.journeyStage
        ? deriveTemplateJourneyStageLabel({
            id: context.templateId,
            name: context.templateName,
            description: "",
            stage: "strategy",
            emoji: "",
            headline: "",
            how: "",
            input: "",
            output: "",
            steps: [],
            workflow: createEmptyWorkflow(),
            pack: context.pack,
          })
        : null
      if (stageLabel && !entry.lineageLabels.includes(stageLabel)) {
        entry.lineageLabels.push(stageLabel)
      }
    }

    for (const entry of liveRunEntries) {
      const caseId = (entry.workflowPath && caseByWorkflowPath.get(entry.workflowPath))
        || (entry.state.runId ? caseByRunId.get(entry.state.runId) : undefined)
      if (!caseId) continue
      const target = ensureCase(caseId, entry.workflowName)
      if (entry.workflowPath) target.workflowPaths.add(entry.workflowPath)
      if (!target.latestRun || (entry.lastUpdatedAt || 0) > (target.latestRun.lastUpdatedAt || 0)) {
        target.latestRun = entry
      }
      if (isRunInFlight(entry.state.runStatus)) {
        target.activeRun = entry
      }
    }

    for (const task of humanTasks) {
      const caseId = (task.workflowPath && caseByWorkflowPath.get(task.workflowPath))
        || caseByRunId.get(task.sourceRunId)
      if (!caseId) continue
      const target = ensureCase(caseId, task.workflowName)
      target.tasks.push(task)
      if (task.workflowPath) {
        target.workflowPaths.add(task.workflowPath)
      }
    }

    return Array.from(next.values()).map((entry) => {
      const caseArtifacts = [...entry.artifacts].sort((left, right) => right.updatedAt - left.updatedAt)
      const relatedRunIds = new Set<string>([
        ...caseArtifacts.map((artifact) => artifact.runId),
        ...entry.tasks.map((task) => task.sourceRunId),
      ])
      const relatedRuns = pastRuns
        .filter((run) =>
          relatedRunIds.has(run.runId)
          || (run.workflowPath ? entry.workflowPaths.has(run.workflowPath) : false),
        )
        .sort((left, right) => right.completedAt - left.completedAt)
      const nextTemplatesForCase = templates
        .filter((template) => (template.contractIn?.length || 0) > 0)
        .filter((template) => areTemplateContractsSatisfied(template.contractIn, caseArtifacts))
        .slice(0, 3)
      const status: FactoryCase["status"] = entry.activeRun
        ? "active"
        : entry.tasks.length > 0
          ? "blocked"
          : nextTemplatesForCase.length > 0
            ? "ready"
            : "completed"

      return {
        id: entry.id,
        label: entry.label,
        artifacts: caseArtifacts,
        tasks: entry.tasks.sort((left, right) => right.updatedAt - left.updatedAt),
        relatedRuns,
        workflowPaths: Array.from(entry.workflowPaths),
        latestArtifact: entry.latestArtifact,
        activeRun: entry.activeRun,
        latestRun: entry.latestRun,
        nextTemplates: nextTemplatesForCase,
        lineageLabels: entry.lineageLabels,
        status,
      }
    }).sort((left, right) => {
      const leftUpdated = left.activeRun?.lastUpdatedAt || left.latestArtifact?.updatedAt || left.latestRun?.lastUpdatedAt || 0
      const rightUpdated = right.activeRun?.lastUpdatedAt || right.latestArtifact?.updatedAt || right.latestRun?.lastUpdatedAt || 0
      return rightUpdated - leftUpdated
    })
  }, [artifacts, humanTasks, liveRunEntries, pastRuns, templates, workflowTemplateContexts])
  const readyCasesCount = useMemo(
    () => cases.filter((entry) => entry.status === "ready").length,
    [cases],
  )
  const caseLanes = useMemo(() => ([
    "blocked",
    "active",
    "ready",
    "completed",
  ] as const).map((status) => ({
    status,
    ...factoryLaneMeta(status),
    cases: cases.filter((entry) => entry.status === status),
  })), [cases])
  const selectedCase = useMemo(
    () => cases.find((entry) => entry.id === selectedCaseId) || cases[0] || null,
    [cases, selectedCaseId],
  )

  useEffect(() => {
    if (cases.length === 0) {
      if (selectedCaseId !== null) setSelectedCaseId(null)
      return
    }
    if (!selectedCaseId || !cases.some((entry) => entry.id === selectedCaseId)) {
      setSelectedCaseId(cases[0].id)
    }
  }, [cases, selectedCaseId])

  const focusCase = useCallback((caseId: string) => {
    setSelectedCaseId(caseId)
  }, [setSelectedCaseId])

  const openInboxTask = useCallback((task: HumanTaskSummary, caseId?: string) => {
    if (caseId) {
      setSelectedCaseId(caseId)
    }
    setSelectedInboxTaskKey(`${task.workspace}::${task.taskId}`)
    setMainView("inbox")
  }, [setMainView, setSelectedCaseId, setSelectedInboxTaskKey])

  const nextActions = useMemo<FactoryActionItem[]>(() => {
    const next = cases.flatMap((entry) => {
      const primaryTask = entry.tasks[0]
      if (primaryTask) {
        return [{
          id: `${entry.id}:task:${primaryTask.taskId}`,
          caseId: entry.id,
          caseLabel: entry.label,
          kind: "review_gate" as const,
          title: primaryTask.title,
          description: primaryTask.summary || primaryTask.instructions || "A human gate is blocking this case.",
          timestamp: primaryTask.updatedAt,
          tone: "warning" as const,
          task: primaryTask,
          artifacts: entry.artifacts,
        }]
      }

      if (entry.activeRun) {
        return [{
          id: `${entry.id}:run:${entry.activeRun.workflowKey}`,
          caseId: entry.id,
          caseLabel: entry.label,
          kind: "monitor_run" as const,
          title: entry.activeRun.workflowName,
          description: entry.activeRun.summary.activeStepLabel || "Run in progress",
          timestamp: entry.activeRun.lastUpdatedAt || entry.activeRun.runStartedAt || 0,
          tone: "info" as const,
          run: entry.activeRun,
          artifacts: entry.artifacts,
        }]
      }

      const primaryTemplate = entry.nextTemplates[0]
      if (primaryTemplate) {
        return [{
          id: `${entry.id}:template:${primaryTemplate.id}`,
          caseId: entry.id,
          caseLabel: entry.label,
          kind: "open_stage" as const,
          title: primaryTemplate.name,
          description: entry.latestArtifact
            ? `Ready from ${entry.latestArtifact.title}.`
            : "Ready from the artifacts already saved for this case.",
          timestamp: entry.latestArtifact?.updatedAt || 0,
          tone: "success" as const,
          template: primaryTemplate,
          artifacts: entry.artifacts,
        }]
      }

      return []
    })

    const priority = (item: FactoryActionItem) => {
      if (item.kind === "review_gate") return 0
      if (item.kind === "monitor_run") return 1
      return 2
    }

    return next.sort((left, right) => {
      const byPriority = priority(left) - priority(right)
      if (byPriority !== 0) return byPriority
      return right.timestamp - left.timestamp
    })
  }, [cases])
  const primaryActionByCaseId = useMemo(() => {
    const next = new Map<string, FactoryActionItem>()
    for (const action of nextActions) {
      if (!next.has(action.caseId)) {
        next.set(action.caseId, action)
      }
    }
    return next
  }, [nextActions])
  const selectedCaseSummary = useMemo(() => {
    if (!selectedCase) return null
    const primaryAction = primaryActionByCaseId.get(selectedCase.id) || null

    let currentStageValue = latestLineageLabel(selectedCase) || "Not staged yet"
    let currentStageHint = "Run a stage to establish lineage."
    let currentStageTone: CaseSummaryField["tone"] = "default"

    if (selectedCase.activeRun) {
      currentStageValue = selectedCase.activeRun.summary.phaseLabel || latestLineageLabel(selectedCase) || "In progress"
      currentStageHint = selectedCase.activeRun.summary.activeStepLabel || "Run in progress."
      currentStageTone = "info"
    } else if (selectedCase.latestArtifact) {
      currentStageValue = latestLineageLabel(selectedCase) || "Artifact saved"
      currentStageHint = `${selectedCase.latestArtifact.title} · ${formatRelativeTime(selectedCase.latestArtifact.updatedAt)}`
    } else if (primaryAction?.template) {
      currentStageValue = latestLineageLabel(selectedCase) || "Ready to continue"
      currentStageHint = `Prepared to open ${primaryAction.template.name}.`
      currentStageTone = "success"
    }

    let blockingGateValue = "No open gate"
    let blockingGateHint = "Nothing is waiting on human input."
    let blockingGateTone: CaseSummaryField["tone"] = "default"
    if (selectedCase.tasks[0]) {
      blockingGateValue = selectedCase.tasks[0].kind === "approval" ? "Review gate" : "Input needed"
      blockingGateHint = selectedCase.tasks[0].title
      blockingGateTone = "warning"
    }

    let latestArtifactValue = "No artifact yet"
    let latestArtifactHint = "This case has not persisted any reusable output."
    if (selectedCase.latestArtifact) {
      latestArtifactValue = selectedCase.latestArtifact.title
      latestArtifactHint = `${formatArtifactContractLabel(selectedCase.latestArtifact.kind)} · ${formatRelativeTime(selectedCase.latestArtifact.updatedAt)}`
    }

    let nextActionValue = "No action queued"
    let nextActionHint = "This case is complete or waiting for new input."
    let nextActionTone: CaseSummaryField["tone"] = "default"
    if (primaryAction) {
      nextActionValue = primaryAction.kind === "open_stage" && primaryAction.template
        ? primaryAction.template.name
        : primaryAction.title
      nextActionHint = primaryAction.description
      nextActionTone = primaryAction.tone
    }

    const fields: CaseSummaryField[] = [
      {
        label: "Current stage",
        value: currentStageValue,
        hint: currentStageHint,
        tone: currentStageTone,
      },
      {
        label: "Blocking gate",
        value: blockingGateValue,
        hint: blockingGateHint,
        tone: blockingGateTone,
      },
      {
        label: "Latest artifact",
        value: latestArtifactValue,
        hint: latestArtifactHint,
      },
      {
        label: "Next action",
        value: nextActionValue,
        hint: nextActionHint,
        tone: nextActionTone,
      },
    ]

    return {
      primaryAction,
      fields,
    }
  }, [primaryActionByCaseId, selectedCase])

  const openWorkflow = useCallback(async (workflowPath: string | null) => {
    if (!workflowPath) return
    if (workflowPath === selectedWorkflowPath) {
      setMainView("thread")
      return
    }
    if (!(await confirmDiscard("open another workflow", workflowDirty))) {
      return
    }

    try {
      const workflow = await window.api.loadWorkflow(workflowPath)
      setSelectedWorkflowPath(workflowPath)
      setWorkflow(workflow)
      setWorkflowSavedSnapshot(workflowSnapshot(workflow))
      setMainView("thread")
    } catch (error) {
      toast.error("Could not open workflow", {
        description: String(error),
      })
    }
  }, [confirmDiscard, selectedWorkflowPath, setMainView, setSelectedWorkflowPath, setWorkflow, setWorkflowSavedSnapshot, workflowDirty])

  const openArtifact = async (artifact: ArtifactRecord) => {
    const openError = await window.api.openPath(artifact.contentPath)
    if (!openError) return
    toast.error("Could not open artifact", {
      description: openError,
    })
  }

  const openReport = async (reportPath: string) => {
    const openError = await window.api.openReport(reportPath)
    if (!openError) return
    toast.error("Could not open report", {
      description: String(openError),
    })
  }

  const launchTemplate = async (template: WorkflowTemplate, sourceArtifacts = artifacts) => {
    if (!selectedProject || launchingTemplateId) return

    setLaunchingTemplateId(template.id)
    try {
      const launch = await prepareTemplateStageLaunch({
        projectPath: selectedProject,
        template,
        webSearchBackend,
        artifacts: selectArtifactsForTemplateContracts(template.contractIn, sourceArtifacts),
      })

      setWorkflows(launch.refreshedWorkflows)
      setSelectedWorkflowPath(launch.filePath)
      setWorkflow(launch.loadedWorkflow)
      setWorkflowSavedSnapshot(launch.savedSnapshot)
      setInputValue(launch.inputSeed)
      setWorkflowEntryState(launch.entryState)
      setWorkflowTemplateContextForKey({
        key: toWorkflowExecutionKey(launch.filePath),
        context: launch.templateContext,
      })
      setMainView("thread")
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setInputAttachments(launch.artifactAttachments)
        })
      })
      toast.success(`Opened ${template.name}`)
    } catch (error) {
      toast.error("Could not open the selected stage", {
        description: String(error),
      })
    } finally {
      setLaunchingTemplateId(null)
    }
  }

  if (!selectedProject) {
    return (
      <>
        <PageShell>
          <PageHeader
            title="Factory"
            subtitle="Choose a project in the sidebar to see live work, human gates, reusable artifacts, and next stages."
            actions={(
              <Button variant="outline" size="sm" onClick={() => setMainView("thread")}>
                <FolderOpen size={14} />
                Back to flow
              </Button>
            )}
          />
        </PageShell>
        {unsavedChangesDialog}
      </>
    )
  }

  return (
    <>
      <PageShell>
        <PageHeader
          title="Factory"
          subtitle={`Project operations for ${projectFolderName(selectedProject)}. Keep track of live work, human checkpoints, reusable outputs, and the next stages that are ready to launch.`}
          actions={(
            <>
              <Button variant="outline" size="sm" onClick={() => setMainView("artifacts")}>
                <FileStack size={14} />
                Open artifacts
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                setSelectedInboxTaskKey(null)
                setMainView("inbox")
              }}>
                <Inbox size={14} />
                Open inbox
              </Button>
              <Button variant="outline" size="sm" onClick={() => void refreshFactoryData()} disabled={humanTasksLoading || artifactsLoading}>
                {(humanTasksLoading || artifactsLoading) ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Refresh
              </Button>
            </>
          )}
        />

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-4">
          <StatCard
            label="Active runs"
            value={String(activeRunsCount)}
            hint={activeRunsCount > 0 ? "Flows currently executing or waiting on a gate." : "Nothing is actively running right now."}
          />
          <StatCard
            label="Waiting on you"
            value={String(humanTasks.length)}
            hint={humanTasks.length > 0 ? "Structured review or input tasks are blocking progress." : "No open HIL tasks right now."}
          />
          <StatCard
            label="Saved artifacts"
            value={String(artifacts.length)}
            hint={artifacts.length > 0 ? "Reusable outputs available for downstream stages." : "Run a stage to create reusable outputs."}
          />
          <StatCard
            label="Ready stages"
            value={String(readyCasesCount)}
            hint={readyCasesCount > 0 ? "Cases with a next stage ready to launch." : "No downstream stage is ready yet."}
          />
        </section>

        <section className="rounded-xl surface-panel p-5 space-y-4">
          <SectionHeading
            title="Next actions"
            meta={(
              <Badge variant="outline" className="ui-meta-text px-2 py-0">
                {nextActions.length} queued
              </Badge>
            )}
          />

          {nextActions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
              No immediate actions right now. New review gates, live runs, and ready stages will surface here automatically.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {nextActions.slice(0, 6).map((action) => {
                const isSelected = selectedCase?.id === action.caseId
                const disciplineLabels = action.template ? deriveTemplateExecutionDisciplineLabels(action.template) : []
                const stageLabel = action.template ? deriveTemplateJourneyStageLabel(action.template) : null
                const isLaunching = action.template ? launchingTemplateId === action.template.id : false
                return (
                  <article
                    key={action.id}
                    className={`rounded-lg border px-4 py-4 space-y-4 ${
                      isSelected
                        ? "border-primary/35 bg-primary/8 shadow-[inset_0_1px_0_hsl(var(--primary)/0.08),0_10px_22px_hsl(var(--foreground)/0.05)]"
                        : "border-hairline bg-surface-2/35"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={cardToneClass(action.tone)}>
                            {factoryActionLabel(action.kind)}
                          </Badge>
                          <Badge variant="secondary" className="ui-meta-text px-2 py-0">
                            {action.caseLabel}
                          </Badge>
                          {stageLabel ? (
                            <Badge variant="outline" className="ui-meta-text px-2 py-0">
                              {stageLabel}
                            </Badge>
                          ) : null}
                        </div>
                        <h2 className="mt-2 text-title-sm text-foreground">{action.title}</h2>
                        <p className="mt-1 text-body-sm text-muted-foreground">{action.description}</p>
                        <div className="mt-2 ui-meta-text text-muted-foreground">
                          {formatRelativeTime(action.timestamp)}
                          {action.run?.runStartedAt ? ` · ${formatElapsedTime(action.run.runStartedAt)}` : ""}
                        </div>
                        {disciplineLabels.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {disciplineLabels.slice(0, 3).map((label) => (
                              <Badge key={`${action.id}-${label}`} variant="secondary" className="ui-meta-text px-2 py-0">
                                {label}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {action.task ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openInboxTask(action.task!, action.caseId)}
                        >
                          <Inbox size={14} />
                          Review gate
                        </Button>
                      ) : null}
                      {action.run ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            focusCase(action.caseId)
                            void openWorkflow(action.run?.workflowPath || null)
                          }}
                          disabled={!action.run.workflowPath}
                        >
                          <ArrowUpRight size={14} />
                          Open run
                        </Button>
                      ) : null}
                      {action.template ? (
                        <Button
                          size="sm"
                          onClick={() => {
                            focusCase(action.caseId)
                            void launchTemplate(action.template!, action.artifacts)
                          }}
                          disabled={Boolean(launchingTemplateId)}
                        >
                          {isLaunching ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                          {isLaunching ? "Opening..." : "Open stage"}
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="sm" onClick={() => focusCase(action.caseId)}>
                        Focus case
                      </Button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl surface-panel p-5 space-y-4">
          <SectionHeading
            title="Cases"
            meta={(
              <Badge variant="outline" className="ui-meta-text px-2 py-0">
                {cases.length} tracked
              </Badge>
            )}
          />

          {cases.length === 0 ? (
            <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
              No derived cases yet. Run a delivery pack stage and persist artifacts to establish case lineage.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-4">
              {caseLanes.map((lane) => (
                <BoardLane
                  key={lane.status}
                  title={lane.title}
                  description={lane.description}
                  count={lane.cases.length}
                  tone={lane.tone}
                >
                  {lane.cases.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-hairline bg-surface-1/50 px-3 py-6 text-body-sm text-muted-foreground">
                      No cases in this lane right now.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {lane.cases.map((entry) => {
                        const statusTone = factoryCaseStatusTone(entry.status)
                        const primaryTemplate = entry.nextTemplates[0] || null
                        const isLaunching = primaryTemplate ? launchingTemplateId === primaryTemplate.id : false
                        const openWorkflowPath = entry.activeRun?.workflowPath || entry.workflowPaths[0] || null
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => setSelectedCaseId(entry.id)}
                            className={`w-full rounded-lg border px-4 py-4 text-left space-y-4 ui-transition-colors ui-motion-fast ${
                              selectedCase?.id === entry.id
                                ? "border-primary/35 bg-primary/8 shadow-[inset_0_1px_0_hsl(var(--primary)/0.08),0_10px_22px_hsl(var(--foreground)/0.05)]"
                                : "border-hairline bg-surface-1/70 hover:bg-surface-1"
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h2 className="text-title-sm text-foreground">{entry.label}</h2>
                                  <Badge variant="outline" className={cardToneClass(statusTone)}>
                                    {factoryCaseStatusLabel(entry.status)}
                                  </Badge>
                                  {latestLineageLabel(entry) ? (
                                    <Badge variant="secondary" className="ui-meta-text px-2 py-0">
                                      {latestLineageLabel(entry)}
                                    </Badge>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-body-sm text-muted-foreground">
                                  {entry.latestArtifact
                                    ? `${entry.latestArtifact.title} · ${formatRelativeTime(entry.latestArtifact.updatedAt)}`
                                    : entry.activeRun?.workflowName || "Case in progress"}
                                </p>
                              </div>
                              {openWorkflowPath ? (
                                <Button variant="ghost" size="sm" onClick={() => { void openWorkflow(openWorkflowPath) }}>
                                  <ArrowUpRight size={14} />
                                  Open
                                </Button>
                              ) : null}
                            </div>

                            <SummaryRail
                              items={[
                                {
                                  label: "Artifacts",
                                  value: String(entry.artifacts.length),
                                },
                                {
                                  label: "Tasks",
                                  value: String(entry.tasks.length),
                                  tone: entry.tasks.length > 0 ? "warning" : "default",
                                },
                                {
                                  label: "Next stages",
                                  value: String(entry.nextTemplates.length),
                                  tone: entry.nextTemplates.length > 0 ? "success" : "default",
                                },
                              ]}
                              className="sm:grid-cols-3"
                            />

                            <div className="space-y-2">
                              <div className="ui-meta-label text-muted-foreground">Next action</div>
                              {entry.activeRun ? (
                                <div className="rounded-md border border-status-info/25 bg-status-info/8 px-3 py-2 text-body-sm text-foreground">
                                  {entry.activeRun.summary.activeStepLabel || "Run in progress"}{entry.activeRun.runStartedAt ? ` · ${formatElapsedTime(entry.activeRun.runStartedAt)}` : ""}
                                </div>
                              ) : entry.tasks[0] ? (
                                <div className="rounded-md border border-status-warning/25 bg-status-warning/8 px-3 py-2 text-body-sm text-foreground">
                                  {entry.tasks[0].title}
                                </div>
                              ) : primaryTemplate ? (
                                <div className="rounded-md border border-status-success/25 bg-status-success/8 px-3 py-2 text-body-sm text-foreground">
                                  {primaryTemplate.name}
                                </div>
                              ) : (
                                <div className="rounded-md border border-hairline bg-surface-1/70 px-3 py-2 text-body-sm text-muted-foreground">
                                  No next stage detected yet.
                                </div>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {entry.tasks.length > 0 && (
                                <Button variant="outline" size="sm" onClick={() => {
                                  if (entry.tasks[0]) {
                                    openInboxTask(entry.tasks[0], entry.id)
                                  }
                                }}>
                                  <Inbox size={14} />
                                  Review gate
                                </Button>
                              )}
                              {primaryTemplate && (
                                <Button
                                  size="sm"
                                  onClick={() => { void launchTemplate(primaryTemplate, entry.artifacts) }}
                                  disabled={Boolean(launchingTemplateId)}
                                >
                                  {isLaunching ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                                  {isLaunching ? "Opening..." : "Open next stage"}
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" onClick={() => {
                                setSelectedCaseId(entry.id)
                                setMainView("artifacts")
                              }}>
                                <FileStack size={14} />
                                Artifacts
                              </Button>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </BoardLane>
              ))}
            </div>
          )}
        </section>

        {selectedCase && (
          <section className="grid grid-cols-1 gap-4 2xl:grid-cols-[1.25fr,0.75fr]">
            <article className="rounded-xl surface-panel p-5 space-y-4">
              <SectionHeading
                title={selectedCase.label}
                meta={(
                  <Badge variant="outline" className={cardToneClass(factoryCaseStatusTone(selectedCase.status))}>
                    {factoryCaseStatusLabel(selectedCase.status)}
                  </Badge>
                )}
              />

              <div className="flex flex-wrap gap-1.5">
                {selectedCase.lineageLabels.map((label) => (
                  <Badge key={`${selectedCase.id}-${label}`} variant="secondary" className="ui-meta-text px-2 py-0">
                    {label}
                  </Badge>
                ))}
              </div>

              <div className="space-y-3">
                <div className="ui-meta-label text-muted-foreground">Artifact lineage</div>
                {selectedCase.artifacts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-6 text-body-sm text-muted-foreground">
                    No artifacts persisted for this case yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {[...selectedCase.artifacts].sort((left, right) => left.updatedAt - right.updatedAt).map((artifact) => {
                      const sourceLabels = (artifact.sourceArtifactIds || [])
                        .map((id) => selectedCase.artifacts.find((candidate) => candidate.id === id)?.title)
                        .filter((value): value is string => Boolean(value))
                      return (
                        <div
                          key={artifact.id}
                          className="rounded-lg border border-hairline bg-surface-2/35 px-4 py-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-body-sm font-medium text-foreground">{artifact.title}</div>
                                <Badge variant="outline" className="ui-meta-text px-2 py-0">
                                  {formatArtifactContractLabel(artifact.kind)}
                                </Badge>
                              </div>
                              <div className="mt-1 text-body-sm text-muted-foreground">
                                {artifact.templateName || artifact.workflowName || "Saved from run"} · {formatRelativeTime(artifact.updatedAt)}
                              </div>
                              {sourceLabels.length > 0 && (
                                <div className="mt-2 text-body-sm text-muted-foreground">
                                  Built from: {sourceLabels.join(", ")}
                                </div>
                              )}
                            </div>
                            <Button variant="outline" size="sm" onClick={() => { void openArtifact(artifact) }}>
                              <FileStack size={14} />
                              Open
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="ui-meta-label text-muted-foreground">Related runs</div>
                {selectedCase.activeRun ? (
                  <div className="rounded-lg border border-status-info/25 bg-status-info/8 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-body-sm font-medium text-foreground">{selectedCase.activeRun.workflowName}</div>
                        <div className="mt-1 text-body-sm text-muted-foreground">
                          {selectedCase.activeRun.summary.activeStepLabel || "Run in progress"}{selectedCase.activeRun.runStartedAt ? ` · ${formatElapsedTime(selectedCase.activeRun.runStartedAt)}` : ""}
                        </div>
                      </div>
                      {selectedCase.activeRun.workflowPath ? (
                        <Button variant="outline" size="sm" onClick={() => { void openWorkflow(selectedCase.activeRun?.workflowPath || null) }}>
                          <ArrowUpRight size={14} />
                          Open live run
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {selectedCase.relatedRuns.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-6 text-body-sm text-muted-foreground">
                    No persisted run history is linked to this case yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedCase.relatedRuns.slice(0, 5).map((run) => (
                      <div key={run.runId} className="rounded-lg border border-hairline bg-surface-2/35 px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-body-sm font-medium text-foreground">{run.workflowName}</div>
                              <Badge
                                variant={run.status === "completed" ? "success" : run.status === "failed" ? "destructive" : "outline"}
                                className="ui-meta-text px-2 py-0"
                              >
                                {run.status}
                              </Badge>
                            </div>
                            <div className="mt-1 text-body-sm text-muted-foreground">
                              Finished {formatRelativeTime(run.completedAt)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => { void openReport(run.reportPath) }}>
                              <FileStack size={14} />
                              Report
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => { void openWorkflow(run.workflowPath || null) }} disabled={!run.workflowPath}>
                              <ArrowUpRight size={14} />
                              Open
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </article>

            <aside className="rounded-xl surface-panel p-5 space-y-4">
              <SectionHeading title="Case detail" />

              {selectedCaseSummary ? (
                <>
                  <SummaryRail
                    items={selectedCaseSummary.fields}
                    className="xl:grid-cols-1"
                  />

                  <div className="flex flex-wrap gap-2">
                    {selectedCaseSummary.primaryAction?.task ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openInboxTask(selectedCaseSummary.primaryAction!.task!, selectedCase.id)}
                      >
                        <Inbox size={14} />
                        Review gate
                      </Button>
                    ) : null}
                    {selectedCaseSummary.primaryAction?.run ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { void openWorkflow(selectedCaseSummary.primaryAction?.run?.workflowPath || null) }}
                        disabled={!selectedCaseSummary.primaryAction.run.workflowPath}
                      >
                        <ArrowUpRight size={14} />
                        Open run
                      </Button>
                    ) : null}
                    {selectedCaseSummary.primaryAction?.template ? (
                      <Button
                        size="sm"
                        onClick={() => { void launchTemplate(selectedCaseSummary.primaryAction!.template!, selectedCase.artifacts) }}
                        disabled={Boolean(launchingTemplateId)}
                      >
                        {launchingTemplateId === selectedCaseSummary.primaryAction.template.id ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                        {launchingTemplateId === selectedCaseSummary.primaryAction.template.id ? "Opening..." : "Run next action"}
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" onClick={() => {
                      setSelectedCaseId(selectedCase.id)
                      setMainView("artifacts")
                    }}>
                      <FileStack size={14} />
                      Case artifacts
                    </Button>
                  </div>
                </>
              ) : null}

              <div className="space-y-3">
                <div className="ui-meta-label text-muted-foreground">Open gates</div>
                {selectedCase.tasks.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-4 text-body-sm text-muted-foreground">
                    No pending human gates for this case.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedCase.tasks.map((task) => (
                      <div key={`${task.workspace}:${task.taskId}`} className="rounded-lg border border-status-warning/25 bg-status-warning/8 px-4 py-3">
                        <div className="text-body-sm font-medium text-foreground">{task.title}</div>
                        <div className="mt-1 text-body-sm text-muted-foreground">
                          {task.kind === "approval" ? "Review gate" : "Input needed"} · {formatRelativeTime(task.createdAt)}
                        </div>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => {
                      if (selectedCase.tasks[0]) {
                        openInboxTask(selectedCase.tasks[0], selectedCase.id)
                      }
                    }}>
                      <Inbox size={14} />
                      Open inbox
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="ui-meta-label text-muted-foreground">Next stages</div>
                {selectedCase.nextTemplates.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-4 text-body-sm text-muted-foreground">
                    No downstream stage is ready yet for this case.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedCase.nextTemplates.map((template) => {
                      const stageLabel = deriveTemplateJourneyStageLabel(template)
                      const disciplineLabels = deriveTemplateExecutionDisciplineLabels(template)
                      const isLaunching = launchingTemplateId === template.id
                      return (
                        <div key={`${selectedCase.id}-${template.id}`} className="rounded-lg border border-hairline bg-surface-2/35 px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-body-sm font-medium text-foreground">{template.name}</div>
                                {stageLabel ? (
                                  <Badge variant="secondary" className="ui-meta-text px-2 py-0">
                                    {stageLabel}
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="mt-1 text-body-sm text-muted-foreground">
                                {disciplineLabels.length > 0 ? disciplineLabels.join(" · ") : "Ready from this case context."}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => { void launchTemplate(template, selectedCase.artifacts) }}
                              disabled={Boolean(launchingTemplateId)}
                            >
                              {isLaunching ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                              {isLaunching ? "Opening..." : "Open"}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </aside>
          </section>
        )}

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <article className="rounded-xl surface-panel p-5 space-y-4">
            <SectionHeading
              title="Needs your input"
              meta={(
                <Badge variant="outline" className="ui-meta-text px-2 py-0">
                  {humanTasksLoading ? "Loading..." : `${humanTasks.length} open`}
                </Badge>
              )}
            />

            {humanTasksError ? (
              <div role="alert" className="rounded-lg border border-status-danger/25 bg-status-danger/5 px-4 py-3 text-body-sm text-status-danger">
                {humanTasksError}
              </div>
            ) : humanTasks.length === 0 && !humanTasksLoading ? (
              <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
                No human gates are blocking this project right now.
              </div>
            ) : (
              <div className="space-y-2">
                {humanTasks.slice(0, 4).map((task) => (
                  <div
                    key={`${task.workspace}:${task.taskId}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-2/45 px-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-body-sm font-medium text-foreground">{task.title}</div>
                        <Badge variant={task.kind === "approval" ? "warning" : "info"} className="ui-meta-text px-2 py-0">
                          {task.kind === "approval" ? "Review gate" : "Input needed"}
                        </Badge>
                      </div>
                      <div className="mt-1 text-body-sm text-muted-foreground">
                        {task.workflowName} · {formatRelativeTime(task.createdAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {task.workflowPath ? (
                        <Button variant="ghost" size="sm" onClick={() => { void openWorkflow(task.workflowPath || null) }}>
                          <ArrowUpRight size={14} />
                          Open flow
                        </Button>
                      ) : null}
                      <Button variant="outline" size="sm" onClick={() => openInboxTask(task)}>
                        <Inbox size={14} />
                        Review
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="rounded-xl surface-panel p-5 space-y-4">
            <SectionHeading
              title="Ready to launch"
              meta={(
                <Badge variant="outline" className="ui-meta-text px-2 py-0">
                  {templatesLoading ? "Loading..." : `${compatibleTemplates.length} ready`}
                </Badge>
              )}
            />

            {templatesError ? (
              <div role="alert" className="rounded-lg border border-status-danger/25 bg-status-danger/5 px-4 py-3 text-body-sm text-status-danger">
                {templatesError}
              </div>
            ) : readyTemplates.length === 0 && !templatesLoading ? (
              <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
                No downstream stage is fully ready yet. Use artifacts to build up the required contracts first.
              </div>
            ) : (
              <div className="space-y-2">
                {readyTemplates.map((template) => {
                  const stageLabel = deriveTemplateJourneyStageLabel(template)
                  const disciplineLabels = deriveTemplateExecutionDisciplineLabels(template)
                  const isLaunching = launchingTemplateId === template.id
                  return (
                    <div
                      key={template.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-2/45 px-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-body-sm font-medium text-foreground">{template.name}</div>
                          {template.pack ? (
                            <Badge variant="outline" className="ui-meta-text px-2 py-0">
                              {template.pack.label}
                            </Badge>
                          ) : null}
                          {stageLabel ? (
                            <Badge variant="secondary" className="ui-meta-text px-2 py-0">
                              {stageLabel}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 text-body-sm text-muted-foreground">
                          {disciplineLabels.length > 0
                            ? disciplineLabels.join(" · ")
                            : "Ready from the current project artifacts."}
                        </div>
                      </div>
                      <Button size="sm" onClick={() => { void launchTemplate(template) }} disabled={Boolean(launchingTemplateId)}>
                        {isLaunching ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                        {isLaunching ? "Opening..." : "Open stage"}
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </article>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <article className="rounded-xl surface-panel p-5 space-y-4">
            <SectionHeading
              title={liveRunEntries.length > 0 ? "Live work" : "Recent runs"}
              meta={(
                <Badge variant="outline" className="ui-meta-text px-2 py-0">
                  {liveRunEntries.length > 0 ? `${liveRunEntries.length} tracked` : `${recentRuns.length} recent`}
                </Badge>
              )}
            />

            {liveRunEntries.length === 0 && recentRuns.length === 0 ? (
              <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
                No runs to show yet for this project.
              </div>
            ) : liveRunEntries.length > 0 ? (
              <div className="space-y-2">
                {liveRunEntries.slice(0, 4).map((entry) => (
                  <div
                    key={entry.workflowKey}
                    className="rounded-lg border border-hairline bg-surface-2/45 px-3 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-body-sm font-medium text-foreground">{entry.workflowName}</div>
                          <Badge variant="outline" className={cardToneClass(entry.summary.tone)}>
                            {entry.summary.phaseLabel}
                          </Badge>
                        </div>
                        <div className="mt-1 text-body-sm text-muted-foreground">
                          {entry.summary.activeStepLabel || "Waiting for the next step"}{entry.runStartedAt ? ` · ${formatElapsedTime(entry.runStartedAt)}` : ""}
                        </div>
                        <div className="mt-1 ui-meta-text text-muted-foreground">
                          Step {Math.min(entry.summary.completedSteps, entry.summary.totalSteps)}/{entry.summary.totalSteps || 0}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {entry.reportPath ? (
                          <Button variant="ghost" size="sm" onClick={() => { void window.api.openReport(entry.reportPath!) }}>
                            <FileStack size={14} />
                            Report
                          </Button>
                        ) : null}
                        <Button variant="outline" size="sm" onClick={() => { void openWorkflow(entry.workflowPath) }} disabled={!entry.workflowPath}>
                          <ArrowUpRight size={14} />
                          Open
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {recentRuns.map((run) => (
                  <div
                    key={run.runId}
                    className="rounded-lg border border-hairline bg-surface-2/45 px-3 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-body-sm font-medium text-foreground">{run.workflowName}</div>
                          <Badge variant={run.status === "completed" ? "success" : run.status === "failed" ? "destructive" : "outline"} className="ui-meta-text px-2 py-0">
                            {run.status}
                          </Badge>
                        </div>
                        <div className="mt-1 text-body-sm text-muted-foreground">
                          {run.completedAt ? `Finished ${formatRelativeTime(run.completedAt)}` : `Started ${formatRelativeTime(run.startedAt)}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {run.reportPath ? (
                          <Button variant="ghost" size="sm" onClick={() => { void window.api.openReport(run.reportPath) }}>
                            <FileStack size={14} />
                            Report
                          </Button>
                        ) : null}
                        <Button variant="outline" size="sm" onClick={() => { void openWorkflow(run.workflowPath || null) }} disabled={!run.workflowPath}>
                          <ArrowUpRight size={14} />
                          Open
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="rounded-xl surface-panel p-5 space-y-4">
            <SectionHeading
              title="Recent artifacts"
              meta={(
                <Button variant="ghost" size="sm" onClick={() => setMainView("artifacts")}>
                  <ArrowUpRight size={14} />
                  Open library
                </Button>
              )}
            />

            {artifactsError ? (
              <div role="alert" className="rounded-lg border border-status-danger/25 bg-status-danger/5 px-4 py-3 text-body-sm text-status-danger">
                {artifactsError}
              </div>
            ) : recentArtifacts.length === 0 && !artifactsLoading ? (
              <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
                No reusable artifacts have been saved for this project yet.
              </div>
            ) : (
              <div className="space-y-2">
                {recentArtifacts.map((artifact) => (
                  <div
                    key={artifact.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-2/45 px-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-body-sm font-medium text-foreground">{artifact.title}</div>
                        <Badge variant="outline" className="ui-meta-text px-2 py-0">
                          {formatArtifactContractLabel(artifact.kind)}
                        </Badge>
                      </div>
                      <div className="mt-1 text-body-sm text-muted-foreground">
                        {artifact.templateName || artifact.workflowName || "Saved from run"} · {formatRelativeTime(artifact.updatedAt)}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => { void openArtifact(artifact) }}>
                      <FileStack size={14} />
                      Open
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      </PageShell>
      {unsavedChangesDialog}
    </>
  )
}
