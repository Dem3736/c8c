import { describe, expect, it } from "vitest"
import {
  isCodexHeadlessAuthCheckError,
  parseCodexAuth,
  sanitizeCodexAuthError,
} from "./providers"

describe("providers codex auth parsing", () => {
  it("detects ChatGPT subscription auth", () => {
    expect(parseCodexAuth("Logged in using ChatGPT", false)).toMatchObject({
      authenticated: true,
      authMethod: "chatgpt",
      accountLabel: "ChatGPT",
    })
  })

  it("recognizes non-interactive raw-mode login status failures", () => {
    const output = "Sign in with ChatGPT ERROR Raw mode is not supported on the current process.stdin"
    expect(isCodexHeadlessAuthCheckError(output)).toBe(true)
    expect(sanitizeCodexAuthError(output)).toContain("could not report auth status in non-interactive mode")
  })
})
