import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader, PageShell, SectionHeading } from "@/components/ui/page-shell"
import { SummaryRail } from "@/components/ui/summary-rail"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { formatRelativeTime, projectFolderName } from "@/components/sidebar/projectSidebarUtils"
import { cn } from "@/lib/cn"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import {
  currentWorkflowAtom,
  inputAttachmentsAtom,
  inputValueAtom,
  mainViewAtom,
  selectedFactoryIdAtom,
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
import { formatResultModeLabel } from "@/lib/result-mode-factory"
import { buildRunProgressSummary, formatElapsedTime } from "@/lib/run-progress"
import {
  areTemplateContractsSatisfied,
  deriveArtifactCaseKey,
  deriveTemplateExecutionDisciplineLabels,
  deriveTemplateJourneyStageLabel,
  deriveTemplatePackStagePath,
  deriveTemplateUseWhen,
  formatArtifactContractLabel,
  selectArtifactsForTemplateContracts,
  type WorkflowTemplateRunContext,
} from "@/lib/workflow-entry"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { isRunInFlight, toWorkflowExecutionKey, type WorkflowExecutionState } from "@/lib/workflow-execution"
import type {
  ArtifactRecord,
  FactoryPlannedCase,
  HumanTaskSummary,
  ProjectFactoryDefinition,
  ProjectFactoryBlueprint,
  ProjectFactoryState,
  RunResult,
  WorkflowTemplate,
} from "@shared/types"

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
  factoryId: string
  factoryLabel: string
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

interface FactoryPackRecipe {
  id: string
  label: string
  stageLabels: string[]
  contractLabels: string[]
  policyLabels: string[]
  checkpointLabels: string[]
  caseRule: string
  activeCaseCount: number
}

interface FactoryBlueprintDraft {
  factoryLabel: string
  outcomeTitle: string
  outcomeStatement: string
  successSignal: string
  timeHorizon: string
  windowStart: string
  windowEnd: string
  targetCount: string
  targetUnit: string
  audience: string
  constraintsText: string
  recipeSummary: string
  stageOrderText: string
  artifactContractsText: string
  qualityPolicyText: string
  strategistCheckpointsText: string
  caseGenerationRulesText: string
}

interface FactoryOption {
  id: string
  label: string
  summary: string
  caseCount: number
  artifactCount: number
  origin: "saved" | "derived" | "draft"
  factory?: ProjectFactoryDefinition
}

interface FactoryPlannedCaseProgress {
  plannedCase: FactoryPlannedCase
  runtimeCase: FactoryCase | null
  status: "planned" | "active" | "blocked" | "ready" | "completed"
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
  if (kind === "success") return "ui-status-badge-success"
  if (kind === "warning") return "ui-status-badge-warning"
  if (kind === "danger") return "ui-status-badge-danger"
  return "ui-status-badge-info"
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

function dedupePreserveOrder(values: string[]) {
  const seen = new Set<string>()
  const next: string[] = []
  for (const value of values) {
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    next.push(normalized)
  }
  return next
}

function templateHasStrategistCheckpoint(template: WorkflowTemplate) {
  return template.workflow.nodes.some((node) => node.type === "approval" || node.type === "human")
}

function joinLines(values?: string[]) {
  return values?.join("\n") || ""
}

function splitLines(value: string): string[] | undefined {
  const next = dedupePreserveOrder(value.split("\n").map((line) => line.trim()).filter(Boolean))
  return next.length > 0 ? next : undefined
}

function buildFactoryIdFromLabel(label: string, fallback: string) {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return slug ? `factory:${slug}` : fallback
}

function resolveArtifactFactoryIdentity(
  artifact: ArtifactRecord,
  _templateById: Map<string, WorkflowTemplate>,
) {
  if (artifact.factoryId) {
    return {
      id: artifact.factoryId,
      label: artifact.factoryLabel || "Factory",
    }
  }

  return null
}

function resolveContextFactoryIdentity(context: WorkflowTemplateRunContext) {
  if (context.factoryId) {
    return {
      id: context.factoryId,
      label: context.factoryLabel || context.pack?.label || "Factory",
    }
  }

  return null
}

function createEmptyBlueprintDraft(): FactoryBlueprintDraft {
  return {
    factoryLabel: "",
    outcomeTitle: "",
    outcomeStatement: "",
    successSignal: "",
    timeHorizon: "",
    windowStart: "",
    windowEnd: "",
    targetCount: "",
    targetUnit: "",
    audience: "",
    constraintsText: "",
    recipeSummary: "",
    stageOrderText: "",
    artifactContractsText: "",
    qualityPolicyText: "",
    strategistCheckpointsText: "",
    caseGenerationRulesText: "",
  }
}

function buildBlueprintDraft(
  factory: ProjectFactoryDefinition | null,
  packRecipes: FactoryPackRecipe[],
): FactoryBlueprintDraft {
  const primaryRecipe = packRecipes[0] || null
  return {
    factoryLabel: factory?.label || "",
    outcomeTitle: factory?.outcome?.title || "",
    outcomeStatement: factory?.outcome?.statement || "",
    successSignal: factory?.outcome?.successSignal || "",
    timeHorizon: factory?.outcome?.timeHorizon || "",
    windowStart: factory?.outcome?.windowStart || "",
    windowEnd: factory?.outcome?.windowEnd || "",
    targetCount: typeof factory?.outcome?.targetCount === "number" ? String(factory.outcome.targetCount) : "",
    targetUnit: factory?.outcome?.targetUnit || "",
    audience: factory?.outcome?.audience || "",
    constraintsText: joinLines(factory?.outcome?.constraints),
    recipeSummary: factory?.recipe?.summary || primaryRecipe?.label || "",
    stageOrderText: joinLines(factory?.recipe?.stageOrder || primaryRecipe?.stageLabels),
    artifactContractsText: joinLines(factory?.recipe?.artifactContracts || primaryRecipe?.contractLabels),
    qualityPolicyText: joinLines(factory?.recipe?.qualityPolicy || primaryRecipe?.policyLabels),
    strategistCheckpointsText: joinLines(factory?.recipe?.strategistCheckpoints || primaryRecipe?.checkpointLabels),
    caseGenerationRulesText: joinLines(factory?.recipe?.caseGenerationRules || (primaryRecipe ? [primaryRecipe.caseRule] : [])),
  }
}

function isSpawnFriendlyArtifactKind(kind: string) {
  return /(?:calendar|plan|roadmap|backlog)$/i.test(kind)
}

function formatFactoryDate(value?: string) {
  if (!value) return "Not defined"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

function computeOutcomeTrackStatus({
  targetCount,
  plannedCount,
  windowStart,
  windowEnd,
}: {
  targetCount?: number | null
  plannedCount: number
  windowStart?: string
  windowEnd?: string
}) {
  if (!targetCount || !windowStart || !windowEnd) {
    return {
      label: plannedCount > 0 ? "Tracking" : "No schedule",
      hint: "Add a dated window to compare planned volume against time.",
      tone: "default" as const,
    }
  }

  const start = new Date(windowStart).getTime()
  const end = new Date(windowEnd).getTime()
  const now = Date.now()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return {
      label: "Schedule invalid",
      hint: "Window start and end need to be valid dates.",
      tone: "warning" as const,
    }
  }

  const elapsedRatio = Math.min(1, Math.max(0, (now - start) / (end - start)))
  const expected = targetCount * elapsedRatio
  if (plannedCount >= expected + 1) {
    return {
      label: "Ahead of plan",
      hint: `Planned ${plannedCount} against an expected ${Math.floor(expected)} by now.`,
      tone: "success" as const,
    }
  }
  if (plannedCount + 1 >= expected) {
    return {
      label: "On track",
      hint: `Planned ${plannedCount} against an expected ${Math.floor(expected)} by now.`,
      tone: "info" as const,
    }
  }
  return {
    label: "Behind plan",
    hint: `Planned ${plannedCount} against an expected ${Math.floor(expected)} by now.`,
    tone: "warning" as const,
  }
}

function launchablePlannedTemplateId(
  plannedCase: FactoryPlannedCase,
  templateById: Map<string, WorkflowTemplate>,
  fallback: WorkflowTemplate | null,
) {
  return (plannedCase.templateId && templateById.get(plannedCase.templateId)?.id) || fallback?.id || null
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
  tone = "default",
}: {
  label: string
  value: string
  hint: string
  tone?: "default" | "info" | "warning" | "success"
}) {
  return (
    <article className={cn("rounded-xl border px-4 py-4", {
      "surface-inset-card": tone === "default",
      "surface-info-soft": tone === "info",
      "surface-warning-soft": tone === "warning",
      "surface-success-soft": tone === "success",
    })}>
      <div className="ui-meta-label text-muted-foreground">{label}</div>
      <div className="mt-2 text-title-md text-foreground">{value}</div>
      <div className="mt-1 line-clamp-2 text-body-sm text-muted-foreground">{hint}</div>
    </article>
  )
}

function BadgeGroup({
  label,
  items,
  emptyLabel = "None yet",
  variant = "secondary",
}: {
  label: string
  items: string[]
  emptyLabel?: string
  variant?: "secondary" | "outline" | "warning" | "info" | "success"
}) {
  return (
    <div className="space-y-2">
      <div className="ui-meta-label text-muted-foreground">{label}</div>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <Badge key={`${label}:${item}`} variant={variant} className="ui-meta-text px-2 py-0">
              {item}
            </Badge>
          ))}
        </div>
      ) : (
        <div className="text-body-sm text-muted-foreground">{emptyLabel}</div>
      )}
    </div>
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
  const [factoryBlueprint, setFactoryBlueprint] = useState<ProjectFactoryBlueprint | null>(null)
  const [factoryBlueprintLoading, setFactoryBlueprintLoading] = useState(false)
  const [factoryBlueprintError, setFactoryBlueprintError] = useState<string | null>(null)
  const [factoryBlueprintSaving, setFactoryBlueprintSaving] = useState(false)
  const [editingFactoryBlueprint, setEditingFactoryBlueprint] = useState(false)
  const [blueprintDraft, setBlueprintDraft] = useState<FactoryBlueprintDraft>(createEmptyBlueprintDraft())
  const [factoryState, setFactoryState] = useState<ProjectFactoryState | null>(null)
  const [factoryStateLoading, setFactoryStateLoading] = useState(false)
  const [factoryStateError, setFactoryStateError] = useState<string | null>(null)
  const [spawningCases, setSpawningCases] = useState(false)
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([])
  const [artifactsLoading, setArtifactsLoading] = useState(false)
  const [artifactsError, setArtifactsError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [launchingTemplateId, setLaunchingTemplateId] = useState<string | null>(null)
  const [draftFactoryId, setDraftFactoryId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"operations" | "setup">("operations")
  const [selectedFactoryId, setSelectedFactoryId] = useAtom(selectedFactoryIdAtom)
  const [selectedCaseId, setSelectedCaseId] = useAtom(selectedFactoryCaseIdAtom)
  const [, setSelectedInboxTaskKey] = useAtom(selectedInboxTaskKeyAtom)
  const humanTasksRequestIdRef = useRef(0)
  const artifactsRequestIdRef = useRef(0)
  const blueprintRequestIdRef = useRef(0)
  const factoryStateRequestIdRef = useRef(0)

  const refreshHumanTasks = useCallback(async () => {
    const requestId = humanTasksRequestIdRef.current + 1
    humanTasksRequestIdRef.current = requestId
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
      if (humanTasksRequestIdRef.current !== requestId) return
      setHumanTasks(nextTasks)
    } catch (error) {
      if (humanTasksRequestIdRef.current !== requestId) return
      setHumanTasks([])
      setHumanTasksError(error instanceof Error ? error.message : String(error))
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
      setArtifactsError(null)
      return
    }

    setArtifactsLoading(true)
    setArtifactsError(null)
    try {
      const nextArtifacts = await window.api.listProjectArtifacts(selectedProject)
      if (artifactsRequestIdRef.current !== requestId) return
      setArtifacts(nextArtifacts)
    } catch (error) {
      if (artifactsRequestIdRef.current !== requestId) return
      setArtifacts([])
      setArtifactsError(error instanceof Error ? error.message : String(error))
    } finally {
      if (artifactsRequestIdRef.current !== requestId) return
      setArtifactsLoading(false)
    }
  }, [selectedProject])

  const refreshFactoryBlueprint = useCallback(async () => {
    const requestId = blueprintRequestIdRef.current + 1
    blueprintRequestIdRef.current = requestId
    if (!selectedProject) {
      setFactoryBlueprint(null)
      setFactoryBlueprintLoading(false)
      setFactoryBlueprintError(null)
      return
    }

    setFactoryBlueprintLoading(true)
    setFactoryBlueprintError(null)
    try {
      const nextBlueprint = await window.api.loadProjectFactoryBlueprint(selectedProject)
      if (blueprintRequestIdRef.current !== requestId) return
      setFactoryBlueprint(nextBlueprint)
    } catch (error) {
      if (blueprintRequestIdRef.current !== requestId) return
      setFactoryBlueprint(null)
      setFactoryBlueprintError(error instanceof Error ? error.message : String(error))
    } finally {
      if (blueprintRequestIdRef.current !== requestId) return
      setFactoryBlueprintLoading(false)
    }
  }, [selectedProject])

  const refreshFactoryState = useCallback(async () => {
    const requestId = factoryStateRequestIdRef.current + 1
    factoryStateRequestIdRef.current = requestId
    if (!selectedProject) {
      setFactoryState(null)
      setFactoryStateLoading(false)
      setFactoryStateError(null)
      return
    }

    setFactoryStateLoading(true)
    setFactoryStateError(null)
    try {
      const nextFactoryState = await window.api.loadProjectFactoryState(selectedProject)
      if (factoryStateRequestIdRef.current !== requestId) return
      setFactoryState(nextFactoryState)
    } catch (error) {
      if (factoryStateRequestIdRef.current !== requestId) return
      setFactoryState(null)
      setFactoryStateError(error instanceof Error ? error.message : String(error))
    } finally {
      if (factoryStateRequestIdRef.current !== requestId) return
      setFactoryStateLoading(false)
    }
  }, [selectedProject])

  const refreshFactoryData = useCallback(async () => {
    await Promise.all([
      refreshFactoryBlueprint(),
      refreshFactoryState(),
      refreshHumanTasks(),
      refreshArtifacts(),
    ])
  }, [refreshArtifacts, refreshFactoryBlueprint, refreshFactoryState, refreshHumanTasks])

  useEffect(() => {
    void refreshFactoryData()
  }, [refreshFactoryData])

  useEffect(() => {
    setEditingFactoryBlueprint(false)
    setDraftFactoryId(null)
    setSelectedFactoryId(null)
  }, [selectedProject])

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
  const templateById = useMemo(
    () => new Map(templates.map((template) => [template.id, template])),
    [templates],
  )

  const cases = useMemo<FactoryCase[]>(() => {
    const caseByRunId = new Map<string, string>()
    const caseByWorkflowPath = new Map<string, string>()
    const next = new Map<string, {
      id: string
      label: string
      factoryId: string
      factoryLabel: string
      artifacts: ArtifactRecord[]
      tasks: HumanTaskSummary[]
      relatedRuns: RunResult[]
      workflowPaths: Set<string>
      latestArtifact: ArtifactRecord | null
      activeRun: FactoryRunEntry | null
      latestRun: FactoryRunEntry | null
      lineageLabels: string[]
    }>()

    const ensureCase = (
      caseId: string,
      label: string,
      factoryId: string,
      factoryLabel: string,
    ) => {
      const existing = next.get(caseId)
      if (existing) {
        if (!existing.label && label) existing.label = label
        if (!existing.factoryLabel && factoryLabel) existing.factoryLabel = factoryLabel
        return existing
      }

      const created = {
        id: caseId,
        label,
        factoryId,
        factoryLabel,
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
      const factoryIdentity = resolveArtifactFactoryIdentity(artifact, templateById)
      if (!factoryIdentity) continue
      const entry = ensureCase(
        caseId,
        artifact.caseLabel || artifact.workflowName || artifact.title,
        factoryIdentity.id,
        factoryIdentity.label,
      )
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
      const factoryIdentity = resolveContextFactoryIdentity(context)
      if (!factoryIdentity) continue
      const entry = ensureCase(
        context.caseId,
        context.caseLabel || context.workflowName || context.templateName,
        factoryIdentity.id,
        factoryIdentity.label,
      )
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
      const existing = next.get(caseId)
      if (!existing) continue
      const target = ensureCase(caseId, entry.workflowName, existing.factoryId, existing.factoryLabel)
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
      const existing = next.get(caseId)
      if (!existing) continue
      const target = ensureCase(caseId, task.workflowName, existing.factoryId, existing.factoryLabel)
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
        factoryId: entry.factoryId,
        factoryLabel: entry.factoryLabel,
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
  const packRecipes = useMemo<FactoryPackRecipe[]>(() => {
    const templateById = new Map(templates.map((template) => [template.id, template]))
    const packIds = new Set<string>()
    const caseIdsByPack = new Map<string, Set<string>>()

    const rememberCaseForPack = (packId: string | undefined, caseId: string | undefined) => {
      if (!packId) return
      packIds.add(packId)
      if (!caseId) return
      const existing = caseIdsByPack.get(packId)
      if (existing) {
        existing.add(caseId)
      } else {
        caseIdsByPack.set(packId, new Set([caseId]))
      }
    }

    for (const artifact of artifacts) {
      const template = artifact.templateId ? templateById.get(artifact.templateId) : undefined
      rememberCaseForPack(template?.pack?.id, deriveArtifactCaseKey(artifact))
    }

    for (const context of Object.values(workflowTemplateContexts)) {
      rememberCaseForPack(context.pack?.id, context.caseId)
    }

    return Array.from(packIds).map((packId) => {
      const packTemplates = templates.filter((template) => template.pack?.id === packId)
      const packLabel = packTemplates[0]?.pack?.label || packId
      const entrypointTemplate = packTemplates.find((template) => template.pack?.entrypoint)

      return {
        id: packId,
        label: packLabel,
        stageLabels: deriveTemplatePackStagePath(templates, packId),
        contractLabels: dedupePreserveOrder(
          packTemplates.flatMap((template) => (template.contractOut || []).map((contract) => formatArtifactContractLabel(contract))),
        ),
        policyLabels: dedupePreserveOrder(
          packTemplates.flatMap((template) => deriveTemplateExecutionDisciplineLabels(template)),
        ),
        checkpointLabels: dedupePreserveOrder(
          packTemplates
            .filter((template) => templateHasStrategistCheckpoint(template))
            .map((template) => deriveTemplateJourneyStageLabel(template) || template.name),
        ),
        caseRule: entrypointTemplate
          ? `A new case starts when you launch ${entrypointTemplate.name}. Later stages reuse saved artifacts to continue that same case.`
          : "Cases are created from entry stages and then continue through saved artifacts and downstream launches.",
        activeCaseCount: caseIdsByPack.get(packId)?.size || 0,
      }
    }).sort((left, right) => right.activeCaseCount - left.activeCaseCount)
  }, [artifacts, templates, workflowTemplateContexts])
  const factoryOptions = useMemo<FactoryOption[]>(() => {
    const next = new Map<string, FactoryOption>()

    const rememberFactory = (option: FactoryOption) => {
      const existing = next.get(option.id)
      if (existing) {
        existing.caseCount = Math.max(existing.caseCount, option.caseCount)
        existing.artifactCount = Math.max(existing.artifactCount, option.artifactCount)
        if (existing.origin !== "saved" && option.origin === "saved") {
          existing.origin = "saved"
          existing.factory = option.factory
          existing.summary = option.summary
          existing.label = option.label
        }
        return
      }
      next.set(option.id, option)
    }

    for (const factory of factoryBlueprint?.factories || []) {
      rememberFactory({
        id: factory.id,
        label: factory.label,
        summary: factory.outcome?.statement || factory.recipe?.summary || "No saved outcome or recipe yet.",
        caseCount: 0,
        artifactCount: 0,
        origin: "saved",
        factory,
      })
    }

    for (const entry of cases) {
      const existing = next.get(entry.factoryId)
      if (existing) {
        existing.caseCount += 1
        existing.artifactCount += entry.artifacts.length
      } else {
        rememberFactory({
          id: entry.factoryId,
          label: entry.factoryLabel,
          summary: "Derived from saved artifacts and ongoing case lineage.",
          caseCount: 1,
          artifactCount: entry.artifacts.length,
          origin: "derived",
        })
      }
    }

    if (draftFactoryId) {
      rememberFactory({
        id: draftFactoryId,
        label: blueprintDraft.factoryLabel.trim() || "New factory",
        summary: "Unsaved factory draft.",
        caseCount: 0,
        artifactCount: 0,
        origin: "draft",
      })
    }

    return Array.from(next.values()).sort((left, right) => {
      if (left.origin === "draft" && right.origin !== "draft") return -1
      if (right.origin === "draft" && left.origin !== "draft") return 1
      if (left.caseCount !== right.caseCount) return right.caseCount - left.caseCount
      return left.label.localeCompare(right.label)
    })
  }, [blueprintDraft.factoryLabel, cases, draftFactoryId, factoryBlueprint?.factories])
  const effectiveSelectedFactoryId = useMemo(
    () => {
      if (selectedFactoryId && factoryOptions.some((factory) => factory.id === selectedFactoryId)) {
        return selectedFactoryId
      }
      if (factoryBlueprint?.selectedFactoryId && factoryOptions.some((factory) => factory.id === factoryBlueprint.selectedFactoryId)) {
        return factoryBlueprint.selectedFactoryId
      }
      return factoryOptions[0]?.id || null
    },
    [factoryBlueprint?.selectedFactoryId, factoryOptions, selectedFactoryId],
  )
  const selectedFactoryOption = useMemo(
    () => factoryOptions.find((factory) => factory.id === effectiveSelectedFactoryId) || null,
    [effectiveSelectedFactoryId, factoryOptions],
  )
  const selectedFactoryDefinition = selectedFactoryOption?.factory || null
  const selectedPackRecipes = useMemo(() => {
    const describePack = (packId: string): FactoryPackRecipe | null => {
      const packTemplates = templates.filter((template) => template.pack?.id === packId)
      if (packTemplates.length === 0) return null
      const packLabel = packTemplates[0]?.pack?.label || packId
      const entrypointTemplate = packTemplates.find((template) => template.pack?.entrypoint)
      return {
        id: packId,
        label: packLabel,
        stageLabels: deriveTemplatePackStagePath(templates, packId),
        contractLabels: dedupePreserveOrder(
          packTemplates.flatMap((template) => (template.contractOut || []).map((contract) => formatArtifactContractLabel(contract))),
        ),
        policyLabels: dedupePreserveOrder(
          packTemplates.flatMap((template) => deriveTemplateExecutionDisciplineLabels(template)),
        ),
        checkpointLabels: dedupePreserveOrder(
          packTemplates
            .filter((template) => templateHasStrategistCheckpoint(template))
            .map((template) => deriveTemplateJourneyStageLabel(template) || template.name),
        ),
        caseRule: entrypointTemplate
          ? `A new case starts when you launch ${entrypointTemplate.name}. Later stages reuse saved artifacts to continue that same case.`
          : "Cases are created from entry stages and then continue through saved artifacts and downstream launches.",
        activeCaseCount: 0,
      }
    }

    const referencedPackIds = new Set<string>(selectedFactoryDefinition?.recipe?.packIds || [])
    const selectedCases = cases.filter((entry) => entry.factoryId === effectiveSelectedFactoryId)
    for (const entry of selectedCases) {
      for (const artifact of entry.artifacts) {
        if (artifact.templateId) {
          const template = templateById.get(artifact.templateId)
          if (template?.pack?.id) referencedPackIds.add(template.pack.id)
        }
      }
      for (const template of entry.nextTemplates) {
        if (template.pack?.id) referencedPackIds.add(template.pack.id)
      }
    }
    const filtered = Array.from(referencedPackIds)
      .map((packId) => packRecipes.find((recipe) => recipe.id === packId) || describePack(packId))
      .filter((recipe): recipe is FactoryPackRecipe => recipe !== null)

    if (filtered.length > 0) return filtered
    return packRecipes.slice(0, 1)
  }, [cases, effectiveSelectedFactoryId, packRecipes, selectedFactoryDefinition?.recipe?.packIds, templateById, templates])
  const availableEntrypointTemplates = useMemo(() => {
    const selectedPackIds = new Set(selectedPackRecipes.map((recipe) => recipe.id))
    return templates
      .filter((template) => template.pack?.entrypoint)
      .filter((template) => selectedPackIds.size === 0 || (template.pack?.id ? selectedPackIds.has(template.pack.id) : false))
      .slice(0, 6)
  }, [selectedPackRecipes, templates])
  const scopedCases = useMemo(
    () => effectiveSelectedFactoryId ? cases.filter((entry) => entry.factoryId === effectiveSelectedFactoryId) : cases,
    [cases, effectiveSelectedFactoryId],
  )
  const scopedPlannedCases = useMemo(
    () => effectiveSelectedFactoryId
      ? (factoryState?.plannedCases || []).filter((entry) => entry.factoryId === effectiveSelectedFactoryId)
      : (factoryState?.plannedCases || []),
    [effectiveSelectedFactoryId, factoryState?.plannedCases],
  )
  const plannedCaseProgress = useMemo<FactoryPlannedCaseProgress[]>(
    () => scopedPlannedCases.map((plannedCase) => {
      const runtimeCase = scopedCases.find((entry) => entry.id === plannedCase.id) || null
      return {
        plannedCase,
        runtimeCase,
        status: runtimeCase?.status || "planned",
      }
    }),
    [scopedCases, scopedPlannedCases],
  )
  const scopedHumanTasks = useMemo(
    () => scopedCases.flatMap((entry) => entry.tasks),
    [scopedCases],
  )
  const scopedArtifacts = useMemo(
    () => effectiveSelectedFactoryId
      ? artifacts.filter((artifact) => {
        return resolveArtifactFactoryIdentity(artifact, templateById)?.id === effectiveSelectedFactoryId
      })
      : artifacts,
    [artifacts, effectiveSelectedFactoryId, templateById],
  )
  const scopedLiveRunEntries = useMemo(() => {
    const workflowPaths = new Set(scopedCases.flatMap((entry) => entry.workflowPaths))
    const runIds = new Set(scopedCases.flatMap((entry) => entry.relatedRuns.map((run) => run.runId)))
    return liveRunEntries.filter((entry) =>
      (entry.workflowPath ? workflowPaths.has(entry.workflowPath) : false)
      || (entry.state.runId ? runIds.has(entry.state.runId) : false),
    )
  }, [liveRunEntries, scopedCases])
  const scopedRecentRuns = useMemo(() => {
    const next = new Map<string, RunResult>()
    for (const entry of scopedCases) {
      for (const run of entry.relatedRuns) {
        if (!next.has(run.runId)) next.set(run.runId, run)
      }
    }
    return Array.from(next.values()).sort((left, right) => right.completedAt - left.completedAt).slice(0, 4)
  }, [scopedCases])
  const scopedRecentArtifacts = useMemo(() => scopedArtifacts.slice(0, 4), [scopedArtifacts])
  const scopedCompatibleTemplates = useMemo(() => {
    return templates
      .filter((template) => (template.contractIn?.length || 0) > 0)
      .filter((template) => areTemplateContractsSatisfied(template.contractIn, scopedArtifacts))
  }, [scopedArtifacts, templates])
  const scopedReadyTemplates = useMemo(() => scopedCompatibleTemplates.slice(0, 4), [scopedCompatibleTemplates])
  const scopedActiveRunsCount = useMemo(
    () => scopedLiveRunEntries.filter((entry) => isRunInFlight(entry.state.runStatus)).length,
    [scopedLiveRunEntries],
  )
  const completedPlannedCaseCount = useMemo(
    () => plannedCaseProgress.filter((entry) => entry.status === "completed").length,
    [plannedCaseProgress],
  )
  const readyCasesCount = useMemo(
    () => scopedCases.filter((entry) => entry.status === "ready").length,
    [scopedCases],
  )
  const spawnCandidateArtifact = useMemo(
    () => scopedArtifacts.find((artifact) => isSpawnFriendlyArtifactKind(artifact.kind)) || null,
    [scopedArtifacts],
  )
  const spawnTemplateCandidate = useMemo(() => {
    if (!spawnCandidateArtifact) return null
    const selectedPackIds = new Set(selectedPackRecipes.map((recipe) => recipe.id))
    return templates.find((template) =>
      template.pack?.id
      && selectedPackIds.has(template.pack.id)
      && (template.contractIn || []).some((contract) => contract.kind === spawnCandidateArtifact.kind),
    ) || null
  }, [selectedPackRecipes, spawnCandidateArtifact, templates])
  const caseLanes = useMemo(() => ([
    "blocked",
    "active",
    "ready",
    "completed",
  ] as const).map((status) => ({
    status,
    ...factoryLaneMeta(status),
    cases: scopedCases.filter((entry) => entry.status === status),
  })), [scopedCases])
  const selectedCase = useMemo(
    () => scopedCases.find((entry) => entry.id === selectedCaseId) || scopedCases[0] || null,
    [scopedCases, selectedCaseId],
  )

  useEffect(() => {
    if (effectiveSelectedFactoryId !== selectedFactoryId) {
      setSelectedFactoryId(effectiveSelectedFactoryId)
    }
  }, [effectiveSelectedFactoryId, selectedFactoryId, setSelectedFactoryId])

  useEffect(() => {
    if (scopedCases.length === 0) {
      if (selectedCaseId !== null) setSelectedCaseId(null)
      return
    }
    if (!selectedCaseId || !scopedCases.some((entry) => entry.id === selectedCaseId)) {
      setSelectedCaseId(scopedCases[0].id)
    }
  }, [scopedCases, selectedCaseId, setSelectedCaseId])

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
    const next: FactoryActionItem[] = []

    for (const entry of cases) {
      const primaryTask = entry.tasks[0]
      if (primaryTask) {
        next.push({
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
        })
        continue
      }

      if (entry.activeRun) {
        next.push({
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
        })
        continue
      }

      const primaryTemplate = entry.nextTemplates[0]
      if (primaryTemplate) {
        next.push({
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
        })
      }
    }

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
  const outcomeTrack = useMemo(
    () => computeOutcomeTrackStatus({
      targetCount: selectedFactoryDefinition?.outcome?.targetCount,
      plannedCount: plannedCaseProgress.length,
      windowStart: selectedFactoryDefinition?.outcome?.windowStart,
      windowEnd: selectedFactoryDefinition?.outcome?.windowEnd,
    }),
    [
      plannedCaseProgress.length,
      selectedFactoryDefinition?.outcome?.targetCount,
      selectedFactoryDefinition?.outcome?.windowEnd,
      selectedFactoryDefinition?.outcome?.windowStart,
    ],
  )
  const outcomeProgressFields = useMemo(() => {
    const targetValue = typeof selectedFactoryDefinition?.outcome?.targetCount === "number"
      ? `${selectedFactoryDefinition.outcome.targetCount}${selectedFactoryDefinition.outcome.targetUnit ? ` ${selectedFactoryDefinition.outcome.targetUnit}` : ""}`
      : "Not defined"
    const nextScheduled = plannedCaseProgress
      .map((entry) => entry.plannedCase.scheduledFor)
      .filter((value): value is string => Boolean(value))
      .sort()[0]

    return [
      {
        label: "Target",
        value: targetValue,
        hint: "The intended volume for this outcome.",
      },
      {
        label: "Planned items",
        value: String(plannedCaseProgress.length),
        hint: "Item cases generated from planning artifacts.",
      },
      {
        label: "Completed items",
        value: String(completedPlannedCaseCount),
        hint: "Spawned items that already reached a completed case state.",
        tone: completedPlannedCaseCount > 0 ? "success" : "default",
      },
      {
        label: "On track",
        value: outcomeTrack.label,
        hint: outcomeTrack.hint,
        tone: outcomeTrack.tone,
      },
      {
        label: "Next scheduled",
        value: nextScheduled ? formatFactoryDate(nextScheduled) : "Not scheduled",
        hint: "Earliest upcoming planned slot across item cases.",
      },
    ] satisfies CaseSummaryField[]
  }, [
    completedPlannedCaseCount,
    outcomeTrack.hint,
    outcomeTrack.label,
    outcomeTrack.tone,
    plannedCaseProgress,
    selectedFactoryDefinition?.outcome?.targetCount,
    selectedFactoryDefinition?.outcome?.targetUnit,
  ])
  const overviewFields = useMemo(() => {
    const outcomeValue = selectedFactoryDefinition?.outcome?.title?.trim() || selectedFactoryOption?.label || "Factory not defined yet"
    const bottleneckValue = scopedHumanTasks.length > 0
      ? `${scopedHumanTasks.length} strategist gate${scopedHumanTasks.length === 1 ? "" : "s"}`
      : scopedActiveRunsCount > 0
        ? `${scopedActiveRunsCount} live run${scopedActiveRunsCount === 1 ? "" : "s"}`
        : readyCasesCount > 0
          ? `${readyCasesCount} case${readyCasesCount === 1 ? "" : "s"} ready`
          : "No active bottleneck"
    const bottleneckHint = scopedHumanTasks.length > 0
      ? "Human review or missing input is the main limiter right now."
      : scopedActiveRunsCount > 0
        ? "Execution is the main moving part right now."
        : readyCasesCount > 0
          ? "The system is waiting for you to launch the next stage."
          : "This factory is idle until you start or continue a case."

    return [
      {
        label: "Mode",
        value: formatResultModeLabel(selectedFactoryDefinition?.modeId),
        hint: "Current mode",
      },
      {
        label: "Outcome",
        value: outcomeValue,
        hint: "Current target",
      },
      {
        label: "Cases",
        value: `${scopedCases.length} case${scopedCases.length === 1 ? "" : "s"} in this factory`,
        hint: "Tracked in this factory",
      },
      {
        label: "Bottleneck",
        value: bottleneckValue,
        hint: bottleneckHint,
        tone: scopedHumanTasks.length > 0 ? "warning" : scopedActiveRunsCount > 0 ? "info" : readyCasesCount > 0 ? "success" : "default",
      },
    ] satisfies CaseSummaryField[]
  }, [
    readyCasesCount,
    scopedActiveRunsCount,
    scopedCases.length,
    scopedHumanTasks.length,
    selectedFactoryDefinition,
    selectedFactoryOption,
  ])
  useEffect(() => {
    if (editingFactoryBlueprint) return
    setBlueprintDraft(buildBlueprintDraft(selectedFactoryDefinition, selectedPackRecipes))
  }, [editingFactoryBlueprint, selectedFactoryDefinition, selectedPackRecipes])

  const handleFactoryBlueprintFieldChange = useCallback((
    key: keyof FactoryBlueprintDraft,
    value: string,
  ) => {
    setBlueprintDraft((previous) => ({
      ...previous,
      [key]: value,
    }))
  }, [])

  const saveFactoryBlueprint = useCallback(async () => {
    if (!selectedProject) return

    setFactoryBlueprintSaving(true)
    setFactoryBlueprintError(null)
    try {
      const activePackIds = dedupePreserveOrder([
        ...(selectedFactoryDefinition?.recipe?.packIds || []),
        ...selectedPackRecipes.map((recipe) => recipe.id),
      ])
      const targetCount = blueprintDraft.targetCount.trim()
      const fallbackId = `factory:${Date.now().toString(36)}`
      const persistedFactoryId = selectedFactoryDefinition?.id
        || (effectiveSelectedFactoryId?.startsWith("factory:") ? effectiveSelectedFactoryId : null)
        || buildFactoryIdFromLabel(blueprintDraft.factoryLabel || blueprintDraft.outcomeTitle || "factory", fallbackId)
      const nextFactory: ProjectFactoryDefinition = {
        id: persistedFactoryId,
        modeId: selectedFactoryDefinition?.modeId,
        label: blueprintDraft.factoryLabel.trim() || blueprintDraft.outcomeTitle.trim() || selectedFactoryOption?.label || "Untitled factory",
        outcome: {
          title: blueprintDraft.outcomeTitle,
          statement: blueprintDraft.outcomeStatement,
          successSignal: blueprintDraft.successSignal,
          timeHorizon: blueprintDraft.timeHorizon,
          windowStart: blueprintDraft.windowStart,
          windowEnd: blueprintDraft.windowEnd,
          targetCount: targetCount ? Number(targetCount) : null,
          targetUnit: blueprintDraft.targetUnit,
          audience: blueprintDraft.audience,
          constraints: splitLines(blueprintDraft.constraintsText),
        },
        recipe: {
          summary: blueprintDraft.recipeSummary,
          packIds: activePackIds.length > 0 ? activePackIds : undefined,
          stageOrder: splitLines(blueprintDraft.stageOrderText),
          artifactContracts: splitLines(blueprintDraft.artifactContractsText),
          qualityPolicy: splitLines(blueprintDraft.qualityPolicyText),
          strategistCheckpoints: splitLines(blueprintDraft.strategistCheckpointsText),
          caseGenerationRules: splitLines(blueprintDraft.caseGenerationRulesText),
        },
        createdAt: selectedFactoryDefinition?.createdAt || Date.now(),
        updatedAt: Date.now(),
      }
      const existingFactories = (factoryBlueprint?.factories || []).filter((factory) => factory.id !== selectedFactoryDefinition?.id)
      const saved = await window.api.saveProjectFactoryBlueprint({
        projectPath: selectedProject,
        blueprint: {
          factories: [...existingFactories, nextFactory],
          selectedFactoryId: persistedFactoryId,
        },
      })
      setFactoryBlueprint(saved)
      setSelectedFactoryId(saved.selectedFactoryId || persistedFactoryId)
      setDraftFactoryId(null)
      setEditingFactoryBlueprint(false)
      toast.success("Factory blueprint saved")
    } catch (error) {
      setFactoryBlueprintError(error instanceof Error ? error.message : String(error))
      toast.error("Could not save factory blueprint", {
        description: String(error),
      })
    } finally {
      setFactoryBlueprintSaving(false)
    }
  }, [
    blueprintDraft,
    effectiveSelectedFactoryId,
    factoryBlueprint?.factories,
    selectedFactoryDefinition,
    selectedFactoryOption?.label,
    selectedPackRecipes,
    selectedProject,
    setSelectedFactoryId,
  ])

  const startNewFactory = useCallback(() => {
    const nextDraftId = `draft:${Date.now().toString(36)}`
    setDraftFactoryId(nextDraftId)
    setSelectedFactoryId(nextDraftId)
    setBlueprintDraft(createEmptyBlueprintDraft())
    setEditingFactoryBlueprint(true)
    setActiveTab("setup")
  }, [setSelectedFactoryId])

  const spawnPlannedCases = useCallback(async () => {
    if (!selectedProject || !effectiveSelectedFactoryId || !spawnCandidateArtifact || !spawnTemplateCandidate) return

    setSpawningCases(true)
    setFactoryStateError(null)
    try {
      const result = await window.api.spawnFactoryCasesFromArtifact({
        projectPath: selectedProject,
        factoryId: effectiveSelectedFactoryId,
        artifactId: spawnCandidateArtifact.id,
        templateId: spawnTemplateCandidate.id,
      })
      setFactoryState(result.state)
      if (result.plannedCases.length === 0) {
        toast.message("No new item cases were added", {
          description: "This planning artifact already spawned the current item cases.",
        })
      } else {
        toast.success(`Spawned ${result.plannedCases.length} item case${result.plannedCases.length === 1 ? "" : "s"}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setFactoryStateError(message)
      toast.error("Could not spawn item cases", {
        description: message,
      })
    } finally {
      setSpawningCases(false)
    }
  }, [
    effectiveSelectedFactoryId,
    selectedProject,
    spawnCandidateArtifact,
    spawnTemplateCandidate,
  ])

  const launchPlannedCase = useCallback(async (plannedCase: FactoryPlannedCase) => {
    if (!selectedProject || launchingTemplateId) return
    const template = (plannedCase.templateId && templateById.get(plannedCase.templateId)) || spawnTemplateCandidate
    if (!template) {
      toast.error("No downstream template is linked to this planned case yet")
      return
    }

    const sourceArtifacts = plannedCase.sourceArtifactId
      ? scopedArtifacts.filter((artifact) => artifact.id === plannedCase.sourceArtifactId)
      : scopedArtifacts

    setLaunchingTemplateId(template.id)
    try {
      const launch = await prepareTemplateStageLaunch({
        projectPath: selectedProject,
        template,
        webSearchBackend,
        artifacts: selectArtifactsForTemplateContracts(template.contractIn, sourceArtifacts),
        factory: selectedFactoryDefinition
          ? {
            id: selectedFactoryDefinition.id,
            label: selectedFactoryDefinition.label,
          }
          : null,
        caseOverride: {
          caseId: plannedCase.id,
          caseLabel: plannedCase.title,
        },
        inputSeedPrefix: plannedCase.prompt || plannedCase.summary || plannedCase.title,
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
      toast.error("Could not open the planned case", {
        description: String(error),
      })
    } finally {
      setLaunchingTemplateId(null)
    }
  }, [
    launchingTemplateId,
    scopedArtifacts,
    selectedFactoryDefinition,
    selectedProject,
    setInputAttachments,
    setInputValue,
    setMainView,
    setSelectedWorkflowPath,
    setWorkflow,
    setWorkflowEntryState,
    setWorkflowSavedSnapshot,
    setWorkflowTemplateContextForKey,
    setWorkflows,
    spawnTemplateCandidate,
    templateById,
    webSearchBackend,
  ])

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

  const launchTemplate = async (template: WorkflowTemplate, sourceArtifacts = scopedArtifacts) => {
    if (!selectedProject || launchingTemplateId) return

    setLaunchingTemplateId(template.id)
    try {
      const launch = await prepareTemplateStageLaunch({
        projectPath: selectedProject,
        template,
        webSearchBackend,
        artifacts: selectArtifactsForTemplateContracts(template.contractIn, sourceArtifacts),
        factory: selectedFactoryDefinition
          ? {
            id: selectedFactoryDefinition.id,
            label: selectedFactoryDefinition.label,
          }
          : null,
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
          subtitle={`Advanced project view for outcomes, outputs, live work, and review gates in ${projectFolderName(selectedProject)}.`}
          actions={(
            <>
              <Button variant="outline" size="sm" onClick={() => setMainView("artifacts")}>
                <FileStack size={14} />
                Open outputs
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

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-2/30 px-4 py-3">
            <div className="space-y-0.5">
              <p className="ui-meta-label text-muted-foreground">Project</p>
              <p className="text-body-md font-medium text-foreground">{projectFolderName(selectedProject)}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setMainView("templates")}>
              <Rocket size={14} />
              Templates
            </Button>
          </div>

          <SummaryRail
            items={overviewFields}
            className="xl:grid-cols-4"
            compact
          />

          <article className="rounded-xl surface-panel p-5 space-y-4">
            <SectionHeading
              title="Outcomes"
              meta={(
                <Button variant="outline" size="sm" onClick={startNewFactory}>
                  New outcome
                </Button>
              )}
            />

            {factoryOptions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
                No saved outcomes yet. Start a mode once, then let cases and outputs accumulate underneath it.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                {factoryOptions.map((factory) => (
                  <button
                    key={factory.id}
                    type="button"
                    onClick={() => {
                      setSelectedFactoryId(factory.id)
                      setEditingFactoryBlueprint(false)
                    }}
                    className={`rounded-lg border px-4 py-3 text-left space-y-2 ui-transition-colors ui-motion-fast ${
                      effectiveSelectedFactoryId === factory.id
                        ? "border-primary/35 bg-primary/8 shadow-[inset_0_1px_0_hsl(var(--primary)/0.08),0_10px_22px_hsl(var(--foreground)/0.05)]"
                        : "border-hairline bg-surface-2/35 hover:bg-surface-2/55"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-title-sm text-foreground">{factory.label}</div>
                      <Badge variant="outline" className="ui-meta-text px-2 py-0">
                        {factory.origin === "saved" ? "Saved" : factory.origin === "draft" ? "Draft" : "Derived"}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-body-sm text-muted-foreground">
                      {factory.summary}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
                      <span>{factory.caseCount} case{factory.caseCount === 1 ? "" : "s"}</span>
                      <span className="text-border">•</span>
                      <span>{factory.artifactCount} output{factory.artifactCount === 1 ? "" : "s"}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </article>

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as "operations" | "setup")}
            className="space-y-4"
          >
            <TabsList className="h-control-md">
              <TabsTrigger value="operations" className="px-3 py-1 text-body-sm">
                Operations
              </TabsTrigger>
              <TabsTrigger value="setup" className="px-3 py-1 text-body-sm">
                Setup
              </TabsTrigger>
            </TabsList>

            <TabsContent value="setup" className="mt-0 space-y-4">
          <article className="rounded-xl surface-panel p-5 space-y-4">
            <SectionHeading
              title="Selected outcome"
              meta={(
                editingFactoryBlueprint ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingFactoryBlueprint(false)
                        setBlueprintDraft(buildBlueprintDraft(selectedFactoryDefinition, selectedPackRecipes))
                        setDraftFactoryId(null)
                      }}
                      disabled={factoryBlueprintSaving}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => { void saveFactoryBlueprint() }} disabled={factoryBlueprintSaving}>
                      {factoryBlueprintSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                      Save outcome
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingFactoryBlueprint(true)
                      setActiveTab("setup")
                    }}
                  >
                    {selectedFactoryOption ? "Edit outcome" : "Define outcome"}
                  </Button>
                )
              )}
            />

            {factoryBlueprintError ? (
              <div role="alert" className="rounded-lg border border-status-danger/25 bg-status-danger/5 px-4 py-3 text-body-sm text-status-danger">
                {factoryBlueprintError}
              </div>
            ) : null}

            {factoryBlueprintLoading ? (
              <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
                Loading the saved outcome and guided path for this project...
              </div>
            ) : editingFactoryBlueprint ? (
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="factory-label">Path name</Label>
                    <Input
                      id="factory-label"
                      value={blueprintDraft.factoryLabel}
                      onChange={(event) => handleFactoryBlueprintFieldChange("factoryLabel", event.target.value)}
                      placeholder="AI trends content engine"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="factory-outcome-title">Outcome title</Label>
                    <Input
                      id="factory-outcome-title"
                      value={blueprintDraft.outcomeTitle}
                      onChange={(event) => handleFactoryBlueprintFieldChange("outcomeTitle", event.target.value)}
                      placeholder="30-day AI trends content run"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="factory-outcome-statement">Outcome statement</Label>
                    <Textarea
                      id="factory-outcome-statement"
                      value={blueprintDraft.outcomeStatement}
                      onChange={(event) => handleFactoryBlueprintFieldChange("outcomeStatement", event.target.value)}
                      placeholder="Generate 100 strong Facebook posts about AI and agents over the next 30 days."
                      rows={4}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="factory-success-signal">Success signal</Label>
                      <Input
                        id="factory-success-signal"
                        value={blueprintDraft.successSignal}
                        onChange={(event) => handleFactoryBlueprintFieldChange("successSignal", event.target.value)}
                        placeholder="Approved calendar and ready-to-publish posts"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="factory-time-horizon">Time horizon</Label>
                      <Input
                        id="factory-time-horizon"
                        value={blueprintDraft.timeHorizon}
                        onChange={(event) => handleFactoryBlueprintFieldChange("timeHorizon", event.target.value)}
                        placeholder="Next 30 days"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="factory-window-start">Window start</Label>
                      <Input
                        id="factory-window-start"
                        type="date"
                        value={blueprintDraft.windowStart}
                        onChange={(event) => handleFactoryBlueprintFieldChange("windowStart", event.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="factory-window-end">Window end</Label>
                      <Input
                        id="factory-window-end"
                        type="date"
                        value={blueprintDraft.windowEnd}
                        onChange={(event) => handleFactoryBlueprintFieldChange("windowEnd", event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="factory-target-count">Target count</Label>
                      <Input
                        id="factory-target-count"
                        type="number"
                        min={0}
                        value={blueprintDraft.targetCount}
                        onChange={(event) => handleFactoryBlueprintFieldChange("targetCount", event.target.value)}
                        placeholder="100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="factory-target-unit">Target unit</Label>
                      <Input
                        id="factory-target-unit"
                        value={blueprintDraft.targetUnit}
                        onChange={(event) => handleFactoryBlueprintFieldChange("targetUnit", event.target.value)}
                        placeholder="posts"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="factory-audience">Audience</Label>
                      <Input
                        id="factory-audience"
                        value={blueprintDraft.audience}
                        onChange={(event) => handleFactoryBlueprintFieldChange("audience", event.target.value)}
                        placeholder="Founders and operators following AI"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="factory-constraints">Constraints</Label>
                    <Textarea
                      id="factory-constraints"
                      value={blueprintDraft.constraintsText}
                      onChange={(event) => handleFactoryBlueprintFieldChange("constraintsText", event.target.value)}
                      placeholder={"Use company ToV\nNo AI slop\nKeep posts concise and evidence-backed"}
                      rows={4}
                    />
                    <p className="ui-meta-text text-muted-foreground">One constraint per line.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="factory-recipe-summary">Guided path summary</Label>
                    <Textarea
                      id="factory-recipe-summary"
                      value={blueprintDraft.recipeSummary}
                      onChange={(event) => handleFactoryBlueprintFieldChange("recipeSummary", event.target.value)}
                      placeholder="Trend watch -> ideas -> editorial calendar -> draft -> QA -> distribution"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="factory-stage-order">Path steps</Label>
                    <Textarea
                      id="factory-stage-order"
                      value={blueprintDraft.stageOrderText}
                      onChange={(event) => handleFactoryBlueprintFieldChange("stageOrderText", event.target.value)}
                      placeholder={"Trend watch\nIdea backlog\nEditorial calendar\nDraft post\nQA review\nDistribution bundle"}
                      rows={5}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="factory-case-rules">How this scales</Label>
                    <Textarea
                      id="factory-case-rules"
                      value={blueprintDraft.caseGenerationRulesText}
                      onChange={(event) => handleFactoryBlueprintFieldChange("caseGenerationRulesText", event.target.value)}
                      placeholder={"Editorial calendar -> post cases\nApproved sample set -> scale production"}
                      rows={4}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="factory-quality-policy">Quality rules</Label>
                      <Textarea
                        id="factory-quality-policy"
                        value={blueprintDraft.qualityPolicyText}
                        onChange={(event) => handleFactoryBlueprintFieldChange("qualityPolicyText", event.target.value)}
                        placeholder={"Voice-locked\nNo-slop review\nPublish gate"}
                        rows={4}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="factory-checkpoints">Strategist checkpoints</Label>
                      <Textarea
                        id="factory-checkpoints"
                        value={blueprintDraft.strategistCheckpointsText}
                        onChange={(event) => handleFactoryBlueprintFieldChange("strategistCheckpointsText", event.target.value)}
                        placeholder={"Approve direction\nApprove calendar\nApprove sample quality"}
                        rows={4}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="factory-artifact-contracts">Reusable outputs</Label>
                    <Textarea
                      id="factory-artifact-contracts"
                      value={blueprintDraft.artifactContractsText}
                      onChange={(event) => handleFactoryBlueprintFieldChange("artifactContractsText", event.target.value)}
                      placeholder={"Trend Digest\nIdea Backlog\nEditorial Calendar\nDraft\nQA Report\nDistribution Bundle"}
                      rows={4}
                    />
                  </div>
                </div>
              </div>
            ) : selectedFactoryDefinition || selectedFactoryOption ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-title-sm text-foreground">
                        {selectedFactoryDefinition?.outcome?.title || selectedFactoryOption?.label || "Untitled factory"}
                      </h3>
                      <Badge variant="outline" className="ui-meta-text px-2 py-0">
                        {formatResultModeLabel(selectedFactoryDefinition?.modeId)}
                      </Badge>
                    </div>
                    <p className="text-body-sm text-muted-foreground">
                      {selectedFactoryDefinition?.outcome?.statement || selectedFactoryOption?.summary || "No saved outcome statement yet."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setMainView("artifacts")}>
                      <FileStack size={14} />
                      Outputs
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => {
                      setSelectedInboxTaskKey(null)
                      setMainView("inbox")
                    }}>
                      <Inbox size={14} />
                      Inbox
                    </Button>
                  </div>
                </div>

                <SummaryRail
                  items={[
                    {
                      label: "Success signal",
                      value: selectedFactoryDefinition?.outcome?.successSignal || "Not defined",
                    },
                    {
                      label: "Time horizon",
                      value: selectedFactoryDefinition?.outcome?.timeHorizon || "Not defined",
                    },
                    {
                      label: "Window",
                      value: selectedFactoryDefinition?.outcome?.windowStart || selectedFactoryDefinition?.outcome?.windowEnd
                        ? `${formatFactoryDate(selectedFactoryDefinition?.outcome?.windowStart)} -> ${formatFactoryDate(selectedFactoryDefinition?.outcome?.windowEnd)}`
                        : "Not defined",
                    },
                    {
                      label: "Target",
                      value: typeof selectedFactoryDefinition?.outcome?.targetCount === "number"
                        ? `${selectedFactoryDefinition.outcome.targetCount}${selectedFactoryDefinition.outcome.targetUnit ? ` ${selectedFactoryDefinition.outcome.targetUnit}` : ""}`
                        : "Not defined",
                    },
                    {
                      label: "Audience",
                      value: selectedFactoryDefinition?.outcome?.audience || "Not defined",
                    },
                  ]}
                  className="xl:grid-cols-5"
                  compact
                />

                <BadgeGroup
                  label="Constraints"
                  items={selectedFactoryDefinition?.outcome?.constraints || []}
                  emptyLabel="No constraints"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
                No saved outcome yet.
              </div>
            )}
          </article>
            </TabsContent>

            <TabsContent value="operations" className="mt-0 space-y-4">
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-4">
          <StatCard
            label="Active runs"
            value={String(scopedActiveRunsCount)}
            hint={scopedActiveRunsCount > 0 ? "Flows currently executing or waiting on a gate." : "Nothing is actively running right now."}
            tone={scopedActiveRunsCount > 0 ? "info" : "default"}
          />
          <StatCard
            label="Waiting on you"
            value={String(scopedHumanTasks.length)}
            hint={scopedHumanTasks.length > 0 ? "Structured review or input tasks are blocking progress." : "No open HIL tasks right now."}
            tone={scopedHumanTasks.length > 0 ? "warning" : "default"}
          />
          <StatCard
            label="Saved outputs"
            value={String(scopedArtifacts.length)}
            hint={scopedArtifacts.length > 0 ? "Reusable outputs available for downstream stages." : "Run a stage to create reusable outputs."}
          />
          <StatCard
            label="Ready next steps"
            value={String(readyCasesCount)}
            hint={readyCasesCount > 0 ? "Cases with a next step ready to open." : "No downstream step is ready yet."}
            tone={readyCasesCount > 0 ? "success" : "default"}
          />
        </section>

        {scopedCases.length === 0 && availableEntrypointTemplates.length > 0 ? (
          <section className="rounded-xl surface-panel p-5 space-y-4">
            <SectionHeading
              title="Entrypoints"
              meta={(
                <Badge variant="outline" className="ui-meta-text px-2 py-0">
                  {availableEntrypointTemplates.length} ready
                </Badge>
              )}
            />

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {availableEntrypointTemplates.map((template) => {
                const stageLabel = deriveTemplateJourneyStageLabel(template)
                const disciplineLabels = deriveTemplateExecutionDisciplineLabels(template)
                const isLaunching = launchingTemplateId === template.id
                return (
                  <article key={template.id} className="rounded-lg border border-hairline bg-surface-2/35 px-4 py-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-body-md font-medium text-foreground">{template.name}</h3>
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
                    <p className="text-body-sm text-muted-foreground">
                      {deriveTemplateUseWhen(template)}
                    </p>
                    {disciplineLabels.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {disciplineLabels.slice(0, 3).map((label) => (
                          <Badge key={`${template.id}-${label}`} variant="secondary" className="ui-meta-text px-2 py-0">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => { void launchTemplate(template, []) }} disabled={Boolean(launchingTemplateId)}>
                        {isLaunching ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                        {isLaunching ? "Opening..." : "Open"}
                      </Button>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ) : null}

        <section className="rounded-xl surface-panel p-5 space-y-4">
          <SectionHeading
            title="Progress"
            meta={(
              <div className="flex items-center gap-2">
                {spawnCandidateArtifact && spawnTemplateCandidate ? (
                  <Button size="sm" onClick={() => { void spawnPlannedCases() }} disabled={spawningCases}>
                    {spawningCases ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                    {spawningCases ? "Spawning..." : `Spawn from ${spawnCandidateArtifact.title}`}
                  </Button>
                ) : null}
              </div>
            )}
          />

          <SummaryRail
            items={outcomeProgressFields}
            className="xl:grid-cols-5"
            compact
          />

          {factoryStateError ? (
            <div role="alert" className="rounded-lg border border-status-danger/25 bg-status-danger/5 px-4 py-3 text-body-sm text-status-danger">
              {factoryStateError}
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="ui-meta-label text-muted-foreground">Planned items</div>
            {factoryStateLoading ? (
              <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
                Loading planned item cases...
              </div>
            ) : plannedCaseProgress.length === 0 ? (
              <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
                {spawnCandidateArtifact
                  ? `Use ${spawnCandidateArtifact.title} to spawn item-level work and compare planned volume against the target.`
                  : "No planning output is available yet to spawn item-level work."}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {plannedCaseProgress.slice(0, 8).map((entry) => {
                  const isLaunching = launchablePlannedTemplateId(entry.plannedCase, templateById, spawnTemplateCandidate) === launchingTemplateId
                  return (
                    <article key={entry.plannedCase.id} className="rounded-lg border border-hairline bg-surface-2/35 px-4 py-4 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-body-md font-medium text-foreground">{entry.plannedCase.title}</h3>
                            <span className={cn("ui-status-badge ui-meta-text", cardToneClass(factoryCaseStatusTone(entry.status === "planned" ? "ready" : entry.status)))}>
                              {entry.status === "planned" ? "Planned" : factoryCaseStatusLabel(entry.status)}
                            </span>
                            {entry.plannedCase.scheduledFor ? (
                              <Badge variant="secondary" className="ui-meta-text px-2 py-0">
                                {formatFactoryDate(entry.plannedCase.scheduledFor)}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-body-sm text-muted-foreground">
                            {entry.plannedCase.summary || entry.plannedCase.sourceArtifactTitle || "Item case derived from a planning artifact."}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {entry.runtimeCase ? (
                          <Button variant="outline" size="sm" onClick={() => focusCase(entry.runtimeCase!.id)}>
                            Focus case
                          </Button>
                        ) : null}
                        {!entry.runtimeCase ? (
                          <Button
                            size="sm"
                            onClick={() => { void launchPlannedCase(entry.plannedCase) }}
                            disabled={Boolean(launchingTemplateId)}
                          >
                            {isLaunching ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                            {isLaunching ? "Opening..." : "Start item"}
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </section>

            </TabsContent>
            <TabsContent value="setup" className="mt-0 space-y-4">
        <section className="rounded-xl surface-panel p-5 space-y-4">
          <SectionHeading
            title="Guided path"
            meta={(
              <Badge variant="outline" className="ui-meta-text px-2 py-0">
                {selectedPackRecipes.length} built-in
              </Badge>
            )}
          />

          <article className="rounded-lg border border-hairline bg-surface-2/35 px-4 py-4 space-y-4">
            <div className="space-y-1">
              <h2 className="text-title-sm text-foreground">{selectedFactoryOption?.label || "Factory"} guided path</h2>
              <p className="text-body-sm text-muted-foreground">
                {selectedFactoryDefinition?.recipe?.summary
                  || "Stages, contracts, and review points for this outcome."}
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <BadgeGroup
                label="Built-in paths"
                items={dedupePreserveOrder([
                  ...((selectedFactoryDefinition?.recipe?.packIds || [])
                    .map((packId) => selectedPackRecipes.find((recipe) => recipe.id === packId)?.label || packId)),
                  ...selectedPackRecipes.map((recipe) => recipe.label),
                ])}
                emptyLabel="No linked path"
                variant="outline"
              />
              <BadgeGroup
                label="Path steps"
                items={selectedFactoryDefinition?.recipe?.stageOrder || selectedPackRecipes[0]?.stageLabels || []}
                emptyLabel="No steps yet"
                variant="outline"
              />
              <BadgeGroup
                label="Reusable outputs"
                items={selectedFactoryDefinition?.recipe?.artifactContracts || selectedPackRecipes[0]?.contractLabels || []}
                emptyLabel="No contracts yet"
              />
              <BadgeGroup
                label="Quality rules"
                items={selectedFactoryDefinition?.recipe?.qualityPolicy || selectedPackRecipes[0]?.policyLabels || []}
                emptyLabel="No rules yet"
                variant="info"
              />
              <BadgeGroup
                label="Strategist checkpoints"
                items={selectedFactoryDefinition?.recipe?.strategistCheckpoints || selectedPackRecipes[0]?.checkpointLabels || []}
                emptyLabel="No checkpoints yet"
                variant="warning"
              />
              <BadgeGroup
                label="Scaling"
                items={selectedFactoryDefinition?.recipe?.caseGenerationRules || (selectedPackRecipes[0] ? [selectedPackRecipes[0].caseRule] : [])}
                emptyLabel="No scale rule yet"
                variant="success"
              />
            </div>
          </article>

          {selectedPackRecipes.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {selectedPackRecipes.map((recipe) => (
                <article key={recipe.id} className="rounded-lg border border-hairline bg-surface-2/35 px-4 py-4 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-title-sm text-foreground">{recipe.label}</h2>
                        <Badge variant="outline" className="ui-meta-text px-2 py-0">
                          {recipe.activeCaseCount} case{recipe.activeCaseCount === 1 ? "" : "s"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-body-sm text-muted-foreground">
                        {recipe.caseRule}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <BadgeGroup
                      label="Steps"
                      items={recipe.stageLabels}
                      emptyLabel="No steps"
                      variant="outline"
                    />
                    <BadgeGroup
                      label="Outputs"
                      items={recipe.contractLabels.slice(0, 6)}
                      emptyLabel="No outputs"
                    />
                    <BadgeGroup
                      label="Quality"
                      items={recipe.policyLabels.slice(0, 6)}
                      emptyLabel="No rules"
                      variant="info"
                    />
                    <BadgeGroup
                      label="Checkpoints"
                      items={recipe.checkpointLabels}
                      emptyLabel="No checkpoints"
                      variant="warning"
                    />
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
            </TabsContent>
            <TabsContent value="operations" className="mt-0 space-y-4">

        <section className="space-y-4">
          <SectionHeading title="Operations" />

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
                          <span className={cn("ui-status-badge ui-meta-text", cardToneClass(action.tone))}>
                            {factoryActionLabel(action.kind)}
                          </span>
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
                {scopedCases.length} tracked
              </Badge>
            )}
          />

          {scopedCases.length === 0 ? (
            <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
              No derived cases yet for this factory. Run an entry stage and persist artifacts to establish case lineage.
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
                                  <span className={cn("ui-status-badge ui-meta-text", cardToneClass(statusTone))}>
                                    {factoryCaseStatusLabel(entry.status)}
                                  </span>
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
                              compact
                            />

                            <div className="space-y-2">
                              <div className="ui-meta-label text-muted-foreground">Next action</div>
                              {entry.activeRun ? (
                                <div className="rounded-md surface-info-soft px-3 py-2 text-body-sm text-foreground">
                                  {entry.activeRun.summary.activeStepLabel || "Run in progress"}{entry.activeRun.runStartedAt ? ` · ${formatElapsedTime(entry.activeRun.runStartedAt)}` : ""}
                                </div>
                              ) : entry.tasks[0] ? (
                                <div className="rounded-md surface-warning-soft px-3 py-2 text-body-sm text-foreground">
                                  {entry.tasks[0].title}
                                </div>
                              ) : primaryTemplate ? (
                                <div className="rounded-md surface-success-soft px-3 py-2 text-body-sm text-foreground">
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
                  <span className={cn("ui-status-badge ui-meta-text", cardToneClass(factoryCaseStatusTone(selectedCase.status)))}>
                    {factoryCaseStatusLabel(selectedCase.status)}
                  </span>
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
                  <div className="rounded-lg surface-info-soft px-4 py-3">
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
                    compact
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
                      <div key={`${task.workspace}:${task.taskId}`} className="rounded-lg surface-warning-soft px-4 py-3">
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
                  {humanTasksLoading ? "Loading..." : `${scopedHumanTasks.length} open`}
                </Badge>
              )}
            />

            {humanTasksError ? (
              <div role="alert" className="rounded-lg border border-status-danger/25 bg-status-danger/5 px-4 py-3 text-body-sm text-status-danger">
                {humanTasksError}
              </div>
            ) : scopedHumanTasks.length === 0 && !humanTasksLoading ? (
              <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
                No human gates are blocking this factory right now.
              </div>
            ) : (
              <div className="space-y-2">
                {scopedHumanTasks.slice(0, 4).map((task) => (
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
                  {templatesLoading ? "Loading..." : `${scopedCompatibleTemplates.length} ready`}
                </Badge>
              )}
            />

            {templatesError ? (
              <div role="alert" className="rounded-lg border border-status-danger/25 bg-status-danger/5 px-4 py-3 text-body-sm text-status-danger">
                {templatesError}
              </div>
            ) : scopedReadyTemplates.length === 0 && !templatesLoading ? (
              <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
                No downstream stage is fully ready yet for this factory. Use artifacts to build up the required contracts first.
              </div>
            ) : (
              <div className="space-y-2">
                {scopedReadyTemplates.map((template) => {
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
                            : "Ready from the current factory artifacts."}
                        </div>
                      </div>
                      <Button size="sm" onClick={() => { void launchTemplate(template, scopedArtifacts) }} disabled={Boolean(launchingTemplateId)}>
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
              title={scopedLiveRunEntries.length > 0 ? "Live work" : "Recent runs"}
              meta={(
                <Badge variant="outline" className="ui-meta-text px-2 py-0">
                  {scopedLiveRunEntries.length > 0 ? `${scopedLiveRunEntries.length} tracked` : `${scopedRecentRuns.length} recent`}
                </Badge>
              )}
            />

            {scopedLiveRunEntries.length === 0 && scopedRecentRuns.length === 0 ? (
              <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
                No runs to show yet for this factory.
              </div>
            ) : scopedLiveRunEntries.length > 0 ? (
              <div className="space-y-2">
                {scopedLiveRunEntries.slice(0, 4).map((entry) => (
                  <div
                    key={entry.workflowKey}
                    className="rounded-lg border border-hairline bg-surface-2/45 px-3 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-body-sm font-medium text-foreground">{entry.workflowName}</div>
                          <span className={cn("ui-status-badge ui-meta-text", cardToneClass(entry.summary.tone))}>
                            {entry.summary.phaseLabel}
                          </span>
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
                {scopedRecentRuns.map((run) => (
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
            ) : scopedRecentArtifacts.length === 0 && !artifactsLoading ? (
              <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
                No reusable artifacts have been saved for this factory yet.
              </div>
            ) : (
              <div className="space-y-2">
                {scopedRecentArtifacts.map((artifact) => (
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
        </section>
            </TabsContent>
          </Tabs>
        </section>
      </PageShell>
      {unsavedChangesDialog}
    </>
  )
}
