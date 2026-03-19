const SHORTCUT_CONSUMED = Symbol("c8c.shortcutConsumed")

type ShortcutEvent = KeyboardEvent & {
  [SHORTCUT_CONSUMED]?: boolean
}

export function isShortcutConsumed(event: KeyboardEvent) {
  return Boolean((event as ShortcutEvent)[SHORTCUT_CONSUMED])
}

export function consumeShortcut(event: KeyboardEvent) {
  const shortcutEvent = event as ShortcutEvent
  shortcutEvent[SHORTCUT_CONSUMED] = true
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}
