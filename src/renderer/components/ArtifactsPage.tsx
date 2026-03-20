import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  ArrowUpRight,
  FileStack,
  FolderOpen,
  LayoutTemplate,
  Loader2,
  Play,
  RefreshCw,
  Rocket,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CollectionToolbar } from "@/components/ui/collection-toolbar"
import { PageHeader, PageShell, SectionHeading } from "@/components/ui/page-shell"
import { ScopeBanner } from "@/components/ui/scope-banner"
import { formatRelativeTime, projectFolderName } from "@/components/sidebar/projectSidebarUtils"
import {
  currentWorkflowAtom,
  factoryBetaEnabledAtom,
  inputAttachmentsAtom,
  inputValueAtom,
  mainViewAtom,
  selectedFactoryIdAtom,
  selectedProjectAtom,
  selectedFactoryCaseIdAtom,
  selectedWorkflowPathAtom,
  setWorkflowTemplateContextForKeyAtom,
  workflowEntryStateAtom,
  workflowSavedSnapshotAtom,
  webSearchBackendAtom,
  workflowsAtom,
} from "@/lib/store"
import {
  areTemplateContractsSatisfied,
  deriveArtifactCaseKey,
  deriveTemplateExecutionDisciplineLabels,
  deriveTemplateJourneyStageLabel,
  formatArtifactContractLabel,
  selectArtifactsForTemplateContracts,
} from "@/lib/workflow-entry"
import { prepareTemplateStageLaunch } from "@/lib/factory-launch"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import type { ArtifactRecord, WorkflowTemplate } from "@shared/types"

