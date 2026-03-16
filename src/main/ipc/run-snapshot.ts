import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { LogEntry, NodeState, PersistedRunSnapshot, WorkflowEvent } from "@shared/types"

function isNodeLogEvent(event: WorkflowEvent): event is Extract<WorkflowEvent, { type: "node-log" }> {
  return event.type === "node-log"
}

export function parsePersistedNodeLogs(raw: string): Record<string, LogEntry[]> {
  const logsByNodeId: Record<string, LogEntry[]> = {}

  for (const line of raw.split("\n")) {
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

export async function loadPersistedNodeLogs(workspace: string): Promise<Record<string, LogEntry[]>> {
  try {
    const raw = await readFile(join(workspace, "events.jsonl"), "utf-8")
    return parsePersistedNodeLogs(raw)
  } catch {
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
