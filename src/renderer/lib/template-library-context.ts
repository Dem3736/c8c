export interface TemplateLibraryContextState {
  projectPath: string | null
  createOnly: boolean
}

export function resolveTemplateLibraryProjectPath(
  projects: string[],
  selectedProject: string | null,
  context: TemplateLibraryContextState | null,
): string | null {
  if (context?.projectPath && projects.includes(context.projectPath)) {
    return context.projectPath
  }

  if (selectedProject && projects.includes(selectedProject)) {
    return selectedProject
  }

  return projects[0] ?? null
}

export function templateLibraryRequiresProjectCreation(
  context: TemplateLibraryContextState | null,
): boolean {
  return Boolean(context?.createOnly)
}