function buildArtifactSearchText(
  artifact: ArtifactRecord,
  matchingTemplates: WorkflowTemplate[],
) {
  return [
    artifact.title,
    artifact.description,
    artifact.kind,
    artifact.caseLabel,
    artifact.templateName,
    artifact.workflowName,
    matchingTemplates.map((template) => template.name).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

export function ArtifactsPage() {
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [factoryBetaEnabled] = useAtom(factoryBetaEnabledAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [selectedFactoryId] = useAtom(selectedFactoryIdAtom)
  const [selectedCaseId, setSelectedCaseId] = useAtom(selectedFactoryCaseIdAtom)
  const [, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setWorkflow] = useAtom(currentWorkflowAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [, setWorkflowEntryState] = useAtom(workflowEntryStateAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
  const [, setInputValue] = useAtom(inputValueAtom)
  const [, setInputAttachments] = useAtom(inputAttachmentsAtom)
  const setWorkflowTemplateContextForKey = useSetAtom(setWorkflowTemplateContextForKeyAtom)
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([])
  const [artifactsLoading, setArtifactsLoading] = useState(false)
  const [artifactsError, setArtifactsError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [kindFilter, setKindFilter] = useState<string>("all")
  const [launchingTemplateId, setLaunchingTemplateId] = useState<string | null>(null)
  const artifactsRequestIdRef = useRef(0)

  const refreshArtifacts = useCallback(async () => {
    const requestId = ++artifactsRequestIdRef.current
    if (!selectedProject) {
      if (artifactsRequestIdRef.current !== requestId) return
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
      if (artifactsRequestIdRef.current === requestId) {
        setArtifactsLoading(false)
      }
    }
  }, [selectedProject])

  useEffect(() => {
    void refreshArtifacts()
  }, [refreshArtifacts])

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

  const templateById = useMemo(
    () => new Map(templates.map((template) => [template.id, template])),
    [templates],
  )

  const artifactFactoryKey = useCallback((artifact: ArtifactRecord) => {
    if (artifact.factoryId) return artifact.factoryId
    const template = artifact.templateId ? templateById.get(artifact.templateId) : undefined
    return template?.pack?.id ? `pack:${template.pack.id}` : "project:legacy"
  }, [templateById])

  const factoryScopeArtifacts = useMemo(
    () => selectedFactoryId
      ? artifacts.filter((artifact) => artifactFactoryKey(artifact) === selectedFactoryId)
      : artifacts,
    [artifactFactoryKey, artifacts, selectedFactoryId],
  )

  const selectedFactoryLabel = useMemo(() => {
    if (!selectedFactoryId) return null
    const direct = factoryScopeArtifacts.find((artifact) => artifact.factoryLabel)?.factoryLabel
    if (direct) return direct
    if (selectedFactoryId.startsWith("pack:")) {
      const packId = selectedFactoryId.replace(/^pack:/, "")
      return templates.find((template) => template.pack?.id === packId)?.pack?.label || "Lab"
    }
    return "Lab"
  }, [factoryScopeArtifacts, selectedFactoryId, templates])

  const artifactKinds = useMemo(() => {
    return Array.from(new Set(factoryScopeArtifacts.map((artifact) => artifact.kind))).sort((left, right) =>
      formatArtifactContractLabel(left).localeCompare(formatArtifactContractLabel(right)),
    )
  }, [factoryScopeArtifacts])

  const artifactsByCaseKey = useMemo(() => {
    const next = new Map<string, ArtifactRecord[]>()
    for (const artifact of factoryScopeArtifacts) {
      const caseKey = deriveArtifactCaseKey(artifact)
      const existing = next.get(caseKey)
      if (existing) {
        existing.push(artifact)
      } else {
        next.set(caseKey, [artifact])
      }
    }
    return next
  }, [factoryScopeArtifacts])

  const caseOptions = useMemo(() => {
    return Array.from(artifactsByCaseKey.entries())
      .map(([id, caseArtifacts]) => {
        const latestArtifact = [...caseArtifacts].sort((left, right) => right.updatedAt - left.updatedAt)[0]
        return {
          id,
          label: latestArtifact?.caseLabel || latestArtifact?.workflowName || latestArtifact?.title || "Track",
          count: caseArtifacts.length,
          updatedAt: latestArtifact?.updatedAt || 0,
        }
      })
      .sort((left, right) => right.updatedAt - left.updatedAt)
  }, [artifactsByCaseKey])

  const selectedCaseOption = useMemo(
    () => caseOptions.find((entry) => entry.id === selectedCaseId) || null,
    [caseOptions, selectedCaseId],
  )

  useEffect(() => {
    if (!selectedCaseId) return
    if (!caseOptions.some((entry) => entry.id === selectedCaseId)) {
      setSelectedCaseId(null)
    }
  }, [caseOptions, selectedCaseId, setSelectedCaseId])

  const scopeArtifacts = useMemo(
    () => (selectedCaseId ? (artifactsByCaseKey.get(selectedCaseId) || []) : factoryScopeArtifacts),
    [artifactsByCaseKey, factoryScopeArtifacts, selectedCaseId],
  )

  const compatibleTemplates = useMemo(() => {
    return templates
      .filter((template) => (template.contractIn?.length || 0) > 0)
      .filter((template) => areTemplateContractsSatisfied(template.contractIn, scopeArtifacts))
  }, [scopeArtifacts, templates])

  const matchingTemplatesByArtifactId = useMemo(() => {
    const next = new Map<string, WorkflowTemplate[]>()
    for (const artifact of factoryScopeArtifacts) {
      const artifactScope = selectedCaseId
        ? scopeArtifacts
        : (artifactsByCaseKey.get(deriveArtifactCaseKey(artifact)) || [artifact])
      const matchingTemplates = compatibleTemplates
        .filter((template) => areTemplateContractsSatisfied(template.contractIn, artifactScope))
        .filter((template) => template.contractIn?.some((contract) => artifactScope.some((candidate) => candidate.kind === contract.kind)))
        .slice(0, 3)
      next.set(artifact.id, matchingTemplates)
    }
    return next
  }, [artifactsByCaseKey, compatibleTemplates, factoryScopeArtifacts, scopeArtifacts, selectedCaseId])

  const filteredArtifacts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return scopeArtifacts.filter((artifact) => {
      if (kindFilter !== "all" && artifact.kind !== kindFilter) return false
      if (!normalizedQuery) return true
      return buildArtifactSearchText(
        artifact,
        matchingTemplatesByArtifactId.get(artifact.id) || [],
      ).includes(normalizedQuery)
    })
  }, [kindFilter, matchingTemplatesByArtifactId, query, scopeArtifacts])

  const openArtifact = async (artifact: ArtifactRecord) => {
    const openError = await window.api.openPath(artifact.contentPath)
    if (!openError) return
    toast.error("Could not open result", {
      description: openError,
    })
  }

  const revealArtifact = async (artifact: ArtifactRecord) => {
    const ok = await window.api.showInFinder(artifact.contentPath)
    if (ok) return
    toast.error("Could not reveal result in Finder")
  }

  const launchTemplate = async (template: WorkflowTemplate, sourceArtifacts = scopeArtifacts) => {
    if (!selectedProject || launchingTemplateId) return

    setLaunchingTemplateId(template.id)
    try {
      const launch = await prepareTemplateStageLaunch({
        projectPath: selectedProject,
        template,
        webSearchBackend,
        artifacts: selectArtifactsForTemplateContracts(template.contractIn, sourceArtifacts),
        factory: selectedFactoryId && selectedFactoryLabel
          ? {
            id: selectedFactoryId,
            label: selectedFactoryLabel,
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
      toast.error("Could not open the selected step", {
        description: String(error),
      })
    } finally {
      setLaunchingTemplateId(null)
    }
  }

  if (!selectedProject) {
    return (
      <PageShell>
        <PageHeader
          title="Results"
          subtitle="Choose a project in the sidebar to see reusable results and start the next step from them."
          actions={(
            <Button variant="outline" size="sm" onClick={() => setMainView("thread")}>
              <FolderOpen size={14} />
              Back to flow
            </Button>
          )}
        />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="Results"
        subtitle={
          selectedCaseOption
            ? `Reusable results for ${selectedCaseOption.label}. Stay in one track and open the next step without rebuilding context in the terminal.`
            : selectedFactoryLabel
              ? `Reusable results for ${selectedFactoryLabel}. Stay inside one lab while you review results and launch the next step.`
              : `Reusable project results for ${projectFolderName(selectedProject)}. Use them to open the next step without rebuilding context in the terminal.`
        }
        actions={(
          <>
            {factoryBetaEnabled ? (
              <Button variant="outline" size="sm" onClick={() => setMainView("factory")}>
                <Rocket size={14} />
                Open lab
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setMainView("templates")}>
              <LayoutTemplate size={14} />
              Browse library
            </Button>
            <Button variant="outline" size="sm" onClick={() => void refreshArtifacts()} disabled={artifactsLoading}>
              {artifactsLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh
            </Button>
          </>
        )}
      />

      <CollectionToolbar
        ariaLabel="Result controls"
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search results or next steps"
        searchAriaLabel="Search results"
        summary={`${filteredArtifacts.length} result${filteredArtifacts.length === 1 ? "" : "s"}`}
        filters={(
          <>
            <span className="ui-meta-text hidden text-muted-foreground lg:inline-flex">Filter by contract</span>
            <Button
              variant={kindFilter === "all" ? "secondary" : "outline"}
              size="xs"
              onClick={() => setKindFilter("all")}
              aria-pressed={kindFilter === "all"}
            >
              All
            </Button>
            {artifactKinds.map((kind) => (
              <Button
                key={kind}
                variant={kindFilter === kind ? "secondary" : "outline"}
                size="xs"
                onClick={() => setKindFilter(kind)}
                aria-pressed={kindFilter === kind}
              >
                {formatArtifactContractLabel(kind)}
              </Button>
            ))}
            {(caseOptions.length > 1 || selectedCaseOption) && (
              <>
                <span className="ui-meta-text hidden text-muted-foreground lg:inline-flex">Track</span>
                <Button
                  variant={selectedCaseId === null ? "secondary" : "outline"}
                  size="xs"
                  onClick={() => setSelectedCaseId(null)}
                  aria-pressed={selectedCaseId === null}
                >
                  All tracks
                </Button>
                {caseOptions.slice(0, 4).map((entry) => (
                  <Button
                    key={entry.id}
                    variant={selectedCaseId === entry.id ? "secondary" : "outline"}
                    size="xs"
                    onClick={() => setSelectedCaseId(entry.id)}
                    aria-pressed={selectedCaseId === entry.id}
                  >
                    {entry.label}
                  </Button>
                ))}
              </>
            )}
          </>
        )}
      />

      <section className="space-y-4" aria-busy={artifactsLoading || templatesLoading}>
        {selectedFactoryLabel && !selectedCaseOption ? (
          <ScopeBanner
            eyebrow="Lab scope"
            description={`Showing results for ${selectedFactoryLabel}. Go back to the lab when you need a different outcome or path.`}
            actions={factoryBetaEnabled ? (
              <Button variant="outline" size="sm" onClick={() => setMainView("factory")}>
                <Rocket size={14} />
                Back to lab
              </Button>
            ) : undefined}
          />
        ) : null}

        {selectedCaseOption ? (
          <ScopeBanner
            eyebrow="Track scope"
            description={`Showing ${selectedCaseOption.count} result${selectedCaseOption.count === 1 ? "" : "s"} for ${selectedCaseOption.label}${selectedFactoryLabel ? ` inside ${selectedFactoryLabel}` : ""}.`}
            actions={(
              <>
                {factoryBetaEnabled ? (
                  <Button variant="outline" size="sm" onClick={() => setMainView("factory")}>
                    <Rocket size={14} />
                    Back to lab
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => setSelectedCaseId(null)}>
                  Show all tracks
                </Button>
              </>
            )}
          />
        ) : null}

        <SectionHeading
          title={selectedFactoryLabel ? `${selectedFactoryLabel} results` : "Project results"}
          meta={compatibleTemplates.length > 0 ? (
            <span className="ui-meta-text text-muted-foreground">
              {compatibleTemplates.length} ready next step{compatibleTemplates.length === 1 ? "" : "s"}
            </span>
          ) : null}
        />

        {artifactsError ? (
          <div role="alert" className="rounded-xl border border-status-danger/25 bg-status-danger/5 px-4 py-3 text-body-sm text-status-danger">
            {artifactsError}
          </div>
        ) : templatesError ? (
          <div role="alert" className="rounded-xl border border-status-danger/25 bg-status-danger/5 px-4 py-3 text-body-sm text-status-danger">
            {templatesError}
          </div>
        ) : artifactsLoading || templatesLoading ? (
          <div className="rounded-xl surface-panel ui-empty-state px-4 text-body-sm text-muted-foreground">
            Loading project results and next steps...
          </div>
        ) : filteredArtifacts.length === 0 ? (
          <div className="rounded-xl surface-panel ui-empty-state px-4 text-body-sm text-muted-foreground">
            {factoryScopeArtifacts.length === 0
              ? selectedFactoryLabel
                ? `No results have been saved for ${selectedFactoryLabel} yet. Run the first step to create reusable results.`
                : "No results saved yet. Run a first step to create reusable results."
              : "No results match this filter."}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {filteredArtifacts.map((artifact) => {
              const matchingTemplates = matchingTemplatesByArtifactId.get(artifact.id) || []
              const artifactCaseKey = deriveArtifactCaseKey(artifact)
              const artifactCase = caseOptions.find((entry) => entry.id === artifactCaseKey) || null
              const artifactScope = selectedCaseId
                ? scopeArtifacts
                : (artifactsByCaseKey.get(artifactCaseKey) || [artifact])
              return (
                <article key={artifact.id} className="rounded-xl surface-panel p-4 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-title-sm text-foreground">{artifact.title}</h2>
                        <Badge variant="outline" className="ui-meta-text px-2 py-0">
                          {formatArtifactContractLabel(artifact.kind)}
                        </Badge>
                        {artifactCase ? (
                          <Badge variant="secondary" className="ui-meta-text px-2 py-0">
                            {artifactCase.label}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-body-sm text-muted-foreground">
                        {artifact.description || "Reusable result saved from a previous run."}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 ui-meta-text text-muted-foreground">
                        <span>{artifact.templateName || artifact.workflowName || "Saved from run"}</span>
                        <span>Updated {formatRelativeTime(artifact.updatedAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {artifactCase && factoryBetaEnabled ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedCaseId(artifactCase.id)
                            setMainView("factory")
                          }}
                        >
                          <Rocket size={14} />
                          Track
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="sm" onClick={() => void revealArtifact(artifact)}>
                        <ArrowUpRight size={14} />
                        Reveal
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void openArtifact(artifact)}>
                        <FileStack size={14} />
                        Open
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg surface-inset-card px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="ui-meta-label text-muted-foreground">Ready next steps</div>
                        <p className="mt-1 text-body-sm text-muted-foreground">
                          {selectedCaseId || artifactCase
                            ? "Steps whose required contracts are already satisfied by this track."
                            : "Steps whose required contracts are already satisfied by this project."}
                        </p>
                      </div>
                    </div>

                    {matchingTemplates.length === 0 ? (
                      <div className="mt-3 text-body-sm text-muted-foreground">
                        No next steps are ready from this result alone yet.
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {matchingTemplates.map((template) => {
                          const disciplineLabels = deriveTemplateExecutionDisciplineLabels(template)
                          const stageLabel = deriveTemplateJourneyStageLabel(template)
                          const isLaunching = launchingTemplateId === template.id
                          return (
                            <div
                              key={`${artifact.id}-${template.id}`}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-lg surface-soft px-3 py-3"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="ui-body-text-medium text-foreground">{template.name}</div>
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
                                {disciplineLabels.length > 0 ? (
                                  <p className="mt-1 text-body-sm text-muted-foreground">
                                    {disciplineLabels.join(" · ")}
                                  </p>
                                ) : null}
                              </div>
                              <Button
                                size="sm"
                                onClick={() => void launchTemplate(template, artifactScope)}
                                disabled={Boolean(launchingTemplateId)}
                              >
                                {isLaunching ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                                {isLaunching ? "Opening..." : "Open step"}
                              </Button>
                            </div>
                          )
                        })}
                      </div>
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
