import { useCallback, useEffect, useMemo, useState } from "react"
import { useAtom } from "jotai"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  PluginCapability,
  PluginMcpServerInfo,
  Workflow,
} from "@shared/types"
import { Eye, Library, Loader2, Package, Plus, RefreshCw, Store } from "lucide-react"
import { toast } from "sonner"
import { PageHeader, PageShell, SectionHeading } from "@/components/ui/page-shell"
import { SkillDetailPanel } from "@/components/SkillDetailPanel"
import { CollectionToolbar } from "@/components/ui/collection-toolbar"

type LibraryAction = "installing" | "updating" | "removing"
type MarketplaceAction = "installing" | "updating" | "removing"
type PluginAction = "enabling" | "disabling"

const LIBRARY_ACTION_LABEL: Record<LibraryAction, string> = {
  installing: "Installing",
  updating: "Updating",
  removing: "Removing",
}

const MARKETPLACE_ACTION_LABEL: Record<MarketplaceAction, string> = {
  installing: "Installing",
  updating: "Updating",
  removing: "Removing",
}

const PLUGIN_ACTION_LABEL: Record<PluginAction, string> = {
  enabling: "Enabling",
  disabling: "Disabling",
}

const FAVORITE_LIBRARY_IDS = [
  "agency-agents",
  "anthropic-skills",
  "gtm-skills",
  "jeff-allan-skills",
  "composio-skills",
] as const

const FAVORITE_LIBRARY_ORDER = new Map<string, number>(
  FAVORITE_LIBRARY_IDS.map((id, index) => [id, index]),
)

const LIBRARY_PREVIEW_HINTS: Record<string, string[]> = {
  "agency-agents": [
    "Product manager and growth planning agents",
    "Frontend, backend, and QA engineering agents",
    "Marketing and copywriting support agents",
  ],
  "gtm-skills": [
    "Market research and ICP definition",
    "Outbound email drafting and sequencing",
    "Lead enrichment and account profiling",
  ],
  "anthropic-skills": [
    "PDF, DOCX, and XLSX processing",
    "Presentation analysis and summarization",
    "Website and design QA skills",
  ],
  "jeff-allan-skills": [
    "Architecture and code review workflows",
    "Debugging and incident-response helpers",
    "Testing and CI/CD optimization skills",
  ],
  "composio-skills": [
    "SaaS integrations and automation helpers",
    "Content and creative production skills",
    "Research and operations accelerators",
  ],
}

function normalizeSkillRef(value: string): string {
  return value.trim().replace(/^\/+/, "").replace(/\/+/g, "/").toLowerCase()
}

function skillRefCandidates(skill: DiscoveredSkill): string[] {
  const name = normalizeSkillRef(skill.name)
  const category = normalizeSkillRef(skill.category || "")
  const full = normalizeSkillRef(`${category}/${name}`)
  return Array.from(new Set([name, full])).filter(Boolean)
}

function findWorkflowRefsBySkills(workflow: Workflow, candidateSkills: DiscoveredSkill[]): string[] {
  if (candidateSkills.length === 0) return []
  const candidates = new Set(candidateSkills.flatMap(skillRefCandidates))
  const impacted = new Set<string>()

  for (const node of workflow.nodes) {
    if (node.type !== "skill") continue
    const rawRef = typeof node.config.skillRef === "string" ? node.config.skillRef : ""
    const normalizedRef = normalizeSkillRef(rawRef)
    if (!normalizedRef) continue
    const matches = Array.from(candidates).some((candidate) =>
      normalizedRef === candidate || normalizedRef.endsWith(`/${candidate}`),
    )
    if (matches) impacted.add(rawRef)
  }

  return Array.from(impacted)
}

function formatPluginAssetCount(plugin: InstalledPlugin, capability: PluginCapability): string {
  const asset = plugin.assets.find((item) => item.capability === capability)
  const count = asset?.count ?? 0
  if (capability === "skill") return `${count} skill${count === 1 ? "" : "s"}`
  if (capability === "template") return `${count} template${count === 1 ? "" : "s"}`
  return `${count} MCP server${count === 1 ? "" : "s"}`
}

