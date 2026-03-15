import { describe, expect, it } from "vitest"
import {
  isCodexInteractiveEditorNoise,
  isCodexHeadlessAuthCheckError,
  parseCodexAuth,
  sanitizeCodexAuthError,
  summarizeCodexInteractiveEditorNoise,
} from "./providers"

describe("providers codex auth parsing", () => {
  it("detects ChatGPT subscription auth", () => {
    expect(parseCodexAuth("Logged in using ChatGPT", false)).toMatchObject({
      state: "authenticated",
      authenticated: true,
      authMethod: "chatgpt",
      accountLabel: "ChatGPT",
    })
  })

  it("recognizes non-interactive raw-mode login status failures", () => {
    const output = "Sign in with ChatGPT ERROR Raw mode is not supported on the current process.stdin"
    expect(isCodexHeadlessAuthCheckError(output)).toBe(true)
    expect(sanitizeCodexAuthError(output)).toContain("could not report auth status in non-interactive mode")
    expect(parseCodexAuth(output, false)).toMatchObject({
      state: "unknown",
      authenticated: false,
    })
  })

  it("recognizes legacy exec stderr when codex opens instructions.md in vi", () => {
    const output = [
      "Vim: Warning: Output is not to a terminal",
      "E325: ATTENTION",
      'Swap file "~/.codex/.instructions.md.swp" already exists!',
      'While opening file "/Users/vlad/.codex/instructions.md"',
    ].join("\n")

    expect(isCodexInteractiveEditorNoise(output)).toBe(true)
    expect(summarizeCodexInteractiveEditorNoise(output)).toContain("interactive editor")
    expect(summarizeCodexInteractiveEditorNoise(output)).toContain(".instructions.md.swp")
  })
})
