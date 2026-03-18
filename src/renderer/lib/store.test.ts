import { describe, expect, it } from "vitest"
import {
  appendInboxNotification,
  pruneInboxNotificationsByPersistentKeys,
  type InboxNotification,
} from "./store"

describe("inbox notification helpers", () => {
  it("upserts persistent notifications in place without duplicating them", () => {
    const existing: InboxNotification[] = [
      {
        id: "notif-1",
        title: "Old title",
        description: "Old description",
        level: "warning",
        source: "workflow",
        persistentKey: "approval-needed:/tmp/workspace::approval-1",
        action: {
          kind: "open_inbox_task",
          taskKey: "/tmp/workspace::approval-1",
          label: "Open review gate",
        },
        createdAt: 10,
        read: true,
      },
    ]

    const next = appendInboxNotification(existing, {
      title: "Updated title",
      description: "Updated description",
      level: "warning",
      source: "workflow",
      persistentKey: "approval-needed:/tmp/workspace::approval-1",
      action: {
        kind: "open_inbox_task",
        taskKey: "/tmp/workspace::approval-1",
        workflowPath: "/tmp/workflow.chain",
        label: "Open review gate",
      },
    }, 20)

    expect(next).toEqual([
      {
        id: "notif-1",
        title: "Updated title",
        description: "Updated description",
        level: "warning",
        source: "workflow",
        persistentKey: "approval-needed:/tmp/workspace::approval-1",
        action: {
          kind: "open_inbox_task",
          taskKey: "/tmp/workspace::approval-1",
          workflowPath: "/tmp/workflow.chain",
          label: "Open review gate",
        },
        createdAt: 10,
        read: true,
      },
    ])
  })

  it("does not collapse different persistent approvals that share copy", () => {
    const existing: InboxNotification[] = []

    const withFirst = appendInboxNotification(existing, {
      title: "Review gate needs attention",
      description: "Open the inbox task to continue.",
      level: "warning",
      source: "workflow",
      persistentKey: "approval-needed:/tmp/workspace::approval-1",
      action: {
        kind: "open_inbox_task",
        taskKey: "/tmp/workspace::approval-1",
      },
    }, 100)

    const withSecond = appendInboxNotification(withFirst, {
      title: "Review gate needs attention",
      description: "Open the inbox task to continue.",
      level: "warning",
      source: "workflow",
      persistentKey: "approval-needed:/tmp/workspace::approval-2",
      action: {
        kind: "open_inbox_task",
        taskKey: "/tmp/workspace::approval-2",
      },
    }, 101)

    expect(withSecond).toHaveLength(2)
    expect(withSecond[0]?.persistentKey).toBe("approval-needed:/tmp/workspace::approval-2")
    expect(withSecond[1]?.persistentKey).toBe("approval-needed:/tmp/workspace::approval-1")
  })

  it("removes stale persistent notifications without touching unrelated history", () => {
    const existing: InboxNotification[] = [
      {
        id: "notif-1",
        title: "Approval pending",
        level: "warning",
        source: "workflow",
        persistentKey: "approval-needed:/tmp/workspace::approval-1",
        createdAt: 10,
        read: false,
      },
      {
        id: "notif-2",
        title: "Workflow completed",
        level: "success",
        source: "workflow",
        createdAt: 20,
        read: true,
      },
    ]

    expect(pruneInboxNotificationsByPersistentKeys(existing, ["approval-needed:/tmp/workspace::approval-1"])).toEqual([
      {
        id: "notif-2",
        title: "Workflow completed",
        level: "success",
        source: "workflow",
        createdAt: 20,
        read: true,
      },
    ])
  })
})
