import {
  matchesPlainShortcut,
  matchesPrimaryShortcut,
  type KeyboardShortcutEvent,
  type PrimaryModifierKey,
} from "./keyboard-shortcuts"

export type CanvasShortcutIntent =
  | { type: "open_skill_picker" }
  | { type: "recenter" }
  | { type: "remove_selection" }

export function resolveCanvasShortcutIntent({
  event,
  primaryModifierKey,
  isEditable,
  readOnly,
  isRunning,
  canDeleteSelection,
}: {
  event: KeyboardShortcutEvent
  primaryModifierKey: PrimaryModifierKey
  isEditable: boolean
  readOnly: boolean
  isRunning: boolean
  canDeleteSelection: boolean
}): CanvasShortcutIntent | null {
  if (isEditable) return null

  if (
    !readOnly
    && !isRunning
    && canDeleteSelection
    && (matchesPlainShortcut(event, "Delete") || matchesPlainShortcut(event, "Backspace"))
  ) {
    return { type: "remove_selection" }
  }

  if (
    !readOnly
    && !isRunning
    && (
      matchesPlainShortcut(event, "a")
      || matchesPrimaryShortcut(event, { key: "a", primaryModifierKey, shift: true })
    )
  ) {
    return { type: "open_skill_picker" }
  }

  if (matchesPrimaryShortcut(event, { key: "l", primaryModifierKey, shift: true })) {
    return { type: "recenter" }
  }

  return null
}
