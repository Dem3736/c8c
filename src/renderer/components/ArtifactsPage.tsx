import { useCallback, useEffect, useMemo, useState } from "react"
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
  inputAttachmentsAtom,
  inputValueAtom,
  mainViewAtom,
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
  const [, setMainView] = useAtom(mainViewAtom)
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

  const artifactKinds = useMemo(() => {
    return Array.from(new Set(artifacts.map((artifact) => artifact.kind))).sort((left, right) =>
      formatArtifactContractLabel(left).localeCompare(formatArtifactContractLabel(right)),
    )
  }, [artifacts])

  const artifactsByCaseKey = useMemo(() => {
    const next = new Map<string, ArtifactRecord[]>()
    for (const artifact of artifacts) {
      const caseKey = deriveArtifactCaseKey(artifact)
      const existing = next.get(caseKey)
      if (existing) {
        existing.push(artifact)
      } else {
        next.set(caseKey, [artifact])
      }
    }
    return next
  }, [artifacts])

  const caseOptions = useMemo(() => {
    return Array.from(artifactsByCaseKey.entries())
      .map(([id, caseArtifacts]) => {
        const latestArtifact = [...caseArtifacts].sort((left, right) => right.updatedAt - left.updatedAt)[0]
        return {
          id,
          label: latestArtifact?.caseLabel || latestArtifact?.workflowName || latestArtifact?.title || "Case",
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
    () => (selectedCaseId ? (artifactsByCaseKey.get(selectedCaseId) || []) : artifacts),
    [artifacts, artifactsByCaseKey, selectedCaseId],
  )

  const compatibleTemplates = useMemo(() => {
    return templates
      .filter((template) => (template.contractIn?.length || 0) > 0)
      .filter((template) => areTemplateContractsSatisfied(template.contractIn, scopeArtifacts))
  }, [scopeArtifacts, templates])

  const matchingTemplatesByArtifactId = useMemo(() => {
    const next = new Map<string, WorkflowTemplate[]>()
    for (const artifact of artifacts) {
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
  }, [artifacts, artifactsByCaseKey, compatibleTemplates, scopeArtifacts, selectedCaseId])

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
    toast.error("Could not open artifact", {
      description: openError,
    })
  }

  const revealArtifact = async (artifact: ArtifactRecord) => {
    const ok = await window.api.showInFinder(artifact.contentPath)
    if (ok) return
    toast.error("Could not reveal artifact in Finder")
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
      <PageShell>
        <PageHeader
          title="Artifacts"
          subtitle="Choose a project in the sidebar to see reusable outputs and start the next stage from them."
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
        title="Artifacts"
        subtitle={
          selectedCaseOption
            ? `Reusable outputs for ${selectedCaseOption.label}. Stay in one case and open the next stage without rebuilding context in the terminal.`
            : `Reusable project outputs for ${projectFolderName(selectedProject)}. Use them to open the next stage without rebuilding context in the terminal.`
        }
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={() => setMainView("factory")}>
              <Rocket size={14} />
              Open factory
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMainView("templates")}>
              <LayoutTemplate size={14} />
              Browse templates
            </Button>
            <Button variant="outline" size="sm" onClick={() => void refreshArtifacts()} disabled={artifactsLoading}>
              {artifactsLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh
            </Button>
          </>
        )}
      />

      <CollectionToolbar
        ariaLabel="Artifact controls"
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search artifacts or next stages"
        searchAriaLabel="Search artifacts"
        summary={`${filteredArtifacts.length} artifact${filteredArtifacts.length === 1 ? "" : "s"}`}
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
                <span className="ui-meta-text hidden text-muted-foreground lg:inline-flex">Case</span>
                <Button
                  variant={selectedCaseId === null ? "secondary" : "outline"}
                  size="xs"
                  onClick={() => setSelectedCaseId(null)}
                  aria-pressed={selectedCaseId === null}
                >
                  All cases
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
        {selectedCaseOption ? (
          <ScopeBanner
            eyebrow="Case scope"
            description={`Showing ${selectedCaseOption.count} artifact${selectedCaseOption.count === 1 ? "" : "s"} for ${selectedCaseOption.label}.`}
            actions={(
              <>
                <Button variant="outline" size="sm" onClick={() => setMainView("factory")}>
                  <Rocket size={14} />
                  Back to factory
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedCaseId(null)}>
                  Show all cases
                </Button>
              </>
            )}
          />
        ) : null}

        <SectionHeading
          title="Project artifact library"
          meta={compatibleTemplates.length > 0 ? (
            <span className="ui-meta-text text-muted-foreground">
              {compatibleTemplates.length} runnable next stage{compatibleTemplates.length === 1 ? "" : "s"}
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
          <div className="rounded-xl surface-panel px-4 py-8 text-body-sm text-muted-foreground">
            Loading project artifacts and next stages...
          </div>
        ) : filteredArtifacts.length === 0 ? (
          <div className="rounded-xl surface-panel px-4 py-8 text-body-sm text-muted-foreground">
            {artifacts.length === 0
              ? "No artifacts saved yet. Run a delivery pack stage to create reusable outputs."
              : "No artifacts match this filter."}
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
                        {artifact.description || "Reusable artifact saved from a previous run."}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 ui-meta-text text-muted-foreground">
                        <span>{artifact.templateName || artifact.workflowName || "Saved from run"}</span>
                        <span>Updated {formatRelativeTime(artifact.updatedAt)}</span>
                      </div>
                    </div>
                      <div className="flex items-center gap-2">
                        {artifactCase ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2.5"
                            onClick={() => {
                              setSelectedCaseId(artifactCase.id)
                              setMainView("factory")
                            }}
                          >
                            <Rocket size={14} />
                            Case
                          </Button>
                        ) : null}
                        <Button variant="ghost" size="sm" className="h-8 px-2.5" onClick={() => void revealArtifact(artifact)}>
                          <ArrowUpRight size={14} />
                          Reveal
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 px-2.5" onClick={() => void openArtifact(artifact)}>
                        <FileStack size={14} />
                        Open
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-hairline bg-surface-2/55 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="ui-meta-label text-muted-foreground">Can start next</div>
                          <p className="mt-1 text-body-sm text-muted-foreground">
                            {selectedCaseId || artifactCase
                              ? "Stages whose required contracts are already satisfied by this case."
                              : "Stages whose required contracts are already satisfied by this project."}
                          </p>
                        </div>
                      </div>

                    {matchingTemplates.length === 0 ? (
                      <div className="mt-3 text-body-sm text-muted-foreground">
                        No downstream stages are ready from this artifact alone yet.
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
                              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-1/80 px-3 py-3"
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
                                {isLaunching ? "Opening..." : "Open stage"}
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
