import { describe, expect, it } from "vitest"
import { resolveCanvasShortcutIntent } from "./canvas-shortcuts"

function event(overrides: Partial<KeyboardEvent> = {}) {
  return {
    key: "",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    defaultPrevented: false,
    ...overrides,
  } as KeyboardEvent
}

describe("resolveCanvasShortcutIntent", () => {
  it("opens the skill picker from bare A or the primary-shift shortcut", () => {
    expect(resolveCanvasShortcutIntent({
      event: event({ key: "a" }),
      primaryModifierKey: "meta",
      isEditable: false,
      readOnly: false,
      isRunning: false,
      canDeleteSelection: false,
    })).toEqual({ type: "open_skill_picker" })

    expect(resolveCanvasShortcutIntent({
      event: event({ key: "a", metaKey: true, shiftKey: true }),
      primaryModifierKey: "meta",
      isEditable: false,
      readOnly: false,
      isRunning: false,
      canDeleteSelection: false,
    })).toEqual({ type: "open_skill_picker" })
  })

  it("does not treat cross-platform modifiers as the bare add-step shortcut", () => {
    expect(resolveCanvasShortcutIntent({
      event: event({ key: "a", ctrlKey: true }),
      primaryModifierKey: "meta",
      isEditable: false,
      readOnly: false,
      isRunning: false,
      canDeleteSelection: false,
    })).toBeNull()
  })

  it("keeps add-step disabled while read-only or running", () => {
    expect(resolveCanvasShortcutIntent({
      event: event({ key: "a" }),
      primaryModifierKey: "ctrl",
      isEditable: false,
      readOnly: true,
      isRunning: false,
      canDeleteSelection: false,
    })).toBeNull()

    expect(resolveCanvasShortcutIntent({
      event: event({ key: "a" }),
      primaryModifierKey: "ctrl",
      isEditable: false,
      readOnly: false,
      isRunning: true,
      canDeleteSelection: false,
    })).toBeNull()
  })

  it("recenters on the exact primary-shift-L shortcut", () => {
    expect(resolveCanvasShortcutIntent({
      event: event({ key: "l", ctrlKey: true, shiftKey: true }),
      primaryModifierKey: "ctrl",
      isEditable: false,
      readOnly: true,
      isRunning: true,
      canDeleteSelection: false,
    })).toEqual({ type: "recenter" })
  })

  it("deletes only from the exact delete shortcuts", () => {
    expect(resolveCanvasShortcutIntent({
      event: event({ key: "Delete" }),
      primaryModifierKey: "ctrl",
      isEditable: false,
      readOnly: false,
      isRunning: false,
      canDeleteSelection: true,
    })).toEqual({ type: "remove_selection" })

    expect(resolveCanvasShortcutIntent({
      event: event({ key: "Delete", altKey: true }),
      primaryModifierKey: "ctrl",
      isEditable: false,
      readOnly: false,
      isRunning: false,
      canDeleteSelection: true,
    })).toBeNull()
  })
})
