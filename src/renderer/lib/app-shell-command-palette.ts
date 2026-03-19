import type { ResultModeId, WorkflowFile } from "@shared/types"
import type { WorkflowExecutionState } from "@/lib/workflow-execution"
import { formatRelativeTime, projectFolderName, workflowHasActiveRunStatus } from "@/components/sidebar/projectSidebarUtils"
import { inferResultModeFromText } from "@/lib/result-modes"

export type AppShellCommandAction =
  | "new_process"
  | "add_project"
  | "process_library"
  | "inbox"
  | "settings"

export interface AppShellActionEntry {
  kind: "action"
  id: string
  action: AppShellCommandAction
  label: string
  keywords: string[]
  subtitle?: string
}

export interface AppShellWorkflowEntry {
  kind: "workflow"
  id: string
  workflowPath: string
  projectPath: string
  label: string
  projectLabel: string
  metaLabel: string
  active: boolean
  updatedAt: number
  keywords: string[]
}

export interface AppShellStartEntry {
  kind: "start"
  id: string
  label: string
  subtitle: string
  prompt: string
  modeId: ResultModeId
  projectPath: string | null
  projectLabel: string | null
  requiresProjectSelection: boolean
  keywords: string[]
}

export interface AppShellProjectEntry {
  kind: "project"
  id: string
  projectPath: string
  label: string
  subtitle?: string
  selected: boolean
  keywords: string[]
}

export type AppShellCommandEntry = AppShellActionEntry | AppShellWorkflowEntry | AppShellStartEntry | AppShellProjectEntry

export interface AppShellCommandSection {
  id: string
  label: string
  entries: AppShellCommandEntry[]
}

const PROCESS_INTENT_RE = /\b(start|build|make|create|fix|ship|review|verify|audit|map|shape|plan|implement|polish|refactor|improve|debug|launch|design|research)\b|сделай|собери|запусти|проведи|проверь|почини|подготов|отревью|сделать|ревью|аудит|полиш|карта|план|рефактор/i
const EMPTY_OPEN_RECENT_LIMIT = 8
const SEARCH_CURRENT_PROJECT_LIMIT = 5
const SEARCH_OTHER_PROJECT_LIMIT = 5
const SEARCH_PROJECT_LIMIT = 6
const SEARCH_ACTION_LIMIT = 4

type AppShellHelpMode = "do" | "plan" | "review"

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function toSearchText(value: string) {
  return normalize(value).replace(/[^a-z0-9а-яё]+/gi, " ").replace(/\s+/g, " ").trim()
}