function marketplaceBadgeVariant(marketplace: MarketplaceSource): "secondary" | "outline" {
  return marketplace.installed ? "secondary" : "outline"
}

function pluginBadgeVariant(plugin: InstalledPlugin): "success" | "outline" {
  return plugin.enabled ? "success" : "outline"
}

function MarketplaceCard({
  marketplace,
  pluginCount,
  busy,
  actionLabel,
  onInstall,
  onUpdate,
  onRemove,
}: {
  marketplace: MarketplaceSource
  pluginCount: number
  busy: boolean
  actionLabel: string | null
  onInstall: () => void
  onUpdate: () => void
  onRemove: () => void
}) {
  return (
    <article className="ui-interactive-card rounded-lg surface-panel px-4 py-3 flex items-center gap-3">
      <div className="h-control-lg w-control-lg rounded-lg border border-border bg-surface-2 flex items-center justify-center">
        <Store size={18} className="text-muted-foreground" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-body-md font-semibold truncate">{marketplace.name}</h3>
          <Badge variant={marketplaceBadgeVariant(marketplace)} size="pill">
            {marketplace.installed ? "installed" : "available"}
          </Badge>
          {pluginCount > 0 && (
            <Badge variant="outline" size="compact">{pluginCount} plugin{pluginCount === 1 ? "" : "s"}</Badge>
          )}
          {actionLabel && (
            <Badge variant="secondary" size="compact">{actionLabel}</Badge>
          )}
        </div>
        <p className="text-body-sm text-muted-foreground line-clamp-2">{marketplace.description}</p>
        <p className="ui-meta-text text-muted-foreground mt-0.5">
          {marketplace.owner ? `${marketplace.owner} · ` : ""}{marketplace.repo}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {marketplace.installed ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={onUpdate}
              disabled={busy}
              aria-label={`Update ${marketplace.name}`}
            >
              {busy && actionLabel === "Updating" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onRemove}
              disabled={busy}
            >
              Remove
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onInstall}
            disabled={busy}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            Install
          </Button>
        )}
      </div>
    </article>
  )
}

function PluginCard({
  plugin,
  skillsCount,
  mcpCount,
  busy,
  actionLabel,
  onToggle,
  onPreview,
}: {
  plugin: InstalledPlugin
  skillsCount: number
  mcpCount: number
  busy: boolean
  actionLabel: string | null
  onToggle: (nextChecked: boolean) => void
  onPreview: () => void
}) {
  return (
    <article className="ui-interactive-card rounded-lg surface-panel px-4 py-3 flex items-center gap-3">
      <div className="h-control-lg w-control-lg rounded-lg border border-border bg-surface-2 flex items-center justify-center">
        <Package size={18} className="text-muted-foreground" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-body-md font-semibold truncate">{plugin.name}</h3>
          <Badge variant={pluginBadgeVariant(plugin)} size="pill">
            {plugin.enabled ? "enabled" : "disabled"}
          </Badge>
          {actionLabel && (
            <Badge variant="secondary" size="compact">{actionLabel}</Badge>
          )}
          {plugin.capabilities.map((capability) => (
            <Badge key={capability} variant="outline" size="compact">
              {formatPluginAssetCount(plugin, capability)}
            </Badge>
          ))}
        </div>
        <p className="text-body-sm text-muted-foreground line-clamp-2">
          {plugin.description || "Plugin bundle for executable pipeline assets."}
        </p>
        <p className="ui-meta-text text-muted-foreground mt-0.5">
          {plugin.marketplaceName}
          {plugin.version ? ` · v${plugin.version}` : ""}
          {skillsCount > 0 ? ` · ${skillsCount} discovered skill${skillsCount === 1 ? "" : "s"}` : ""}
          {mcpCount > 0 ? ` · ${mcpCount} MCP pack${mcpCount === 1 ? "" : "s"}` : ""}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPreview}
          disabled={busy}
          aria-label={`Preview ${plugin.name}`}
        >
          <Eye size={14} />
        </Button>
        <Switch
          checked={plugin.enabled}
          onCheckedChange={onToggle}
          disabled={busy}
          aria-label={plugin.enabled ? `Disable ${plugin.name}` : `Enable ${plugin.name}`}
        />
      </div>
    </article>
  )
}

