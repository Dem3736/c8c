const DEFAULT_EXECUTION_POOL_LIMIT = 8

interface PoolWaiter {
  resolve: (ticket: ExecutionPoolTicket) => void
  enqueuedAt: number
}

export interface ExecutionPoolTicket {
  queueWaitMs: number
  release: () => void
}

let activeCount = 0
const queue: PoolWaiter[] = []

function executionPoolLimit(): number {
  const raw = Number(process.env.C8C_EXECUTION_POOL_LIMIT)
  if (Number.isFinite(raw) && raw >= 1) {
    return Math.max(1, Math.floor(raw))
  }
  return DEFAULT_EXECUTION_POOL_LIMIT
}

function createTicket(enqueuedAt: number): ExecutionPoolTicket {
  let released = false
  return {
    queueWaitMs: Math.max(0, Date.now() - enqueuedAt),
    release: () => {
      if (released) return
      released = true
      activeCount = Math.max(0, activeCount - 1)
      const next = queue.shift()
      if (!next) return
      activeCount += 1
      next.resolve(createTicket(next.enqueuedAt))
    },
  }
}

export async function acquireExecutionSlot(): Promise<ExecutionPoolTicket> {
  const enqueuedAt = Date.now()
  if (activeCount < executionPoolLimit()) {
    activeCount += 1
    return createTicket(enqueuedAt)
  }

  return new Promise<ExecutionPoolTicket>((resolve) => {
    queue.push({ resolve, enqueuedAt })
  })
}

export async function withExecutionSlot<T>(
  task: (ticket: ExecutionPoolTicket) => Promise<T>,
): Promise<T> {
  const ticket = await acquireExecutionSlot()
  try {
    return await task(ticket)
  } finally {
    ticket.release()
  }
}

export function getExecutionPoolSnapshot(): { limit: number; active: number; queued: number } {
  return {
    limit: executionPoolLimit(),
    active: activeCount,
    queued: queue.length,
  }
}
