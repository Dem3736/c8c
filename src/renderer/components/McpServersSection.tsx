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
import type { McpServerInfo, McpServerScope, McpTransportType, McpTestResult } from "@shared/types"
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

// ── Server Card ─────────────────────────────────────────

function TransportBadge({ type }: { type: McpTransportType }) {
  return (
    <Badge variant="outline" className="text-[10px] font-medium uppercase tracking-wide">
      {type}
    </Badge>
  )
}

function ScopeBadge({ scope }: { scope: McpServerScope }) {
  const styles: Record<McpServerScope, string> = {
    local: "text-[10px] border-status-success/30 text-status-success bg-status-success/10",
    project: "text-[10px] border-status-info/30 text-status-info bg-status-info/10",
    user: "text-[10px] border-muted-foreground/30 text-muted-foreground",
  }
  return (
    <Badge variant="outline" className={styles[scope]}>
      {scope}
    </Badge>
  )
}

interface ServerTestState {
  loading: boolean
  result: McpTestResult | null
}

function McpServerCard({
  server,
  onEdit,
  onRemove,
  onRefresh,
}: {
  server: McpServerInfo
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

  const transportDetail = server.type === "stdio"
    ? [server.command, ...(server.args || [])].filter(Boolean).join(" ")
    : server.url || ""

  return (
    <article className="rounded-lg surface-panel p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Server size={14} className="text-muted-foreground shrink-0" />
          <span className="text-body-md font-semibold truncate">{server.name}</span>
          <TransportBadge type={server.type} />
          <ScopeBadge scope={server.scope} />
          {server.disabled && (
            <Badge variant="outline" className="text-[10px] border-status-warning/30 text-status-warning bg-status-warning/10">
              disabled
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Switch
            checked={!server.disabled}
            disabled={toggling}
            aria-label={`Toggle ${server.name}`}
            onCheckedChange={handleToggle}
          />
          <Button variant="ghost" size="sm" onClick={handleTest} disabled={testState.loading}>
            {testState.loading ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
            Test
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onEdit(server)}>
            <Pencil size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onRemove(server)}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {/* Transport detail (collapsible) */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 ui-meta-text text-muted-foreground hover:text-foreground"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="truncate max-w-[400px]">{transportDetail || "No transport configured"}</span>
      </button>

      {expanded && (
        <div className="pl-4 space-y-1 ui-meta-text text-muted-foreground">
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
      )}

      {/* Test result */}
      {testState.result && (
        <div className="pl-4 space-y-1">
          {testState.result.healthy ? (
            <div className="flex items-center gap-1.5">
              <Check size={14} className="text-status-success" />
              <span className="text-body-sm text-status-success">
                Healthy ({testState.result.tools.length} tool{testState.result.tools.length !== 1 ? "s" : ""})
              </span>
              <span className="ui-meta-text text-muted-foreground ml-1">{testState.result.latencyMs}ms</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <AlertCircle size={14} className="text-status-danger" />
              <span className="text-body-sm text-status-danger">
                {testState.result.error || "Connection failed"}
              </span>
            </div>
          )}

          {testState.result.healthy && testState.result.tools.length > 0 && (
            <div className="space-y-0.5 mt-1">
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
    </article>
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
  editingServer,
  onClose,
  onSave,
}: {
  open: boolean
  editingServer: McpServerInfo | null
  onClose: () => void
  onSave: (server: McpServerInfo, originalName?: string) => void
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(editingServer ? serverToFormState(editingServer) : EMPTY_FORM)
      setError(null)
    }
  }, [open, editingServer])

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
          {!isEdit && (
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

// ── Main Section ────────────────────────────────────────

interface ServerGroup {
  label: string
  projectPath?: string
  servers: McpServerInfo[]
}

export function McpServersSection() {
  const [servers, setServers] = useAtom(mcpServersAtom)
  const [loading, setLoading] = useAtom(mcpServersLoadingAtom)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<McpServerInfo | null>(null)

  const refreshServers = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.api.mcpListAllServers()
      setServers(result)
    } finally {
      setLoading(false)
    }
  }, [setServers, setLoading])

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
    await window.api.mcpRemoveServer(server.name, server.scope, server.projectPath)
    void refreshServers()
  }

  const handleSave = async (server: McpServerInfo, originalName?: string) => {
    let result: { success: boolean; error?: string }
    if (originalName) {
      result = await window.api.mcpUpdateServer(originalName, server, server.projectPath)
    } else {
      result = await window.api.mcpAddServer(server, server.projectPath)
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

      {!hasServers && !loading && (
        <article className="rounded-lg surface-panel p-6">
          <div className="ui-empty-state">
            <Server size={24} className="text-muted-foreground/60" />
            <p className="text-body-sm text-muted-foreground mt-2">
              No MCP servers configured. Add a server to extend Claude's capabilities with external tools.
            </p>
            <p className="ui-meta-text text-muted-foreground mt-1">
              Servers are read from <code className="inline-code">~/.claude.json</code> per-project and <code className="inline-code">~/.claude.json</code> global.
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

      {groups.map((group) => (
        <div key={group.label + (group.projectPath || "")} className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="section-kicker">{group.label}</p>
            {group.projectPath && (
              <span className="ui-meta-text text-muted-foreground truncate max-w-[300px]">{group.projectPath}</span>
            )}
          </div>
          {group.servers.map((server) => (
            <McpServerCard
              key={`${server.scope}:${server.projectPath || ""}:${server.name}`}
              server={server}
              onEdit={handleEdit}
              onRemove={handleRemove}
              onRefresh={refreshServers}
            />
          ))}
        </div>
      ))}

      <McpServerFormDialog
        open={dialogOpen}
        editingServer={editingServer}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
      />
    </section>
  )
}
