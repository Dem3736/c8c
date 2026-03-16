import { describe, expect, it } from "vitest"
import type { PersistedRunSnapshot } from "@shared/types"
import { mergeNodeLogsIntoSnapshot, parsePersistedNodeLogs } from "./run-snapshot"

describe("run snapshot log hydration", () => {
  it("parses node logs from persisted workflow events", () => {
    const logs = parsePersistedNodeLogs([
      JSON.stringify({
        type: "node-start",
        runId: "run-1",
        nodeId: "audit",
      }),
      JSON.stringify({
        type: "node-log",
        runId: "run-1",
        nodeId: "audit",
        entry: { type: "text", content: "hello", timestamp: 10 },
      }),
      JSON.stringify({
        type: "node-log",
        runId: "run-1",
        nodeId: "audit",
        entry: { type: "thinking", content: "world", timestamp: 11 },
      }),
    ].join("\n"))

    expect(logs).toEqual({
      audit: [
        { type: "text", content: "hello", timestamp: 10 },
        { type: "thinking", content: "world", timestamp: 11 },
      ],
    })
  })

  it("merges hydrated logs into persisted node states", () => {
    const snapshot: PersistedRunSnapshot = {
      nodeStates: {
        audit: {
          status: "running",
          attempts: 1,
          log: [],
        },
      },
      runtimeNodes: [],
      runtimeEdges: [],
      runtimeMeta: {},
      evalResults: {},
    }

    const hydrated = mergeNodeLogsIntoSnapshot(snapshot, {
      audit: [{ type: "text", content: "streamed", timestamp: 20 }],
      normalize: [{ type: "text", content: "late branch", timestamp: 30 }],
    })

    expect(hydrated.nodeStates.audit.log).toEqual([
      { type: "text", content: "streamed", timestamp: 20 },
    ])
    expect(hydrated.nodeStates.normalize).toEqual({
      status: "pending",
      attempts: 0,
      log: [{ type: "text", content: "late branch", timestamp: 30 }],
    })
  })
})
