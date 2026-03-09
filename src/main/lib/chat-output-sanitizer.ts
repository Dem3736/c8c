export interface AssistantTurn {
  text: string
  hasToolCalls: boolean
}

const TOOL_CALL_JSON_BLOCK_RE = /```(?:json)?\s*\n?\s*\{[\s\S]*?"tool"\s*:\s*"[^"]+"[\s\S]*?\}\s*\n?```/gi
const TOOL_RESULTS_BLOCK_RE = /<tool_results>[\s\S]*?<\/tool_results>/gi
const TOOL_RESPONSE_BLOCK_RE = /<tool_response\b[^>]*>[\s\S]*?<\/tool_response>/gi
const THINKING_BLOCK_RE = /<thinking>[\s\S]*?<\/thinking>/gi
const RESULT_BLOCK_RE = /<result\b[^>]*>[\s\S]*?<\/result>/gi
const INTERNAL_TAG_RE = /<\/?(?:tool_results|tool_response|thinking|result)\b[^>]*>/gi

export function sanitizeAssistantText(text: string): string {
  return text
    .replace(TOOL_CALL_JSON_BLOCK_RE, "")
    .replace(TOOL_RESULTS_BLOCK_RE, "")
    .replace(TOOL_RESPONSE_BLOCK_RE, "")
    .replace(THINKING_BLOCK_RE, "")
    .replace(RESULT_BLOCK_RE, "")
    .replace(INTERNAL_TAG_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function selectAssistantTurnText(turns: AssistantTurn[]): string {
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]
    if (!turn.hasToolCalls && turn.text.trim()) {
      return turn.text
    }
  }

  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]
    if (turn.text.trim()) {
      return turn.text
    }
  }

  return ""
}