function truncateLabel(value: string, maxLength = 48) {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`
}

function inferHelpModeFromPrompt(prompt: string): AppShellHelpMode {
  if (/\b(plan|planning|roadmap|spec|scope|outline|phase plan|распиши|спланир|план|roadmap)\b/i.test(prompt)) {
    return "plan"
  }
  if (/\b(review|verify|audit|polish|qa|check|ship|preflight|отревью|проверь|аудит|полиш|вериф|ревью)\b/i.test(prompt)) {
    return "review"
  }
  return "do"
}

function formatStartLabel(prompt: string, helpMode: AppShellHelpMode) {
  const promptLabel = truncateLabel(prompt)
  if (helpMode === "plan") return `Plan: ${promptLabel}`
  if (helpMode === "review") return `Review: ${promptLabel}`
  return `Build: ${promptLabel}`
}

function formatStartSubtitle(
  helpMode: AppShellHelpMode,
  projectLabel: string | null,
  requiresProjectAdd: boolean,
  requiresProjectSelection: boolean,
) {
  if (requiresProjectAdd) {
    return "Open the guided start flow and add a project first."
  }
  if (requiresProjectSelection) {
    return "Open the guided start flow and choose the target project."
  }
  if (helpMode === "plan") {
    return `Plan it${projectLabel ? ` in ${projectLabel}` : ""}. The system will choose the right path after submit.`
  }
  if (helpMode === "review") {
    return `Review it${projectLabel ? ` in ${projectLabel}` : ""}. The system will choose the right path after submit.`
  }
  return `Do it${projectLabel ? ` in ${projectLabel}` : ""}. The system will choose the right path after submit.`
}

function actionEntry(
  action: AppShellCommandAction,
  label: string,
  keywords: string[],
  subtitle?: string,
): AppShellActionEntry {
  return {
    kind: "action",
    id: `action:${action}`,
    action,
    label,
    keywords,
    subtitle,
  }
}

export function buildAppShellActionEntries(): AppShellActionEntry[] {
  return [
    actionEntry("new_process", "New process", ["new", "create", "start", "process"]),
    actionEntry("add_project", "Add project", ["add", "project", "folder", "workspace"]),
    actionEntry("process_library", "Process library", ["library", "template", "starting point", "process"]),
    actionEntry("inbox", "Inbox", ["inbox", "approval", "tasks", "notifications"]),
    actionEntry("settings", "Settings", ["settings", "preferences", "configuration"]),
  ]
}

export function buildAppShellWorkflowEntries({
  projects,
  selectedProject,
  projectWorkflowsCache,
  workflowExecutionStates,
}: {
  projects: string[]
  selectedProject: string | null
  projectWorkflowsCache: Record<string, WorkflowFile[]>
  workflowExecutionStates: Record<string, WorkflowExecutionState>
}): AppShellWorkflowEntry[] {
  const entries: AppShellWorkflowEntry[] = []
  const seen = new Set<string>()

  for (const projectPath of projects) {
    const workflows = projectWorkflowsCache[projectPath] || []
    const projectLabel = projectFolderName(projectPath)

    for (const workflow of workflows) {
      if (seen.has(workflow.path)) continue
      seen.add(workflow.path)

      const executionState = workflowExecutionStates[workflow.path]
      const active = workflowHasActiveRunStatus(executionState?.runStatus)
      entries.push({
        kind: "workflow",
        id: `workflow:${workflow.path}`,
        workflowPath: workflow.path,
        projectPath,
        label: workflow.name,
        projectLabel,
        metaLabel: active ? "Active" : formatRelativeTime(workflow.updatedAt),
        active,
        updatedAt: workflow.updatedAt ?? 0,
        keywords: [
          workflow.name,
          projectLabel,
          toSearchText(workflow.name),
          toSearchText(projectLabel),
        ].map((value) => value.toLowerCase()),
      })
    }
  }

  return entries.sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1
    const leftSelected = left.projectPath === selectedProject
    const rightSelected = right.projectPath === selectedProject
    if (leftSelected !== rightSelected) return leftSelected ? -1 : 1
    if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt
    return left.label.localeCompare(right.label)
  })
}

function filterActionEntries(
  entries: AppShellActionEntry[],
  query: string,
): AppShellActionEntry[] {
  const normalizedQuery = normalize(query)
  const normalizedSearchQuery = toSearchText(query)
  if (!normalizedQuery) return entries

  return entries.filter((entry) => {
    if (entry.label.toLowerCase().includes(normalizedQuery)) return true
    if (normalizedSearchQuery && toSearchText(entry.label).includes(normalizedSearchQuery)) return true
    return entry.keywords.some((keyword) => keyword.includes(normalizedQuery) || keyword.includes(normalizedSearchQuery))
  })
}

function filterWorkflowEntries(
  entries: AppShellWorkflowEntry[],
  query: string,
): AppShellWorkflowEntry[] {
  const normalizedQuery = normalize(query)
  const normalizedSearchQuery = toSearchText(query)
  if (!normalizedQuery) return entries

  return entries.filter((entry) => {
    if (entry.label.toLowerCase().includes(normalizedQuery)) return true
    if (entry.projectLabel.toLowerCase().includes(normalizedQuery)) return true
    if (normalizedSearchQuery && toSearchText(entry.label).includes(normalizedSearchQuery)) return true
    return entry.keywords.some((keyword) => keyword.includes(normalizedQuery) || keyword.includes(normalizedSearchQuery))
  })
}

function isActionLikeQuery(query: string, actions: AppShellActionEntry[]) {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return false
  const singleToken = !/\s/.test(normalizedQuery)

  return actions.some((entry) => {
    const label = entry.label.toLowerCase()
    if (label === normalizedQuery) return true
    return entry.keywords.some((keyword) => {
      if (keyword === normalizedQuery) return true
      if (!singleToken) return false
      return keyword.startsWith(normalizedQuery) && normalizedQuery.length >= 3
    })
  })
}

function looksLikeProcessIntent(query: string) {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return false
  return /\s/.test(normalizedQuery) || PROCESS_INTENT_RE.test(normalizedQuery)
}

export function buildAppShellStartEntry({
  query,
  selectedProject,
  projects,
}: {
  query: string
  selectedProject: string | null
  projects: string[]
}): AppShellStartEntry | null {
  const prompt = query.trim()
  if (!prompt) return null

  const projectPath = selectedProject
  const projectLabel = projectPath ? projectFolderName(projectPath) : null
  const requiresProjectAdd = !projectPath && projects.length === 0
  const requiresProjectSelection = !projectPath && projects.length > 1
  const promptLabel = truncateLabel(prompt)
  const helpMode = inferHelpModeFromPrompt(prompt)

  return {
    kind: "start",
    id: `start:${prompt.toLowerCase()}`,
    label: requiresProjectAdd
      ? `Add project to start “${promptLabel}”`
      : requiresProjectSelection
      ? `Choose project for “${promptLabel}”`
      : formatStartLabel(prompt, helpMode),
    subtitle: formatStartSubtitle(helpMode, projectLabel, requiresProjectAdd, requiresProjectSelection),
    prompt,
    modeId: inferResultModeFromText(prompt),
    projectPath,
    projectLabel,
    requiresProjectSelection,
    keywords: [prompt.toLowerCase(), "start new", "new process"],
  }
}

export function buildAppShellProjectEntries({
  projects,
  selectedProject,
}: {
  projects: string[]
  selectedProject: string | null
}): AppShellProjectEntry[] {
  return projects.map((projectPath) => {
    const label = projectFolderName(projectPath)
    const selected = projectPath === selectedProject
    return {
      kind: "project",
      id: `project:${projectPath}`,
      projectPath,
      label,
      subtitle: selected ? "Current project" : "Switch project context",
      selected,
      keywords: [
        normalize(label),
        toSearchText(label),
        normalize(projectPath),
      ],
    }
  }).sort((left, right) => {
    if (left.selected !== right.selected) return left.selected ? -1 : 1
    return left.label.localeCompare(right.label)
  })
}

function filterProjectEntries(
  entries: AppShellProjectEntry[],
  query: string,
): AppShellProjectEntry[] {
  const normalizedQuery = normalize(query)
  const normalizedSearchQuery = toSearchText(query)
  if (!normalizedQuery) return entries

  return entries.filter((entry) => {
    if (entry.label.toLowerCase().includes(normalizedQuery)) return true
    if (normalizedSearchQuery && toSearchText(entry.label).includes(normalizedSearchQuery)) return true
    return entry.keywords.some((keyword) => keyword.includes(normalizedQuery) || keyword.includes(normalizedSearchQuery))
  })
}

export function buildAppShellCommandSections({
  query,
  actions,
  workflows,
  projectEntries,
  selectedProject,
  projects,
}: {
  query: string
  actions: AppShellActionEntry[]
  workflows: AppShellWorkflowEntry[]
  projectEntries: AppShellProjectEntry[]
  selectedProject: string | null
  projects: string[]
}): AppShellCommandSection[] {
  const normalizedQuery = normalize(query)

  if (!normalizedQuery) {
    const createActions = actions.filter((entry) =>
      entry.action === "new_process"
      || entry.action === "add_project"
      || entry.action === "process_library")
    const navigateActions = actions.filter((entry) => entry.action === "inbox" || entry.action === "settings")
    const recentWorkflows = workflows.slice(0, EMPTY_OPEN_RECENT_LIMIT)
    const switchProjects = projectEntries.filter((entry) => !entry.selected).slice(0, 5)

    return [
      createActions.length > 0 ? { id: "create", label: "Start", entries: createActions } : null,
      recentWorkflows.length > 0 ? { id: "recent", label: "Open recent", entries: recentWorkflows } : null,
      switchProjects.length > 0 ? { id: "projects", label: "Switch project", entries: switchProjects } : null,
      navigateActions.length > 0 ? { id: "navigate", label: "Navigate", entries: navigateActions } : null,
    ].filter((section): section is AppShellCommandSection => Boolean(section))
  }

  const filteredActions = filterActionEntries(actions, query).slice(0, SEARCH_ACTION_LIMIT)
  const filteredWorkflows = filterWorkflowEntries(workflows, query)
  const filteredProjects = filterProjectEntries(projectEntries, query)
    .filter((entry) => !entry.selected)
    .slice(0, SEARCH_PROJECT_LIMIT)
  const currentProjectMatches = filteredWorkflows
    .filter((entry) => entry.projectPath === selectedProject)
    .slice(0, SEARCH_CURRENT_PROJECT_LIMIT)
  const otherProjectMatches = filteredWorkflows
    .filter((entry) => entry.projectPath !== selectedProject)
    .slice(0, SEARCH_OTHER_PROJECT_LIMIT)

  const startEntry = !isActionLikeQuery(query, actions) && looksLikeProcessIntent(query)
    ? buildAppShellStartEntry({ query, selectedProject, projects })
    : null

  return [
    startEntry ? { id: "start_new", label: "Start new", entries: [startEntry] } : null,
    filteredProjects.length > 0 ? { id: "projects", label: "Switch project", entries: filteredProjects } : null,
    currentProjectMatches.length > 0 ? { id: "current_project", label: "Open in current project", entries: currentProjectMatches } : null,
    otherProjectMatches.length > 0 ? { id: "other_projects", label: "Open in other projects", entries: otherProjectMatches } : null,
    filteredActions.length > 0 ? { id: "actions", label: "Actions", entries: filteredActions } : null,
  ].filter((section): section is AppShellCommandSection => Boolean(section))
}
