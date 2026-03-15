import { beforeEach, describe, expect, it, vi } from "vitest"

const { createACPProviderMock, cleanupMock, getSessionIdMock, languageModelMock, streamTextMock } = vi.hoisted(() => ({
  createACPProviderMock: vi.fn(),
  cleanupMock: vi.fn(),
  getSessionIdMock: vi.fn(() => "codex-session-1"),
  languageModelMock: vi.fn(() => ({ modelId: "gpt-5-codex" })),
  streamTextMock: vi.fn(),
}))

vi.mock("@mcpc-tech/acp-ai-provider", () => ({
  ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME: "acp.acp_provider_agent_dynamic_tool",
  createACPProvider: createACPProviderMock,
}))

vi.mock("ai", () => ({
  streamText: streamTextMock,
}))

vi.mock("./provider-settings", () => ({
  getProviderSettings: vi.fn(async () => ({
    defaultProvider: "claude",
    safetyProfile: "workspace_auto",
    features: { codexProvider: true },
  })),
  getCodexApiKey: vi.fn(async () => undefined),
}))

vi.mock("./codex-cli", () => ({
  buildCodexEnv: vi.fn(async () => ({ PATH: process.env.PATH || "" })),
}))

import { drainExecutionHandle } from "./agent-execution"
import {
  canUseCodexAcpExecution,
  createCodexAcpExecutionHandle,
} from "./codex-acp-runtime"

describe("canUseCodexAcpExecution", () => {
  it("rejects additional directories because ACP sessions cannot express them", () => {
    expect(canUseCodexAcpExecution({
      addDirs: ["/tmp/extra"],
      executionMode: "edit",
    }, "workspace_auto")).toEqual({
      supported: false,
      reason: "additional directories are not supported by ACP sessions",
    })
  })

  it("rejects unsupported safety profiles", () => {
    expect(canUseCodexAcpExecution({
      executionMode: "edit",
      safetyProfile: "dangerous",
    }, "workspace_auto")).toEqual({
      supported: false,
      reason: "unsupported safety profile dangerous",
    })
  })
})

describe("createCodexAcpExecutionHandle", () => {
  beforeEach(() => {
    cleanupMock.mockReset()
    getSessionIdMock.mockClear()
    languageModelMock.mockClear()
    createACPProviderMock.mockReset()
    streamTextMock.mockReset()

    createACPProviderMock.mockReturnValue({
      cleanup: cleanupMock,
      getSessionId: getSessionIdMock,
      languageModel: languageModelMock,
      tools: {},
    })
  })

  it("maps ACP stream parts into the shared execution handle", async () => {
    streamTextMock.mockReturnValue({
      fullStream: (async function *() {
        yield { type: "text-delta", text: "Hello from ACP", id: "text-1" }
        yield { type: "reasoning-delta", text: "Thinking", id: "think-1" }
        yield {
          type: "tool-call",
          toolCallId: "tool-1",
          toolName: "acp.acp_provider_agent_dynamic_tool",
          input: {
            toolName: "Read file.txt",
            args: {},
          },
        }
        yield {
          type: "tool-result",
          toolCallId: "tool-1",
          output: { ok: true },
        }
        yield {
          type: "finish-step",
          usage: {
            inputTokens: 3,
            outputTokens: 4,
          },
        }
        yield {
          type: "finish",
          finishReason: "stop",
          totalUsage: {
            inputTokens: 3,
            outputTokens: 4,
          },
        }
      })(),
      totalUsage: Promise.resolve({
        inputTokens: 3,
        outputTokens: 4,
      }),
      finishReason: Promise.resolve("stop"),
    })

    const handle = await createCodexAcpExecutionHandle({
      workdir: "/tmp/project",
      prompt: "Inspect the file",
      model: "gpt-5-codex",
    })

    const entries: Array<{ type: string; content?: string; tool?: string; input?: unknown; output?: string }> = []
    const usages: Array<{ inputTokens: number; outputTokens: number }> = []
    const summary = await drainExecutionHandle(handle, {
      onLogEntry: (entry) => {
        entries.push(entry as any)
      },
      onUsage: (usage) => {
        usages.push(usage)
      },
    })

    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "text", content: "Hello from ACP" }),
      expect.objectContaining({ type: "thinking", content: "Thinking" }),
      expect.objectContaining({ type: "tool_use", tool: "Read", input: { file_path: "file.txt" } }),
      expect.objectContaining({ type: "tool_result", tool: "Read", output: JSON.stringify({ ok: true }) }),
    ]))
    expect(usages.at(-1)).toEqual({ inputTokens: 3, outputTokens: 4 })
    expect(summary).toMatchObject({
      success: true,
      exitCode: 0,
      providerSessionId: "codex-session-1",
      backend: "codex_acp",
    })
    expect(languageModelMock).toHaveBeenCalledWith("gpt-5-codex", undefined)
    expect(cleanupMock).toHaveBeenCalled()
  })
})
