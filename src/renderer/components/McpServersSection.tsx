import { useCallback, useEffect, useMemo, useState } from "react"
import { useAtom } from "jotai"
import { mcpServersAtom, mcpServersLoadingAtom } from "@/lib/store"
import { SectionHeading } from "@/components/ui/page-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  McpServerInfo,
  McpServerScope,
  McpTransportType,
  McpTestResult,
  ProviderId,
} from "@shared/types"
import { PROVIDER_LABELS } from "@shared/provider-metadata"
import {
  Plus,
  RefreshCw,
  Loader2,
  Pencil,
  Trash2,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Server,
  Activity,
} from "lucide-react"

// ── Compact Server Row ──────────────────────────────────

interface ServerTestState {
  loading: boolean
  result: McpTestResult | null
}

function McpServerRow({
  server,
  provider,
  onEdit,
  onRemove,
  onRefresh,
}: {
  server: McpServerInfo
  provider: ProviderId
  onEdit: (server: McpServerInfo) => void
  onRemove: (server: McpServerInfo) => void
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [testState, setTestState] = useState<ServerTestState>({ loading: false, result: null })
  const [toggling, setToggling] = useState(false)

  const handleToggle = async (enabled: boolean) => {
    setToggling(true)
    try {
      await window.api.mcpToggleServer(
        provider,
        server.name,
        server.scope,
        !enabled,
        server.projectPath,
      )
      onRefresh()
    } finally {
      setToggling(false)
    }
  }

  const handleTest = async () => {
    setTestState({ loading: true, result: null })
    try {
      const result = await window.api.mcpTestServer(
        provider,
        server.name,
        server.scope,
        server.projectPath,
      )
      setTestState({ loading: false, result })
    } catch {
      setTestState({
        loading: false,
        result: { healthy: false, tools: [], error: "Test failed", latencyMs: 0 },
      })
    }
  }

  const transportSummary = server.type === "stdio"
    ? [server.command, ...(server.args || [])].filter(Boolean).join(" ")
    : server.url || ""

  return (
    <div className="group">
      {/* Main compact row */}
      <div className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-surface-2/50 -mx-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        <span className={`text-body-sm font-medium truncate ${server.disabled ? "text-muted-foreground line-through" : ""}`}>
          {server.name}
        </span>

        <Badge variant="outline" className="text-[10px] font-medium uppercase tracking-wide shrink-0">
          {server.type}
        </Badge>

        <span className="ui-meta-text text-muted-foreground truncate hidden sm:inline">
          {transportSummary}
        </span>

        {testState.result && (
          <span className="shrink-0">
            {testState.result.healthy
              ? <Check size={12} className="text-status-success" />
              : <AlertCircle size={12} className="text-status-danger" />
            }
          </span>
        )}

        <span className="flex-1" />

        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 ui-motion-fast">
          <button
            onClick={handleTest}
            disabled={testState.loading}
            className="p-1 text-muted-foreground hover:text-foreground rounded"
            title="Test connection"
          >
            {testState.loading ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />}
          </button>
          <button onClick={() => onEdit(server)} className="p-1 text-muted-foreground hover:text-foreground rounded" title="Edit">
            <Pencil size={12} />
          </button>
          <button onClick={() => onRemove(server)} className="p-1 text-muted-foreground hover:text-status-danger rounded" title="Remove">
            <Trash2 size={12} />
          </button>
        </div>

        <Switch
          checked={!server.disabled}
          disabled={toggling}
          aria-label={`Toggle ${server.name}`}
          onCheckedChange={handleToggle}
          className="shrink-0 scale-[0.8]"
        />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="pl-7 pr-2 pb-2 space-y-1">
          <div className="ui-meta-text text-muted-foreground space-y-0.5">
            {server.type === "stdio" && (
              <>
                <p>Command: <span className="text-foreground font-mono">{server.command || "n/a"}</span></p>
                {server.args?.length ? (
                  <p>Args: <span className="text-foreground font-mono">{server.args.join(" ")}</span></p>
                ) : null}
              </>
            )}
            {(server.type === "http" || server.type === "sse") && (
              <p>URL: <span className="text-foreground font-mono">{server.url || "n/a"}</span></p>
            )}
            {server.env && Object.keys(server.env).length > 0 && (
              <p>Env: <span className="text-foreground font-mono">{Object.keys(server.env).join(", ")}</span></p>
            )}
          </div>

          {testState.result && (
            <div className="space-y-0.5 mt-1">
              {testState.result.healthy ? (
                <p className="ui-meta-text text-status-success">
                  Healthy — {testState.result.tools.length} tool{testState.result.tools.length !== 1 ? "s" : ""} ({testState.result.latencyMs}ms)
                </p>
              ) : (
                <p className="ui-meta-text text-status-danger">
                  {testState.result.error || "Connection failed"}
                </p>
              )}
              {testState.result.healthy && testState.result.tools.length > 0 && (
                <div className="space-y-0.5">
                  {testState.result.tools.map((tool) => (
                    <p key={tool.qualifiedName} className="ui-meta-text text-muted-foreground">
                      <span className="text-foreground font-mono">{tool.name}</span>
                      {tool.description ? ` — ${tool.description}` : ""}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Add/Edit Dialog ─────────────────────────────────────

interface FormState {
  name: string
  type: McpTransportType
  scope: McpServerScope
  command: string
  args: string
  url: string
  env: string
}

const EMPTY_FORM: FormState = {
  name: "",
  type: "stdio",
  scope: "local",
  command: "",
  args: "",
  url: "",
  env: "",
}

function serverToFormState(server: McpServerInfo): FormState {
  return {
    name: server.name,
    type: server.type,
    scope: server.scope,
    command: server.command || "",
    args: (server.args || []).join(" "),
    url: server.url || "",
    env: server.env ? Object.entries(server.env).map(([k, v]) => `${k}=${v}`).join("\n") : "",
  }
}

function formStateToServer(form: FormState): McpServerInfo {
  const envEntries = form.env.trim()
    ? form.env.trim().split("\n").reduce<Record<string, string>>((acc, line) => {
        const eqIdx = line.indexOf("=")
        if (eqIdx > 0) {
          acc[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim()
        }
        return acc
      }, {})
    : undefined

  return {
    name: form.name.trim(),
    scope: form.scope,
    type: form.type,
    command: form.type === "stdio" ? form.command.trim() || undefined : undefined,
    args: form.type === "stdio" && form.args.trim()
      ? form.args.trim().split(/\s+/)
      : undefined,
    url: form.type !== "stdio" ? form.url.trim() || undefined : undefined,
    env: envEntries && Object.keys(envEntries).length > 0 ? envEntries : undefined,
  }
}

function McpServerFormDialog({
  open,
  provider,
  editingServer,
  onClose,
  onSave,
}: {
  open: boolean
  provider: ProviderId
  editingServer: McpServerInfo | null
  onClose: () => void
  onSave: (server: McpServerInfo, originalName?: string) => void
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      const nextForm = editingServer ? serverToFormState(editingServer) : EMPTY_FORM
      setForm(provider === "codex" ? { ...nextForm, scope: "user" } : nextForm)
      setError(null)
    }
  }, [editingServer, open, provider])

  const isEdit = Boolean(editingServer)
  const nameValid = form.name.trim().length > 0
  const transportValid = form.type === "stdio"
    ? form.command.trim().length > 0
    : form.url.trim().length > 0

  const canSubmit = nameValid && transportValid && !saving

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    try {
      onSave(formStateToServer(form), isEdit ? editingServer!.name : undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit MCP Server" : "Add MCP Server"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modify the server configuration."
              : "Configure a new MCP server connection."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Name */}
          <div className="space-y-1">
            <Label htmlFor="mcp-name" className="ui-meta-text text-muted-foreground">Name</Label>
            <Input
              id="mcp-name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="e.g. exa, github, notion"
              className="h-control-sm"
              disabled={isEdit}
            />
          </div>

          {/* Transport type */}
          <div className="space-y-1">
            <Label className="ui-meta-text text-muted-foreground">Transport</Label>
            <Select value={form.type} onValueChange={(v) => update("type", v as McpTransportType)}>
              <SelectTrigger className="h-control-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stdio">stdio (command)</SelectItem>
                <SelectItem value="http">HTTP (streamable)</SelectItem>
                <SelectItem value="sse">SSE (legacy)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* stdio fields */}
          {form.type === "stdio" && (
            <>
              <div className="space-y-1">
                <Label htmlFor="mcp-command" className="ui-meta-text text-muted-foreground">Command</Label>
                <Input
                  id="mcp-command"
                  value={form.command}
                  onChange={(e) => update("command", e.target.value)}
                  placeholder="e.g. npx, uvx, node"
                  className="h-control-sm font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mcp-args" className="ui-meta-text text-muted-foreground">Arguments (space-separated)</Label>
                <Input
                  id="mcp-args"
                  value={form.args}
                  onChange={(e) => update("args", e.target.value)}
                  placeholder="e.g. -y @anthropic/mcp-server-exa"
                  className="h-control-sm font-mono"
                />
              </div>
            </>
          )}

          {/* http/sse fields */}
          {form.type !== "stdio" && (
            <div className="space-y-1">
              <Label htmlFor="mcp-url" className="ui-meta-text text-muted-foreground">URL</Label>
              <Input
                id="mcp-url"
                value={form.url}
                onChange={(e) => update("url", e.target.value)}
                placeholder="e.g. http://localhost:3001/mcp"
                className="h-control-sm font-mono"
              />
            </div>
          )}

          {/* Env vars */}
          <div className="space-y-1">
            <Label htmlFor="mcp-env" className="ui-meta-text text-muted-foreground">
              Environment variables (one per line, KEY=VALUE)
            </Label>
            <textarea
              id="mcp-env"
              value={form.env}
              onChange={(e) => update("env", e.target.value)}
              placeholder={"EXA_API_KEY=your-key\nOTHER_VAR=value"}
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-body-sm font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Scope (only for new servers) */}
          {!isEdit && provider !== "codex" && (
            <div className="space-y-1">
              <Label className="ui-meta-text text-muted-foreground">Scope</Label>
              <Select value={form.scope} onValueChange={(v) => update("scope", v as McpServerScope)}>
                <SelectTrigger className="h-control-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local (.mcp.json — in project root)</SelectItem>
                  <SelectItem value="project">Project (~/.claude.json — per-project)</SelectItem>
                  <SelectItem value="user">User (~/.claude.json — global)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {!isEdit && provider === "codex" && (
            <div className="rounded-md border border-status-warning/30 bg-status-warning/10 px-3 py-2">
              <p className="text-body-sm text-status-warning">
                Codex stores MCP servers in global CLI config only.
              </p>
              <p className="ui-meta-text text-muted-foreground mt-1">
                Project and local `.mcp.json` servers still flow into Codex execution through runtime config injection, but they do not appear here as separate scoped entries.
              </p>
            </div>
          )}

          {error && (
            <p className="text-body-sm text-status-danger">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? "Save" : "Add Server"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Collapsible Group ────────────────────────────────────

const COLLAPSED_LIMIT = 4

function ServerGroupSection({
  group,
  provider,
  onEdit,
  onRemove,
  onRefresh,
}: {
  group: ServerGroup
  provider: ProviderId
  onEdit: (server: McpServerInfo) => void
  onRemove: (server: McpServerInfo) => void
  onRefresh: () => void
}) {
  const [groupOpen, setGroupOpen] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const visible = showAll ? group.servers : group.servers.slice(0, COLLAPSED_LIMIT)
  const hiddenCount = group.servers.length - COLLAPSED_LIMIT

  return (
    <div className="space-y-0.5">
      <button
        onClick={() => setGroupOpen(!groupOpen)}
        className="flex items-center gap-1.5 w-full text-left"
      >
        {groupOpen ? <ChevronDown size={12} className="text-muted-foreground" /> : <ChevronRight size={12} className="text-muted-foreground" />}
        <span className="section-kicker">{group.label}</span>
        <Badge variant="outline" className="text-[10px] text-muted-foreground">{group.servers.length}</Badge>
        {group.projectPath && (
          <span className="ui-meta-text text-muted-foreground truncate max-w-[250px] ml-1">{group.projectPath}</span>
        )}
      </button>

      {groupOpen && (
        <div className="pl-1">
          {visible.map((server) => (
            <McpServerRow
              key={`${server.scope}:${server.projectPath || ""}:${server.name}`}
              server={server}
              provider={provider}
              onEdit={onEdit}
              onRemove={onRemove}
              onRefresh={onRefresh}
            />
          ))}
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="ui-meta-text text-muted-foreground hover:text-foreground py-1 pl-7"
            >
              {showAll ? "Show less" : `Show ${hiddenCount} more...`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Section ────────────────────────────────────────

interface ServerGroup {
  label: string
  projectPath?: string
  servers: McpServerInfo[]
}

export function McpServersSection({ provider = "claude" }: { provider?: ProviderId }) {
  const [servers, setServers] = useAtom(mcpServersAtom)
  const [loading, setLoading] = useAtom(mcpServersLoadingAtom)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<McpServerInfo | null>(null)

  const refreshServers = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.api.mcpListAllServers(provider)
      setServers(result)
    } finally {
      setLoading(false)
    }
  }, [provider, setServers, setLoading])

  useEffect(() => {
    void refreshServers()
  }, [refreshServers])

  const groups = useMemo<ServerGroup[]>(() => {
    const userServers = servers.filter((s) => s.scope === "user")
    const projectServers = servers.filter((s) => s.scope === "project")

    // Group project-scoped servers by projectPath
    const byProject = new Map<string, McpServerInfo[]>()
    for (const s of projectServers) {
      const key = s.projectPath || "unknown"
      const list = byProject.get(key)
      if (list) list.push(s)
      else byProject.set(key, [s])
    }

    const result: ServerGroup[] = []

    if (userServers.length > 0) {
      result.push({ label: "Global", servers: userServers })
    }

    for (const [projectPath, items] of byProject) {
      const folderName = projectPath.split("/").pop() || projectPath
      result.push({ label: folderName, projectPath, servers: items })
    }

    return result
  }, [servers])

  const handleAdd = () => {
    setEditingServer(null)
    setDialogOpen(true)
  }

  const handleEdit = (server: McpServerInfo) => {
    setEditingServer(server)
    setDialogOpen(true)
  }

  const handleRemove = async (server: McpServerInfo) => {
    await window.api.mcpRemoveServer(provider, server.name, server.scope, server.projectPath)
    void refreshServers()
  }

  const handleSave = async (server: McpServerInfo, originalName?: string) => {
    let result: { success: boolean; error?: string }
    if (originalName) {
      result = await window.api.mcpUpdateServer(provider, originalName, server, server.projectPath)
    } else {
      result = await window.api.mcpAddServer(provider, server, server.projectPath)
    }
    if (!result.success) {
      throw new Error(result.error || "Operation failed")
    }
    setDialogOpen(false)
    void refreshServers()
  }

  const hasServers = servers.length > 0

  return (
    <section className="space-y-3">
      <SectionHeading
        title="MCP Servers"
        meta={
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={handleAdd}>
              <Plus size={14} />
              Add Server
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refreshServers()}
              disabled={loading}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh
            </Button>
          </div>
        }
      />

      {provider === "codex" && (
        <article className="rounded-lg border border-status-warning/20 bg-status-warning/10 px-4 py-3">
          <p className="text-body-sm text-status-warning">
            This panel shows only Codex global MCP servers.
          </p>
          <p className="ui-meta-text text-muted-foreground mt-1">
            Project and local `.mcp.json` servers are still injected into Codex runs through provider runtime args.
          </p>
        </article>
      )}

      {!hasServers && !loading && (
        <article className="rounded-lg surface-panel p-6">
          <div className="ui-empty-state">
            <Server size={24} className="text-muted-foreground/60" />
            <p className="text-body-sm text-muted-foreground mt-2">
              No MCP servers configured. Add a server to extend the active provider with external tools.
            </p>
            <p className="ui-meta-text text-muted-foreground mt-1">
              Viewing {PROVIDER_LABELS[provider]} servers.
            </p>
          </div>
        </article>
      )}

      {loading && !hasServers && (
        <article className="rounded-lg surface-panel p-6 flex items-center justify-center gap-2">
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
          <span className="text-body-sm text-muted-foreground">Loading servers...</span>
        </article>
      )}

      {hasServers && (
        <div className="rounded-lg surface-panel p-3 space-y-2">
          {groups.map((group) => (
            <ServerGroupSection
              key={group.label + (group.projectPath || "")}
              group={group}
              provider={provider}
              onEdit={handleEdit}
              onRemove={handleRemove}
              onRefresh={refreshServers}
            />
          ))}
        </div>
      )}

      <McpServerFormDialog
        open={dialogOpen}
        provider={provider}
        editingServer={editingServer}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
      />
    </section>
  )
}
