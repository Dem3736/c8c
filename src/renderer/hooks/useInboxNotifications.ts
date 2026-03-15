import { useCallback, useMemo } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import {
  addInboxNotificationAtom,
  clearInboxNotificationsAtom,
  markAllInboxNotificationsReadAtom,
  markInboxNotificationReadAtom,
  unreadInboxCountAtom,
  type InboxNotification,
} from "@/lib/store"

type CreateInboxNotification = Omit<InboxNotification, "id" | "createdAt" | "read">

export function useInboxNotifications() {
  const unreadCount = useAtomValue(unreadInboxCountAtom)
  const addInboxNotification = useSetAtom(addInboxNotificationAtom)
  const markRead = useSetAtom(markInboxNotificationReadAtom)
  const markAllRead = useSetAtom(markAllInboxNotificationsReadAtom)
  const clearAll = useSetAtom(clearInboxNotificationsAtom)
  const addNotification = useCallback(
    // Consumers use this in effect dependencies, so its identity must stay stable.
    (notification: CreateInboxNotification) => addInboxNotification(notification),
    [addInboxNotification],
  )

  return useMemo(
    () => ({
      unreadCount,
      addNotification,
      markRead,
      markAllRead,
      clearAll,
    }),
    [unreadCount, addNotification, markRead, markAllRead, clearAll],
  )
}
