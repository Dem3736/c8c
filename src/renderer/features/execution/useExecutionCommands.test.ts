import { describe, expect, it } from "vitest"
import { canStartManualContinuation } from "./useExecutionCommands"

describe("canStartManualContinuation", () => {
  it("allows resuming from a paused run", () => {
    expect(canStartManualContinuation("paused")).toBe(true)
    expect(canStartManualContinuation("idle")).toBe(true)
    expect(canStartManualContinuation("failed")).toBe(true)
  })

  it("blocks continuation while a run is actively starting or running", () => {
    expect(canStartManualContinuation("starting")).toBe(false)
    expect(canStartManualContinuation("running")).toBe(false)
    expect(canStartManualContinuation("cancelling")).toBe(false)
  })
})
