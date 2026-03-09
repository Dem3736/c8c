import { describe, expect, it } from "vitest"
import {
  sanitizeAssistantText,
  selectAssistantTurnText,
  type AssistantTurn,
} from "./chat-output-sanitizer"

describe("sanitizeAssistantText", () => {
  it("removes internal tool/result tags from assistant output", () => {
    const raw = `Сначала поищу навыки.

<tool_results>
<result call_id="s1">Found skills</result>
</tool_results>
</thinking>

Готово.`

    const cleaned = sanitizeAssistantText(raw)
    expect(cleaned).toBe("Сначала поищу навыки.\n\nГотово.")
  })

  it("removes fenced JSON tool calls", () => {
    const raw = `Добавляю узел.
\`\`\`json
{"tool":"add_node","call_id":"n1","input":{"node":{"type":"skill"}}}
\`\`\`
Проверяю.`

    const cleaned = sanitizeAssistantText(raw)
    expect(cleaned).toBe("Добавляю узел.\n\nПроверяю.")
  })

  it("removes tool_response xml blocks", () => {
    const raw = `Делаю шаг.
<tool_response call_id="a1">Added node</tool_response>
Готово.`

    const cleaned = sanitizeAssistantText(raw)
    expect(cleaned).toBe("Делаю шаг.\n\nГотово.")
  })
})

describe("selectAssistantTurnText", () => {
  it("prefers the latest turn without tool calls", () => {
    const turns: AssistantTurn[] = [
      { text: "Промежуточный статус", hasToolCalls: true },
      { text: "Финальный ответ", hasToolCalls: false },
    ]

    expect(selectAssistantTurnText(turns)).toBe("Финальный ответ")
  })

  it("falls back to the latest non-empty turn when all turns have tool calls", () => {
    const turns: AssistantTurn[] = [
      { text: " ", hasToolCalls: true },
      { text: "Только промежуточный ответ", hasToolCalls: true },
    ]

    expect(selectAssistantTurnText(turns)).toBe("Только промежуточный ответ")
  })
})
