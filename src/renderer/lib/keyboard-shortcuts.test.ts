import { describe, expect, it } from "vitest"
import { consumeShortcut, isShortcutConsumed } from "./keyboard-shortcuts"

describe("keyboard-shortcuts", () => {
  it("marks consumed shortcuts so later listeners can exit", () => {
    const event = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true
      },
      stopPropagation() {},
      stopImmediatePropagation() {},
    } as KeyboardEvent

    expect(isShortcutConsumed(event)).toBe(false)

    consumeShortcut(event)

    expect(isShortcutConsumed(event)).toBe(true)
    expect(event.defaultPrevented).toBe(true)
  })
})
