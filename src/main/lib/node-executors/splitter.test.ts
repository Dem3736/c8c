import { describe, it, expect } from "vitest"
import {
  buildSplitterPrompt,
  parseSplitterOutput,
  shouldRetrySplitter,
  buildSplitterRecoveryPrompt,
  heuristicSplitInput,
} from "./splitter"

describe("parseSplitterOutput", () => {
  it("parses JSON array of subtasks", () => {
    const output = JSON.stringify([
      { key: "hero", content: "Improve the hero section copy" },
      { key: "features", content: "Rewrite features for clarity" },
      { key: "pricing", content: "Optimize pricing comparison" },
    ])

    const result = parseSplitterOutput(output)
    expect(result).toHaveLength(3)
    expect(result[0].key).toBe("hero")
    expect(result[0].content).toBe("Improve the hero section copy")
  })

  it("extracts JSON from markdown code block", () => {
    const output = `Here are the subtasks:

\`\`\`json
[
  {"key": "intro", "content": "Fix intro paragraph"},
  {"key": "body", "content": "Improve body section"}
]
\`\`\`

Let me know if you need changes.`

    const result = parseSplitterOutput(output)
    expect(result).toHaveLength(2)
    expect(result[0].key).toBe("intro")
  })

  it("handles subtasks with only content (auto-generates keys)", () => {
    const output = JSON.stringify([
      { content: "Task one" },
      { content: "Task two" },
    ])

    const result = parseSplitterOutput(output)
    expect(result).toHaveLength(2)
    expect(result[0].key).toBe("subtask-0")
    expect(result[1].key).toBe("subtask-1")
  })

  it("handles string array (each string becomes a subtask)", () => {
    const output = JSON.stringify([
      "Improve hero section",
      "Rewrite features",
      "Fix pricing table",
    ])

    const result = parseSplitterOutput(output)
    expect(result).toHaveLength(3)
    expect(result[0].content).toBe("Improve hero section")
    expect(result[0].key).toBe("subtask-0")
  })

  it("returns single subtask for unparseable output", () => {
    const result = parseSplitterOutput("I couldn't decompose this task")
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe("subtask-0")
    expect(result[0].content).toContain("couldn't decompose")
  })
})

describe("shouldRetrySplitter", () => {
  it("retries when single subtask content is empty", () => {
    const input = "1. Analyze onboarding\n2. Analyze checkout\n3. Analyze settings"
    const subtasks = [{ key: "subtask-0", content: "" }]
    expect(shouldRetrySplitter(subtasks, '[{"key":"subtask-0","content":""}]', input, 5)).toBe(true)
  })

  it("detects instruction-echo output as invalid split", () => {
    const input = "Research RAG best practices and split into independent aspects."
    const subtasks = [
      {
        key: "subtask-0",
        content: "You are a task decomposer. Return ONLY a JSON array. Create 4-6 independent research aspects.",
      },
    ]

    expect(shouldRetrySplitter(subtasks, subtasks[0].content, input)).toBe(true)
  })

  it("does not retry for a normal single unsplittable task", () => {
    const input = "Summarize this short note."
    const subtasks = [{ key: "summary", content: "Summarize this short note with key conclusions." }]
    expect(shouldRetrySplitter(subtasks, subtasks[0].content, input)).toBe(false)
  })

  it("retries when output is under target branch count for markdown tables", () => {
    const input = `| Component | Type | Description |
|---|---|---|
| Chat IPC Handler | IPC | Handles chat |
| Executor IPC Handler | IPC | Handles execution |
| Projects IPC Handler | IPC | Handles projects |
| Skills IPC Handler | IPC | Handles skills |`
    const subtasks = [
      { key: "ipc", content: "Review IPC handlers as one group" },
      { key: "ui", content: "Review renderer components as one group" },
    ]
    expect(shouldRetrySplitter(subtasks, JSON.stringify(subtasks), input, 4)).toBe(true)
  })
})

describe("buildSplitterPrompt", () => {
  it("includes target branch count guidance", () => {
    const prompt = buildSplitterPrompt("Split by components", "Input body", 20)
    expect(prompt).toContain("Return between 1 and 20 subtasks")
    expect(prompt).toContain("return exactly 20 subtasks")
  })
})

describe("buildSplitterRecoveryPrompt", () => {
  it("includes hard output constraints and max branch bounds", () => {
    const prompt = buildSplitterRecoveryPrompt("Split by entities", "Input body", 6)
    expect(prompt).toContain("Return a JSON array with 2-6 objects")
    expect(prompt).toContain("Do NOT echo instructions")
    expect(prompt).toContain("Split by entities")
  })
})

describe("heuristicSplitInput", () => {
  it("splits embedded JSON array items into multiple subtasks", () => {
    const input = `Research each company independently.

[
  {"domain":"a.com","name":"Company A","description":"Alpha"},
  {"domain":"b.com","name":"Company B","description":"Beta"}
]`

    const subtasks = heuristicSplitInput(input, 8)
    expect(subtasks.length).toBeGreaterThan(1)
    expect(subtasks.some((s) => s.key === "a-com")).toBe(true)
    expect(subtasks.some((s) => s.key === "b-com")).toBe(true)
  })

  it("splits markdown lists into separate subtasks", () => {
    const input = `Scenarios:

- Onboarding: add first project
- Build workflow in canvas
- Run and inspect logs
- Review run history`

    const subtasks = heuristicSplitInput(input, 5)
    expect(subtasks.length).toBeGreaterThan(1)
    expect(subtasks[0].content.toLowerCase()).toContain("onboarding")
  })

  it("splits markdown table rows and respects maxBranches above 8", () => {
    const input = `| Component | Type | Description |
|---|---|---|
| item-1 | UI | desc |
| item-2 | UI | desc |
| item-3 | UI | desc |
| item-4 | UI | desc |
| item-5 | UI | desc |
| item-6 | UI | desc |
| item-7 | UI | desc |
| item-8 | UI | desc |
| item-9 | UI | desc |
| item-10 | UI | desc |
| item-11 | UI | desc |
| item-12 | UI | desc |`

    const subtasks = heuristicSplitInput(input, 10)
    expect(subtasks).toHaveLength(10)
    expect(subtasks[0]?.content).toContain("item-1")
    expect(subtasks[9]?.content).toContain("item-10")
  })
})
