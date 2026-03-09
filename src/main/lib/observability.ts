import { createHash } from "node:crypto"
import type { NodeMetrics, NodeMeta, ErrorKind } from "@shared/types"
import type { LogParser } from "./log-parser"

/** Classify an error into a category for diagnostics */
export function classifyError(err: unknown, timedOut: boolean): ErrorKind {
  if (timedOut) return "timeout"

  const msg = String(err).toLowerCase()

  // Tool/skill errors: CLI subprocess failure, tool_result errors, file not found
  if (
    msg.includes("exit code") ||
    msg.includes("enoent") ||
    msg.includes("skill") ||
    msg.includes("command not found") ||
    msg.includes("spawn")
  ) {
    return "tool"
  }

  // Model errors: empty output, parse failures, hallucination indicators
  if (
    msg.includes("unparseable") ||
    msg.includes("empty output") ||
    msg.includes("could not parse") ||
    msg.includes("json")
  ) {
    return "model"
  }

  // Policy errors: budget, rate limit
  if (
    msg.includes("budget") ||
    msg.includes("rate limit") ||
    msg.includes("policy")
  ) {
    return "policy"
  }

  return "unknown"
}

// Approximate pricing per 1M tokens (USD) — updated as of 2026-03
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  sonnet: { input: 3, output: 15 },
  opus: { input: 15, output: 75 },
  haiku: { input: 0.25, output: 1.25 },
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING.sonnet
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
}

export function collectMetrics(logParser: LogParser, startedAt: number): NodeMetrics {
  const usage = logParser.usage
  return {
    tokens_in: usage.input_tokens,
    tokens_out: usage.output_tokens,
    cost_usd: 0, // caller sets this with model info
    latency_ms: Date.now() - startedAt,
  }
}

export function buildNodeMeta(prompt: string, model: string, skillRef?: string): NodeMeta {
  return {
    model_id: model,
    prompt_hash: createHash("sha256").update(prompt).digest("hex").slice(0, 16),
    ...(skillRef ? { skill_ref: skillRef } : {}),
  }
}
