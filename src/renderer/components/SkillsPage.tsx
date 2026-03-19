import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAtom } from "jotai"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  currentWorkflowAtom,
  librariesAtom,
  mainViewAtom,
  selectedProjectAtom,
  selectedNodeIdAtom,
  selectedWorkflowPathAtom,
  skillsAtom,
  type SkillLibrary,
} from "@/lib/store"
import { cn } from "@/lib/cn"
import { getSkillSourceLabel } from "@/lib/skill-source"
import { addSkillNodeToWorkflow } from "@/lib/workflow-mutations"
import type {
  DiscoveredSkill,
  InstalledPlugin,
  MarketplaceSource,
  PluginMcpServerInfo,
} from "@shared/types"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { PageHeader, PageShell, SectionHeading } from "@/components/ui/page-shell"
import { SkillDetailPanel } from "@/components/SkillDetailPanel"
import { CollectionToolbar } from "@/components/ui/collection-toolbar"
import { SkillSourcesAdmin } from "@/components/skills/SkillSourcesAdmin"
import { SkillsPageDialogs } from "@/components/skills/skill-dialogs"
import {
  FAVORITE_LIBRARY_ORDER,
  findWorkflowRefsBySkills,
  LIBRARY_ACTION_LABEL,
  LIBRARY_PREVIEW_HINTS,
  MARKETPLACE_ACTION_LABEL,
  type LibraryAction,
  type MarketplaceAction,
  PLUGIN_ACTION_LABEL,
  type PluginAction,
} from "@/components/skills/skills-page-helpers"

