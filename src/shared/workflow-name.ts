export function normalizeWorkflowTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ")
}

export function nextWorkflowTitle(
  existingTitles: string[],
  baseTitle = "New workflow",
): string {
  const normalizedExisting = new Set(
    existingTitles.map((name) => normalizeWorkflowTitle(name).toLowerCase()),
  )

  let suffix = 1
  let candidate = baseTitle
  while (normalizedExisting.has(candidate.toLowerCase())) {
    suffix += 1
    candidate = `${baseTitle} ${suffix}`
  }
  return candidate
}

export function toWorkflowFileStem(title: string): string {
  const normalized = normalizeWorkflowTitle(title).toLowerCase()
  const stem = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
  return stem || "workflow"
}
