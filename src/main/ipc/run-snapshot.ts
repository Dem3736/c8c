import { open, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import type { LogEntry, NodeState, PersistedRunSnapshot, WorkflowEvent } from "@shared/types"
import { logWarn } from "../lib/structured-log"

const MAX_PERSISTED_EVENTS_BYTES = 5 * 1024 * 1024

interface PersistedEventsTail {
  raw: string
  truncated: boolean
}

function isNodeLogEvent(event: WorkflowEvent): event is Extract<WorkflowEvent, { type: "node-log" }> {
  return event.type === "node-log"
}

export function parsePersistedNodeLogs(raw: string, truncated = false): Record<string, LogEntry[]> {
  const logsByNodeId: Record<string, LogEntry[]> = {}
  const lines = raw.split("\n")
  if (truncated && lines.length > 0) {
    lines.shift()
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let event: WorkflowEvent
    try {
      event = JSON.parse(trimmed) as WorkflowEvent
    } catch {
      continue
    }

    if (!isNodeLogEvent(event)) continue

    const existing = logsByNodeId[event.nodeId] || []
    existing.push(event.entry)
    logsByNodeId[event.nodeId] = existing
  }

  return logsByNodeId
}

export function mergeNodeLogsIntoSnapshot(
  snapshot: PersistedRunSnapshot,
  nodeLogsById: Record<string, LogEntry[]>,
): PersistedRunSnapshot {
  const nextNodeStates: Record<string, NodeState> = { ...snapshot.nodeStates }
  const nodeIds = new Set([
    ...Object.keys(nextNodeStates),
    ...Object.keys(nodeLogsById),
  ])

  for (const nodeId of nodeIds) {
    const logs = nodeLogsById[nodeId] || []
    const existing = nextNodeStates[nodeId]
    if (existing) {
      nextNodeStates[nodeId] = {
        ...existing,
        log: logs,
      }
      continue
    }

    nextNodeStates[nodeId] = {
      status: "pending",
      attempts: 0,
      log: logs,
    }
  }

  return {
    ...snapshot,
    nodeStates: nextNodeStates,
  }
}

export async function readPersistedEventsTail(workspace: string): Promise<PersistedEventsTail | null> {
  const eventsPath = join(workspace, "events.jsonl")
  const info = await stat(eventsPath)
  if (info.size <= MAX_PERSISTED_EVENTS_BYTES) {
    return {
      raw: await readFile(eventsPath, "utf-8"),
      truncated: false,
    }
  }

  const retainedBytes = Math.min(info.size, MAX_PERSISTED_EVENTS_BYTES)
  const readOffset = Math.max(0, info.size - retainedBytes)
  const buffer = Buffer.alloc(retainedBytes)
  const handle = await open(eventsPath, "r")
  try {
    await handle.read(buffer, 0, retainedBytes, readOffset)
  } finally {
    await handle.close()
  }

  logWarn("run-snapshot-ipc", "events_tail_truncated", {
    workspace,
    size: info.size,
    retainedBytes,
  })

  return {
    raw: buffer.toString("utf-8"),
    truncated: true,
  }
}

export async function loadPersistedNodeLogs(workspace: string): Promise<Record<string, LogEntry[]>> {
  try {
    const persistedEvents = await readPersistedEventsTail(workspace)
    if (!persistedEvents) return {}
    return parsePersistedNodeLogs(persistedEvents.raw, persistedEvents.truncated)
  } catch (error) {
    if (
      typeof error === "object"
      && error !== null
      && "code" in error
      && String((error as { code?: unknown }).code) === "ENOENT"
    ) {
      return {}
    }
    logWarn("run-snapshot-ipc", "load_persisted_node_logs_failed", {
      workspace,
      error: error instanceof Error ? error.message : String(error),
    })
    return {}
  }
}

export async function hydratePersistedRunSnapshotLogs(
  workspace: string,
  snapshot: PersistedRunSnapshot,
): Promise<PersistedRunSnapshot> {
  const nodeLogsById = await loadPersistedNodeLogs(workspace)
  return mergeNodeLogsIntoSnapshot(snapshot, nodeLogsById)
}
