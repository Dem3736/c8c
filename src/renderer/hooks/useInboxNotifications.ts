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
  const addNotification = useSetAtom(addInboxNotificationAtom)
  const markRead = useSetAtom(markInboxNotificationReadAtom)
  const markAllRead = useSetAtom(markAllInboxNotificationsReadAtom)
  const clearAll = useSetAtom(clearInboxNotificationsAtom)

  return {
    unreadCount,
    addNotification: (notification: CreateInboxNotification) => addNotification(notification),
    markRead,
    markAllRead,
    clearAll,
  }
}