export function SkillsPage() {
  const [libraries, setLibraries] = useAtom(librariesAtom)
  const [skills, setSkills] = useAtom(skillsAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [currentWorkflow, setCurrentWorkflow] = useAtom(currentWorkflowAtom)
  const [, setSelectedNodeId] = useAtom(selectedNodeIdAtom)
  const [, setMainView] = useAtom(mainViewAtom)

  const [marketplaces, setMarketplaces] = useState<MarketplaceSource[]>([])
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([])
  const [pluginMcpServers, setPluginMcpServers] = useState<PluginMcpServerInfo[]>([])
  const [query, setQuery] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [libraryAction, setLibraryAction] = useState<{ id: string; action: LibraryAction } | null>(null)
  const [marketplaceAction, setMarketplaceAction] = useState<{ id: string; action: MarketplaceAction } | null>(null)
  const [pluginAction, setPluginAction] = useState<{ id: string; action: PluginAction } | null>(null)
  const [statusMessage, setStatusMessage] = useState("")
  const [pendingUninstall, setPendingUninstall] = useState<SkillLibrary | null>(null)
  const [pendingDisablePlugin, setPendingDisablePlugin] = useState<InstalledPlugin | null>(null)
  const [pendingRemoveMarketplace, setPendingRemoveMarketplace] = useState<MarketplaceSource | null>(null)
  const [previewLibrary, setPreviewLibrary] = useState<SkillLibrary | null>(null)
  const [previewPlugin, setPreviewPlugin] = useState<InstalledPlugin | null>(null)
  const [acknowledgeBrokenRefs, setAcknowledgeBrokenRefs] = useState(false)
  const [selectedSkill, setSelectedSkill] = useState<DiscoveredSkill | null>(null)
  const refreshRequestIdRef = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = refreshRequestIdRef.current + 1
    refreshRequestIdRef.current = requestId
    setRefreshing(true)
    try {
      const [loadedLibraries, loadedMarketplaces, loadedPlugins, loadedPluginMcpServers, scanned] = await Promise.all([
        window.api.listLibraries(),
        window.api.listMarketplaces(),
        window.api.scanPlugins(),
        window.api.mcpListPluginServers(),
        selectedProject ? window.api.scanSkills(selectedProject) : Promise.resolve([] as DiscoveredSkill[]),
      ])
      if (refreshRequestIdRef.current !== requestId) return
      setLibraries(loadedLibraries)
      setMarketplaces(loadedMarketplaces)
      setPlugins(loadedPlugins)
      setPluginMcpServers(loadedPluginMcpServers)
      setSkills(scanned)
    } catch (error) {
      if (refreshRequestIdRef.current !== requestId) return
      toast.error(`Failed to refresh skills: ${String(error)}`)
    } finally {
      if (refreshRequestIdRef.current !== requestId) return
      setRefreshing(false)
    }
  }, [selectedProject, setLibraries, setSkills])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    setAcknowledgeBrokenRefs(false)
  }, [pendingDisablePlugin?.id, pendingRemoveMarketplace?.id, pendingUninstall?.id])

  const skillsCountByLibrary = useMemo(() => {
    const counter = new Map<string, number>()
    for (const skill of skills) {
      if (skill.sourceScope !== "library" || !skill.library) continue
      counter.set(skill.library, (counter.get(skill.library) ?? 0) + 1)
    }
    return counter
  }, [skills])

  const skillsByLibrary = useMemo(() => {
    const map = new Map<string, DiscoveredSkill[]>()
    for (const skill of skills) {
      if (skill.sourceScope !== "library" || !skill.library) continue
      const list = map.get(skill.library) || []
      list.push(skill)
      map.set(skill.library, list)
    }
    return map
  }, [skills])

  const skillsCountByPlugin = useMemo(() => {
    const counter = new Map<string, number>()
    for (const skill of skills) {
      if (skill.sourceScope !== "plugin" || !skill.pluginId) continue
      counter.set(skill.pluginId, (counter.get(skill.pluginId) ?? 0) + 1)
    }
    return counter
  }, [skills])

  const skillsByPlugin = useMemo(() => {
    const map = new Map<string, DiscoveredSkill[]>()
    for (const skill of skills) {
      if (skill.sourceScope !== "plugin" || !skill.pluginId) continue
      const list = map.get(skill.pluginId) || []
      list.push(skill)
      map.set(skill.pluginId, list)
    }
    return map
  }, [skills])

  const pluginMcpByPlugin = useMemo(() => {
    const map = new Map<string, PluginMcpServerInfo[]>()
    for (const server of pluginMcpServers) {
      const list = map.get(server.pluginId) || []
      list.push(server)
      map.set(server.pluginId, list)
    }
    return map
  }, [pluginMcpServers])

  const libraryById = useMemo(() => {
    return new Map(libraries.map((library) => [library.id, library]))
  }, [libraries])

  const pluginsByMarketplaceId = useMemo(() => {
    const map = new Map<string, InstalledPlugin[]>()
    for (const plugin of plugins) {
      const list = map.get(plugin.marketplaceId) || []
      list.push(plugin)
      map.set(plugin.marketplaceId, list)
    }
    return map
  }, [plugins])

  const filteredLibraries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return libraries
    return libraries.filter((library) =>
      `${library.name} ${library.description} ${library.id}`.toLowerCase().includes(normalizedQuery),
    )
  }, [libraries, query])

  const filteredMarketplaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return marketplaces
    return marketplaces.filter((marketplace) =>
      `${marketplace.name} ${marketplace.description} ${marketplace.id} ${marketplace.owner || ""}`.toLowerCase().includes(normalizedQuery),
    )
  }, [marketplaces, query])

  const filteredPlugins = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const list = !normalizedQuery
      ? plugins
      : plugins.filter((plugin) =>
        [
          plugin.name,
          plugin.description,
          plugin.marketplaceName,
          plugin.category || "",
          plugin.tags?.join(" ") || "",
          plugin.capabilities.join(" "),
        ].join(" ").toLowerCase().includes(normalizedQuery),
      )

    return [...list].sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
      if (a.marketplaceName !== b.marketplaceName) return a.marketplaceName.localeCompare(b.marketplaceName)
      return a.name.localeCompare(b.name)
    })
  }, [plugins, query])

  const filteredSkills = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const list = !normalizedQuery
      ? skills
      : skills.filter((skill) =>
        `${skill.name} ${skill.description} ${skill.category} ${getSkillSourceLabel(skill)}`.toLowerCase().includes(normalizedQuery),
      )
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [skills, query])

  useEffect(() => {
    if (!selectedSkill) return
    const stillVisible = filteredSkills.some((skill) => skill.path === selectedSkill.path)
    if (!stillVisible) {
      setSelectedSkill(null)
    }
  }, [filteredSkills, selectedSkill])

  const installedLibraries = filteredLibraries.filter((library) => library.installed)
  const favoriteLibraries = filteredLibraries
    .filter((library) => !library.installed && FAVORITE_LIBRARY_ORDER.has(library.id))
    .sort((a, b) => (FAVORITE_LIBRARY_ORDER.get(a.id) ?? 999) - (FAVORITE_LIBRARY_ORDER.get(b.id) ?? 999))
  const availableLibraries = filteredLibraries.filter((library) => !library.installed && !FAVORITE_LIBRARY_ORDER.has(library.id))
  const installedMarketplaces = filteredMarketplaces.filter((marketplace) => marketplace.installed)
  const availableMarketplaces = filteredMarketplaces.filter((marketplace) => !marketplace.installed)
  const enabledPlugins = filteredPlugins.filter((plugin) => plugin.enabled)
  const disabledPlugins = filteredPlugins.filter((plugin) => !plugin.enabled)

  const pendingUninstallRefs = useMemo(() => {
    if (!pendingUninstall) return []
    const librarySkills = skillsByLibrary.get(pendingUninstall.id) || []
    return findWorkflowRefsBySkills(currentWorkflow, librarySkills)
  }, [currentWorkflow, pendingUninstall, skillsByLibrary])

  const pendingDisablePluginRefs = useMemo(() => {
    if (!pendingDisablePlugin) return []
    const pluginSkills = skillsByPlugin.get(pendingDisablePlugin.id) || []
    return findWorkflowRefsBySkills(currentWorkflow, pluginSkills)
  }, [currentWorkflow, pendingDisablePlugin, skillsByPlugin])

  const pendingRemoveMarketplaceRefs = useMemo(() => {
    if (!pendingRemoveMarketplace) return []
    const marketplacePlugins = pluginsByMarketplaceId.get(pendingRemoveMarketplace.id) || []
    const marketplaceSkills = marketplacePlugins.flatMap((plugin) => skillsByPlugin.get(plugin.id) || [])
    return findWorkflowRefsBySkills(currentWorkflow, marketplaceSkills)
  }, [currentWorkflow, pendingRemoveMarketplace, pluginsByMarketplaceId, skillsByPlugin])

  const setLibraryInstalled = useCallback(async (library: SkillLibrary, nextChecked: boolean) => {
    if (!nextChecked) {
      setPendingUninstall(library)
      return
    }

    setLibraryAction({ id: library.id, action: "installing" })
    try {
      await window.api.installLibrary(library.id)
      toast.success(`Library installed: ${library.name}`)
      setStatusMessage(`${library.name} installed`)
      await refresh()
    } catch (error) {
      toast.error(`Failed to install ${library.name}: ${String(error)}`)
      setStatusMessage(`Failed to install ${library.name}`)
    } finally {
      setLibraryAction(null)
    }
  }, [refresh])

  const mutateMarketplace = useCallback(async (
    marketplace: MarketplaceSource,
    action: MarketplaceAction,
    operation: () => Promise<boolean>,
  ) => {
    setMarketplaceAction({ id: marketplace.id, action })
    try {
      await operation()
      const verb = action === "installing" ? "installed" : action === "updating" ? "updated" : "removed"
      toast.success(`Marketplace ${verb}: ${marketplace.name}`)
      setStatusMessage(`${marketplace.name} ${verb}`)
      await refresh()
    } catch (error) {
      const verb = action === "installing" ? "install" : action === "updating" ? "update" : "remove"
      toast.error(`Failed to ${verb} ${marketplace.name}: ${String(error)}`)
      setStatusMessage(`Failed to ${verb} ${marketplace.name}`)
    } finally {
      setMarketplaceAction(null)
    }
  }, [refresh])

  const installMarketplace = useCallback(async (marketplace: MarketplaceSource) => {
    await mutateMarketplace(marketplace, "installing", () => window.api.installMarketplace(marketplace.id))
  }, [mutateMarketplace])

  const updateMarketplace = useCallback(async (marketplace: MarketplaceSource) => {
    await mutateMarketplace(marketplace, "updating", () => window.api.updateMarketplace(marketplace.id))
  }, [mutateMarketplace])

  const requestRemoveMarketplace = useCallback((marketplace: MarketplaceSource) => {
    setPendingRemoveMarketplace(marketplace)
  }, [])

  const commitRemoveMarketplace = useCallback(async () => {
    const marketplace = pendingRemoveMarketplace
    if (!marketplace) return
    if (pendingRemoveMarketplaceRefs.length > 0 && !acknowledgeBrokenRefs) {
      return
    }
    setPendingRemoveMarketplace(null)
    await mutateMarketplace(marketplace, "removing", () => window.api.removeMarketplace(marketplace.id))
    setAcknowledgeBrokenRefs(false)
  }, [acknowledgeBrokenRefs, mutateMarketplace, pendingRemoveMarketplace, pendingRemoveMarketplaceRefs.length])

  const setPluginEnabled = useCallback(async (plugin: InstalledPlugin, nextChecked: boolean) => {
    if (!nextChecked) {
      setPendingDisablePlugin(plugin)
      return
    }

    setPluginAction({ id: plugin.id, action: "enabling" })
    try {
      await window.api.setPluginEnabled(plugin.id, true)
      toast.success(`Plugin enabled: ${plugin.name}`)
      setStatusMessage(`${plugin.name} enabled`)
      await refresh()
    } catch (error) {
      toast.error(`Failed to enable ${plugin.name}: ${String(error)}`)
      setStatusMessage(`Failed to enable ${plugin.name}`)
    } finally {
      setPluginAction(null)
    }
  }, [refresh])

  const commitDisablePlugin = useCallback(async () => {
    const plugin = pendingDisablePlugin
    if (!plugin) return
    if (pendingDisablePluginRefs.length > 0 && !acknowledgeBrokenRefs) {
      return
    }
    setPendingDisablePlugin(null)
    setPluginAction({ id: plugin.id, action: "disabling" })
    try {
      await window.api.setPluginEnabled(plugin.id, false)
      toast.success(`Plugin disabled: ${plugin.name}`)
      setStatusMessage(`${plugin.name} disabled`)
      await refresh()
    } catch (error) {
      toast.error(`Failed to disable ${plugin.name}: ${String(error)}`)
      setStatusMessage(`Failed to disable ${plugin.name}`)
    } finally {
      setPluginAction(null)
      setAcknowledgeBrokenRefs(false)
    }
  }, [acknowledgeBrokenRefs, pendingDisablePlugin, pendingDisablePluginRefs.length, refresh])

  const updateLibrary = useCallback(async (library: SkillLibrary) => {
    setLibraryAction({ id: library.id, action: "updating" })
    try {
      await window.api.installLibrary(library.id)
      toast.success(`Library updated: ${library.name}`)
      setStatusMessage(`${library.name} updated`)
      await refresh()
    } catch (error) {
      toast.error(`Failed to update ${library.name}: ${String(error)}`)
      setStatusMessage(`Failed to update ${library.name}`)
    } finally {
      setLibraryAction(null)
    }
  }, [refresh])

  const commitUninstall = useCallback(async () => {
    const library = pendingUninstall
    if (!library) return
    if (pendingUninstallRefs.length > 0 && !acknowledgeBrokenRefs) {
      return
    }
    setPendingUninstall(null)
    setLibraryAction({ id: library.id, action: "removing" })
    try {
      await window.api.removeLibrary(library.id)
      toast.success(`Library removed: ${library.name}`)
      setStatusMessage(`${library.name} removed`)
      await refresh()
    } catch (error) {
      toast.error(`Failed to remove ${library.name}: ${String(error)}`)
      setStatusMessage(`Failed to remove ${library.name}`)
    } finally {
      setLibraryAction(null)
      setAcknowledgeBrokenRefs(false)
    }
  }, [acknowledgeBrokenRefs, pendingUninstall, pendingUninstallRefs.length, refresh])

  const addToWorkflowDisabledReason = !selectedProject
    ? "Select a project first."
    : !selectedWorkflowPath
      ? "Open a workflow first."
      : null

  const addSkillToWorkflow = useCallback((skill: DiscoveredSkill) => {
    if (!selectedProject) {
      toast.error("Select a project first.")
      return
    }
    if (!selectedWorkflowPath) {
      toast.error("Open a workflow first, then add a skill.")
      return
    }

    let nextSelectedId: string | null = null
    setCurrentWorkflow((prev) => {
      const next = addSkillNodeToWorkflow(prev, skill)
      const previousIds = new Set(prev.nodes.map((node) => node.id))
      nextSelectedId = next.nodes.find((node) => !previousIds.has(node.id))?.id ?? null
      return next
    })
    if (nextSelectedId) {
      setSelectedNodeId(nextSelectedId)
    }
    toast.success(`Skill added: ${skill.name}`, {
      description: "The new step is ready in the workflow editor.",
      action: {
        label: "View workflow",
        onClick: () => setMainView("thread"),
      },
    })
    setStatusMessage(`${skill.name} added to workflow`)
  }, [selectedProject, selectedWorkflowPath, setCurrentWorkflow, setMainView, setSelectedNodeId])

  const createSkill = async () => {
    if (!selectedProject) {
      toast.error("Select a project first, then create a skill.")
      return
    }
    try {
      const skillPath = await window.api.createSkillTemplate(selectedProject)
      await refresh()
      const openError = await window.api.openPath(skillPath)
      const fileName = skillPath.split("/").pop() || "skill file"
      if (openError) {
        toast.success(`Skill created: ${fileName}`, {
          description: "Template is ready. Open it from your file explorer.",
          action: {
            label: "Open file",
            onClick: () => void window.api.openPath(skillPath),
          },
        })
      } else {
        toast.success(`Skill created and opened: ${fileName}`)
      }
      setStatusMessage("Skill template created")
    } catch (error) {
      toast.error(`Failed to create skill template: ${String(error)}`)
      setStatusMessage("Failed to create skill template")
    }
  }

  const previewItems = previewLibrary
    ? (skillsByLibrary.get(previewLibrary.id) || []).map((skill) => `${skill.category}/${skill.name}`)
    : []
  const previewHints = previewLibrary ? (LIBRARY_PREVIEW_HINTS[previewLibrary.id] || []) : []
  const currentLibraryActionLabel = libraryAction
    ? `${LIBRARY_ACTION_LABEL[libraryAction.action]} ${libraryById.get(libraryAction.id)?.name || "library"}...`
    : null
  const currentMarketplaceActionLabel = marketplaceAction
    ? `${MARKETPLACE_ACTION_LABEL[marketplaceAction.action]} ${marketplaces.find((item) => item.id === marketplaceAction.id)?.name || "marketplace"}...`
    : null
  const currentPluginActionLabel = pluginAction
    ? `${PLUGIN_ACTION_LABEL[pluginAction.action]} ${plugins.find((item) => item.id === pluginAction.id)?.name || "plugin"}...`
    : null
  const previewPluginSkills = previewPlugin
    ? (skillsByPlugin.get(previewPlugin.id) || []).map((skill) => `${skill.category}/${skill.name}`)
    : []
  const previewPluginMcpServers = previewPlugin
    ? (pluginMcpByPlugin.get(previewPlugin.id) || []).map((server) => server.name)
    : []

  return (
    <PageShell>
      <PageHeader
        title="Plugins"
        subtitle="Install marketplaces, enable executable pipeline packs, and browse discovered skills from one place."
      />

      <CollectionToolbar
        ariaLabel="Skill controls"
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search marketplaces, plugins, and skills"
        searchAriaLabel="Search marketplaces, plugins, and skills"
        summary={`${filteredMarketplaces.length} marketplace${filteredMarketplaces.length === 1 ? "" : "s"} · ${filteredPlugins.length} plugin${filteredPlugins.length === 1 ? "" : "s"} · ${filteredSkills.length} skill${filteredSkills.length === 1 ? "" : "s"}`}
        action={(
          <Button
            size="sm"
            variant="outline"
            onClick={() => void createSkill()}
            disabled={!selectedProject}
            title={selectedProject ? undefined : "Select a project first to create a skill."}
          >
            <Plus size={14} />
            New skill
          </Button>
        )}
      />

      {currentLibraryActionLabel && (
        <div className="ui-alert-info text-status-info flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          {currentLibraryActionLabel}
        </div>
      )}

      {currentMarketplaceActionLabel && (
        <div className="ui-alert-info text-status-info flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          {currentMarketplaceActionLabel}
        </div>
      )}

      {currentPluginActionLabel && (
        <div className="ui-alert-info text-status-info flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          {currentPluginActionLabel}
        </div>
      )}

      <SkillSourcesAdmin
        libraries={libraries}
        totalMarketplaceCount={marketplaces.length}
        installedLibraries={installedLibraries}
        favoriteLibraries={favoriteLibraries}
        availableLibraries={availableLibraries}
        filteredMarketplaces={filteredMarketplaces}
        installedMarketplaces={installedMarketplaces}
        availableMarketplaces={availableMarketplaces}
        enabledPlugins={enabledPlugins}
        disabledPlugins={disabledPlugins}
        skillsCountByLibrary={skillsCountByLibrary}
        skillsCountByPlugin={skillsCountByPlugin}
        pluginMcpByPlugin={pluginMcpByPlugin}
        pluginsByMarketplaceId={pluginsByMarketplaceId}
        libraryAction={libraryAction}
        marketplaceAction={marketplaceAction}
        pluginAction={pluginAction}
        refreshing={refreshing}
        hasQuery={Boolean(query.trim())}
        onSetLibraryInstalled={(library, nextChecked) => void setLibraryInstalled(library, nextChecked)}
        onUpdateLibrary={(library) => void updateLibrary(library)}
        onPreviewLibrary={setPreviewLibrary}
        onInstallMarketplace={(marketplace) => void installMarketplace(marketplace)}
        onUpdateMarketplace={(marketplace) => void updateMarketplace(marketplace)}
        onRequestRemoveMarketplace={requestRemoveMarketplace}
        onSetPluginEnabled={(plugin, nextChecked) => void setPluginEnabled(plugin, nextChecked)}
        onPreviewPlugin={setPreviewPlugin}
      />

      <section className="space-y-3">
        <SectionHeading title="Browse & Use" meta={
          <Badge variant="outline">
            {filteredSkills.length !== skills.length
              ? `${filteredSkills.length}/${skills.length}`
              : filteredSkills.length}
          </Badge>
        } />

        {filteredSkills.length === 0 ? (
          <div className="rounded-lg surface-panel ui-empty-state px-4 text-body-sm text-muted-foreground">
            No skills match this filter. Install a library or plugin, or clear search.
          </div>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="min-w-0 flex-1 rounded-lg surface-panel divide-y divide-hairline" role="list" aria-label="Available skills">
              {filteredSkills.map((skill) => {
                const isSelected = selectedSkill?.path === skill.path

                return (
                  <div
                    key={`${skill.path}-${skill.name}`}
                    className="flex items-start gap-3 px-3 py-2.5"
                    role="listitem"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="bare"
                      onClick={() => setSelectedSkill(skill)}
                      aria-pressed={isSelected}
                      className={cn(
                        "ui-interactive-card min-w-0 flex-1 !justify-start gap-3 rounded-md border border-transparent text-left !whitespace-normal",
                        isSelected && "surface-inset-card shadow-inset-highlight",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="ui-body-text-medium truncate">{skill.name}</span>
                          <Badge variant="outline" size="compact">{skill.type}</Badge>
                          <Badge variant="secondary" size="compact">
                            {getSkillSourceLabel(skill)}
                          </Badge>
                        </div>
                        <p className="ui-meta-text text-muted-foreground mt-0.5">
                          {skill.category}/{skill.name}
                        </p>
                        {skill.description && (
                          <p className="ui-meta-text text-muted-foreground line-clamp-2 mt-0.5">
                            {skill.description}
                          </p>
                        )}
                      </div>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation()
                        addSkillToWorkflow(skill)
                      }}
                      disabled={!!addToWorkflowDisabledReason}
                      title={addToWorkflowDisabledReason || "Add this skill to the current workflow."}
                    >
                      Add to workflow
                    </Button>
                  </div>
                )
              })}
            </div>

            {selectedSkill && (
              <SkillDetailPanel
                skill={selectedSkill}
                onAddToWorkflow={() => addSkillToWorkflow(selectedSkill)}
                canAddToWorkflow={!addToWorkflowDisabledReason}
                addDisabledReason={addToWorkflowDisabledReason}
                onClose={() => setSelectedSkill(null)}
              />
            )}
          </div>
        )}

        {!selectedWorkflowPath && (
          <p className="ui-meta-text text-muted-foreground">
            Open a workflow to enable &ldquo;Add to workflow&rdquo;.
          </p>
        )}
      </section>

      <div aria-live="polite" className="sr-only">{statusMessage}</div>

      <SkillsPageDialogs
        pendingUninstall={pendingUninstall}
        pendingUninstallRefs={pendingUninstallRefs}
        onPendingUninstallChange={setPendingUninstall}
        onCommitUninstall={() => void commitUninstall()}
        pendingDisablePlugin={pendingDisablePlugin}
        pendingDisablePluginRefs={pendingDisablePluginRefs}
        onPendingDisablePluginChange={setPendingDisablePlugin}
        onCommitDisablePlugin={() => void commitDisablePlugin()}
        pendingRemoveMarketplace={pendingRemoveMarketplace}
        pendingRemoveMarketplaceRefs={pendingRemoveMarketplaceRefs}
        onPendingRemoveMarketplaceChange={setPendingRemoveMarketplace}
        onCommitRemoveMarketplace={() => void commitRemoveMarketplace()}
        acknowledgeBrokenRefs={acknowledgeBrokenRefs}
        onAcknowledgeBrokenRefsChange={setAcknowledgeBrokenRefs}
        previewLibrary={previewLibrary}
        previewItems={previewItems}
        previewHints={previewHints}
        onPreviewLibraryChange={setPreviewLibrary}
        previewPlugin={previewPlugin}
        previewPluginSkills={previewPluginSkills}
        previewPluginMcpServers={previewPluginMcpServers}
        onPreviewPluginChange={setPreviewPlugin}
        onOpenMcpSettings={() => setMainView("settings")}
      />
    </PageShell>
  )
}