function SkillLibraryCard({
  library,
  installedSkillsCount,
  busy,
  actionLabel,
  onToggle,
  onUpdate,
  onPreview,
}: {
  library: SkillLibrary
  installedSkillsCount: number
  busy: boolean
  actionLabel: string | null
  onToggle: (nextChecked: boolean) => void
  onUpdate: () => void
  onPreview: () => void
}) {
  return (
    <article
      className={cn(
        "ui-interactive-card rounded-lg surface-panel px-4 py-3",
        "flex items-center gap-3",
      )}
    >
      <div className="h-control-lg w-control-lg rounded-lg border border-border bg-surface-2 flex items-center justify-center">
        <Library size={18} className="text-muted-foreground" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-body-md font-semibold truncate">{library.name}</h3>
          {library.installed && (
            <Badge variant="outline">
              {installedSkillsCount} skills
            </Badge>
          )}
          {actionLabel && (
            <Badge variant="secondary">{actionLabel}</Badge>
          )}
        </div>
        <p className="text-body-sm text-muted-foreground truncate">
          {library.description}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPreview}
          disabled={busy}
          aria-label={`Preview ${library.name}`}
        >
          <Eye size={14} />
        </Button>
        {library.installed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onUpdate}
            disabled={busy}
            aria-label={`Update ${library.name}`}
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
          </Button>
        )}
        <Switch
          checked={library.installed}
          onCheckedChange={onToggle}
          disabled={busy}
          aria-label={library.installed ? `Uninstall ${library.name}` : `Install ${library.name}`}
        />
      </div>
    </article>
  )
}

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

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const [loadedLibraries, loadedMarketplaces, loadedPlugins, loadedPluginMcpServers, scanned] = await Promise.all([
        window.api.listLibraries(),
        window.api.listMarketplaces(),
        window.api.scanPlugins(),
        window.api.mcpListPluginServers(),
        selectedProject ? window.api.scanSkills(selectedProject) : Promise.resolve([] as DiscoveredSkill[]),
      ])
      setLibraries(loadedLibraries)
      setMarketplaces(loadedMarketplaces)
      setPlugins(loadedPlugins)
      setPluginMcpServers(loadedPluginMcpServers)
      setSkills(scanned)
    } catch (error) {
      toast.error(`Failed to refresh skills: ${String(error)}`)
    } finally {
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
    const q = query.trim().toLowerCase()
    if (!q) return libraries
    return libraries.filter((library) =>
      `${library.name} ${library.description} ${library.id}`.toLowerCase().includes(q),
    )
  }, [libraries, query])

  const filteredMarketplaces = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return marketplaces
    return marketplaces.filter((marketplace) =>
      `${marketplace.name} ${marketplace.description} ${marketplace.id} ${marketplace.owner || ""}`.toLowerCase().includes(q),
    )
  }, [marketplaces, query])

  const filteredPlugins = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = !q
      ? plugins
      : plugins.filter((plugin) =>
        [
          plugin.name,
          plugin.description,
          plugin.marketplaceName,
          plugin.category || "",
          plugin.tags?.join(" ") || "",
          plugin.capabilities.join(" "),
        ].join(" ").toLowerCase().includes(q),
      )
    return [...list].sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
      if (a.marketplaceName !== b.marketplaceName) return a.marketplaceName.localeCompare(b.marketplaceName)
      return a.name.localeCompare(b.name)
    })
  }, [plugins, query])

  const filteredSkills = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = !q
      ? skills
      : skills.filter((skill) =>
        `${skill.name} ${skill.description} ${skill.category} ${getSkillSourceLabel(skill)}`.toLowerCase().includes(q),
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

      <section className="space-y-3">
        <SectionHeading title="Marketplaces" meta={<Badge variant="outline">{installedMarketplaces.length}/{marketplaces.length}</Badge>} />

        {filteredMarketplaces.length === 0 ? (
          <div className="rounded-lg surface-panel ui-empty-state px-4 text-body-sm text-muted-foreground">
            No marketplaces match this filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {installedMarketplaces.map((marketplace) => {
              const busy = refreshing || marketplaceAction?.id === marketplace.id
              const actionLabel = marketplaceAction?.id === marketplace.id
                ? MARKETPLACE_ACTION_LABEL[marketplaceAction.action]
                : null
              return (
                <MarketplaceCard
                  key={marketplace.id}
                  marketplace={marketplace}
                  pluginCount={(pluginsByMarketplaceId.get(marketplace.id) || []).length}
                  busy={busy}
                  actionLabel={actionLabel}
                  onInstall={() => undefined}
                  onUpdate={() => void updateMarketplace(marketplace)}
                  onRemove={() => requestRemoveMarketplace(marketplace)}
                />
              )
            })}
            {availableMarketplaces.map((marketplace) => {
              const busy = refreshing || marketplaceAction?.id === marketplace.id
              const actionLabel = marketplaceAction?.id === marketplace.id
                ? MARKETPLACE_ACTION_LABEL[marketplaceAction.action]
                : null
              return (
                <MarketplaceCard
                  key={marketplace.id}
                  marketplace={marketplace}
                  pluginCount={0}
                  busy={busy}
                  actionLabel={actionLabel}
                  onInstall={() => void installMarketplace(marketplace)}
                  onUpdate={() => undefined}
                  onRemove={() => undefined}
                />
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading title="Enabled Plugins" meta={<Badge variant="outline">{enabledPlugins.length}</Badge>} />

        {enabledPlugins.length === 0 ? (
          <div className="rounded-lg surface-panel ui-empty-state px-4 text-body-sm text-muted-foreground">
            Install a marketplace and enable a plugin pack to bring in pipeline skills, templates, or MCP integrations.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {enabledPlugins.map((plugin) => {
              const busy = refreshing || pluginAction?.id === plugin.id
              const actionLabel = pluginAction?.id === plugin.id
                ? PLUGIN_ACTION_LABEL[pluginAction.action]
                : null
              return (
                <PluginCard
                  key={plugin.id}
                  plugin={plugin}
                  skillsCount={skillsCountByPlugin.get(plugin.id) ?? 0}
                  mcpCount={(pluginMcpByPlugin.get(plugin.id) || []).length}
                  busy={busy}
                  actionLabel={actionLabel}
                  onToggle={(nextChecked) => void setPluginEnabled(plugin, nextChecked)}
                  onPreview={() => setPreviewPlugin(plugin)}
                />
              )
            })}
          </div>
        )}
      </section>

      {(disabledPlugins.length > 0 || query.trim()) && (
        <section className="space-y-3">
          <SectionHeading title="Installed But Disabled" meta={<Badge variant="outline">{disabledPlugins.length}</Badge>} />

          {disabledPlugins.length === 0 ? (
            <div className="rounded-lg surface-panel ui-empty-state px-4 text-body-sm text-muted-foreground">
              No disabled plugins match this filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {disabledPlugins.map((plugin) => {
                const busy = refreshing || pluginAction?.id === plugin.id
                const actionLabel = pluginAction?.id === plugin.id
                  ? PLUGIN_ACTION_LABEL[pluginAction.action]
                  : null
                return (
                  <PluginCard
                    key={plugin.id}
                    plugin={plugin}
                    skillsCount={skillsCountByPlugin.get(plugin.id) ?? 0}
                    mcpCount={(pluginMcpByPlugin.get(plugin.id) || []).length}
                    busy={busy}
                    actionLabel={actionLabel}
                    onToggle={(nextChecked) => void setPluginEnabled(plugin, nextChecked)}
                    onPreview={() => setPreviewPlugin(plugin)}
                  />
                )
              })}
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <SectionHeading title="Installed Legacy Libraries" meta={<Badge variant="outline">{installedLibraries.length}/{libraries.length}</Badge>} />

        {installedLibraries.length === 0 ? (
          <div className="rounded-lg surface-panel ui-empty-state px-4 text-body-sm text-muted-foreground">
            No legacy libraries installed. Use plugin marketplaces above for the primary packaging model.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {installedLibraries.map((library) => {
              const cardBusy = refreshing || libraryAction?.id === library.id
              const actionLabel = libraryAction?.id === library.id
                ? LIBRARY_ACTION_LABEL[libraryAction.action]
                : null
              return (
                <SkillLibraryCard
                  key={library.id}
                  library={library}
                  installedSkillsCount={skillsCountByLibrary.get(library.id) ?? 0}
                  busy={cardBusy}
                  actionLabel={actionLabel}
                  onToggle={(nextChecked) => void setLibraryInstalled(library, nextChecked)}
                  onUpdate={() => void updateLibrary(library)}
                  onPreview={() => setPreviewLibrary(library)}
                />
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading title="Legacy Favorites" meta={<Badge variant="outline">{favoriteLibraries.length}</Badge>} />

        {favoriteLibraries.length === 0 ? (
          <div className="rounded-lg surface-panel ui-empty-state px-4 text-body-sm text-muted-foreground">
            {query.trim()
              ? "No favorite libraries match this filter."
              : "Your favorite libraries are already installed."}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {favoriteLibraries.map((library) => {
              const cardBusy = refreshing || libraryAction?.id === library.id
              const actionLabel = libraryAction?.id === library.id
                ? LIBRARY_ACTION_LABEL[libraryAction.action]
                : null
              return (
                <SkillLibraryCard
                  key={library.id}
                  library={library}
                  installedSkillsCount={0}
                  busy={cardBusy}
                  actionLabel={actionLabel}
                  onToggle={(nextChecked) => void setLibraryInstalled(library, nextChecked)}
                  onUpdate={() => undefined}
                  onPreview={() => setPreviewLibrary(library)}
                />
              )
            })}
          </div>
        )}
      </section>

      {(availableLibraries.length > 0 || query.trim()) && (
        <section className="space-y-3">
          <SectionHeading title="Legacy Available" meta={<Badge variant="outline">{availableLibraries.length}</Badge>} />

          {availableLibraries.length === 0 ? (
            <div className="rounded-lg surface-panel ui-empty-state px-4 text-body-sm text-muted-foreground">
              No other libraries match this filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {availableLibraries.map((library) => {
                const cardBusy = refreshing || libraryAction?.id === library.id
                const actionLabel = libraryAction?.id === library.id
                  ? LIBRARY_ACTION_LABEL[libraryAction.action]
                  : null
                return (
                  <SkillLibraryCard
                    key={library.id}
                    library={library}
                    installedSkillsCount={0}
                    busy={cardBusy}
                    actionLabel={actionLabel}
                    onToggle={(nextChecked) => void setLibraryInstalled(library, nextChecked)}
                    onUpdate={() => undefined}
                    onPreview={() => setPreviewLibrary(library)}
                  />
                )
              })}
            </div>
          )}
        </section>
      )}

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
                    className={cn(
                      "flex items-start gap-3 px-3 py-2.5",
                      isSelected && "bg-surface-2/80 shadow-inset-highlight",
                    )}
                    role="listitem"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="bare"
                      onClick={() => setSelectedSkill(skill)}
                      aria-pressed={isSelected}
                      className={cn(
                        "min-w-0 flex-1 !justify-start gap-3 rounded-md border border-transparent text-left !whitespace-normal",
                        isSelected
                          ? "hover:bg-transparent"
                          : "hover:bg-surface-2/60",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-body-md font-medium truncate">{skill.name}</span>
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
                      onClick={(e) => {
                        e.stopPropagation()
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

      <Dialog open={pendingUninstall !== null} onOpenChange={(open) => !open && setPendingUninstall(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Uninstall library?</DialogTitle>
            <DialogDescription>
              Remove &ldquo;{pendingUninstall?.name || "library"}&rdquo; and its installed skills from this app profile?
            </DialogDescription>
          </DialogHeader>

          {pendingUninstallRefs.length > 0 && (
            <div className="ui-alert-warning space-y-2">
              <p className="text-body-sm text-status-warning">
                Dependency warning: current workflow references skills from this library.
              </p>
              <div className="flex flex-wrap gap-1">
                {pendingUninstallRefs.slice(0, 6).map((skillRef) => (
                  <Badge key={skillRef} variant="outline" className="font-mono">{skillRef}</Badge>
                ))}
                {pendingUninstallRefs.length > 6 && (
                  <Badge variant="outline">+{pendingUninstallRefs.length - 6} more</Badge>
                )}
              </div>
              <Label htmlFor="acknowledge-broken-refs" className="text-body-sm flex items-center gap-2 cursor-pointer">
                <Switch
                  id="acknowledge-broken-refs"
                  checked={acknowledgeBrokenRefs}
                  onCheckedChange={setAcknowledgeBrokenRefs}
                />
                I understand this may break `skillRef` in the current workflow.
              </Label>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingUninstall(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void commitUninstall()} disabled={pendingUninstallRefs.length > 0 && !acknowledgeBrokenRefs}>
              Uninstall
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingDisablePlugin !== null} onOpenChange={(open) => !open && setPendingDisablePlugin(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Disable plugin?</DialogTitle>
            <DialogDescription>
              Disable &ldquo;{pendingDisablePlugin?.name || "plugin"}&rdquo; and hide its packaged skills, templates, and MCP packs from the active profile?
            </DialogDescription>
          </DialogHeader>

          {pendingDisablePluginRefs.length > 0 && (
            <div className="ui-alert-warning space-y-2">
              <p className="text-body-sm text-status-warning">
                Dependency warning: current workflow references skills from this plugin.
              </p>
              <div className="flex flex-wrap gap-1">
                {pendingDisablePluginRefs.slice(0, 6).map((skillRef) => (
                  <Badge key={skillRef} variant="outline" className="font-mono">{skillRef}</Badge>
                ))}
                {pendingDisablePluginRefs.length > 6 && (
                  <Badge variant="outline">+{pendingDisablePluginRefs.length - 6} more</Badge>
                )}
              </div>
              <Label htmlFor="acknowledge-disable-plugin-refs" className="text-body-sm flex items-center gap-2 cursor-pointer">
                <Switch
                  id="acknowledge-disable-plugin-refs"
                  checked={acknowledgeBrokenRefs}
                  onCheckedChange={setAcknowledgeBrokenRefs}
                />
                I understand this may break `skillRef` in the current workflow.
              </Label>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDisablePlugin(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void commitDisablePlugin()} disabled={pendingDisablePluginRefs.length > 0 && !acknowledgeBrokenRefs}>
              Disable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingRemoveMarketplace !== null} onOpenChange={(open) => !open && setPendingRemoveMarketplace(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove marketplace?</DialogTitle>
            <DialogDescription>
              Remove &ldquo;{pendingRemoveMarketplace?.name || "marketplace"}&rdquo; and all plugin packs installed from it?
            </DialogDescription>
          </DialogHeader>

          {pendingRemoveMarketplaceRefs.length > 0 && (
            <div className="ui-alert-warning space-y-2">
              <p className="text-body-sm text-status-warning">
                Dependency warning: current workflow references skills from plugins in this marketplace.
              </p>
              <div className="flex flex-wrap gap-1">
                {pendingRemoveMarketplaceRefs.slice(0, 6).map((skillRef) => (
                  <Badge key={skillRef} variant="outline" className="font-mono">{skillRef}</Badge>
                ))}
                {pendingRemoveMarketplaceRefs.length > 6 && (
                  <Badge variant="outline">+{pendingRemoveMarketplaceRefs.length - 6} more</Badge>
                )}
              </div>
              <Label htmlFor="acknowledge-remove-marketplace-refs" className="text-body-sm flex items-center gap-2 cursor-pointer">
                <Switch
                  id="acknowledge-remove-marketplace-refs"
                  checked={acknowledgeBrokenRefs}
                  onCheckedChange={setAcknowledgeBrokenRefs}
                />
                I understand this may break `skillRef` in the current workflow.
              </Label>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingRemoveMarketplace(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void commitRemoveMarketplace()} disabled={pendingRemoveMarketplaceRefs.length > 0 && !acknowledgeBrokenRefs}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewLibrary !== null} onOpenChange={(open) => !open && setPreviewLibrary(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{previewLibrary?.name || "Library"} preview</DialogTitle>
            <DialogDescription>
              {previewLibrary?.installed
                ? "Detected skills from this installed library."
                : "Typical capabilities available after installation."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {previewLibrary?.installed && previewItems.length > 0 ? (
              <div className="rounded-md border border-hairline bg-surface-2/60 p-2 max-h-56 overflow-y-auto ui-scroll-region space-y-1">
                {previewItems.slice(0, 20).map((item) => (
                  <div key={item} className="ui-meta-text font-mono text-foreground-subtle">{item}</div>
                ))}
                {previewItems.length > 20 && (
                  <div className="ui-meta-text text-muted-foreground">+{previewItems.length - 20} more</div>
                )}
              </div>
            ) : previewHints.length > 0 ? (
              <div className="rounded-md border border-hairline bg-surface-2/60 p-2 space-y-1">
                {previewHints.map((item) => (
                  <div key={item} className="text-body-sm text-foreground-subtle">{item}</div>
                ))}
              </div>
            ) : (
              <p className="text-body-sm text-muted-foreground">
                Install this library to scan exact skills for your project.
              </p>
            )}

            {previewLibrary && (
              <p className="ui-meta-text text-muted-foreground">
                Source: {previewLibrary.repo}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreviewLibrary(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewPlugin !== null} onOpenChange={(open) => !open && setPreviewPlugin(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{previewPlugin?.name || "Plugin"} preview</DialogTitle>
            <DialogDescription>
              Packaged pipeline assets discovered from this installed plugin.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {previewPlugin && (
              <div className="flex flex-wrap gap-1">
                <Badge variant={pluginBadgeVariant(previewPlugin)} size="pill">
                  {previewPlugin.enabled ? "enabled" : "disabled"}
                </Badge>
                {previewPlugin.capabilities.map((capability) => (
                  <Badge key={capability} variant="outline" size="compact">
                    {formatPluginAssetCount(previewPlugin, capability)}
                  </Badge>
                ))}
              </div>
            )}

            {previewPluginSkills.length > 0 && (
              <div className="space-y-1">
                <p className="text-body-sm font-medium text-foreground">Skills</p>
                <div className="rounded-md border border-hairline bg-surface-2/60 p-2 max-h-56 overflow-y-auto ui-scroll-region space-y-1">
                  {previewPluginSkills.slice(0, 20).map((item) => (
                    <div key={item} className="ui-meta-text font-mono text-foreground-subtle">{item}</div>
                  ))}
                  {previewPluginSkills.length > 20 && (
                    <div className="ui-meta-text text-muted-foreground">+{previewPluginSkills.length - 20} more</div>
                  )}
                </div>
              </div>
            )}

            {previewPluginMcpServers.length > 0 && (
              <div className="space-y-1">
                <p className="text-body-sm font-medium text-foreground">MCP packs</p>
                <div className="rounded-md border border-hairline bg-surface-2/60 p-2 space-y-1">
                  {previewPluginMcpServers.map((serverName) => (
                    <div key={serverName} className="ui-meta-text font-mono text-foreground-subtle">{serverName}</div>
                  ))}
                </div>
              </div>
            )}

            {previewPlugin && (
              <p className="ui-meta-text text-muted-foreground">
                Source: {previewPlugin.marketplaceName}
                {previewPlugin.version ? ` · v${previewPlugin.version}` : ""}
              </p>
            )}
          </div>

          <DialogFooter>
            {previewPlugin?.capabilities.includes("mcp") ? (
              <Button variant="outline" onClick={() => setMainView("settings")}>
                Open MCP Settings
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setPreviewPlugin(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
