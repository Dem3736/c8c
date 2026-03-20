import {
  Factory,
  FilePlus2,
  FolderOpen,
  Inbox,
  LayoutTemplate,
  PanelLeftClose,
  Plus,
  Settings,
  Sparkles,
} from "lucide-react"
import { SidebarNavItem } from "@/components/sidebar/SidebarNavItem"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ReactNode } from "react"

type ProjectSidebarChromeProps = {
  mainView: string
  unreadInboxCount: number
  factoryBetaEnabled: boolean
  workflowDirty: boolean
  selectedWorkflowPath: string | null
  workflowSearchQuery: string
  showSearch: boolean
  onSearchChange: (value: string) => void
  onOpenCreate: () => void
  onOpenStartingPoints: () => void
  onOpenSkills: () => void
  onOpenInbox: () => void
  onOpenFactory: () => void
  onOpenSettings: () => void
  onAddProject: () => void
  onToggleVisibility?: () => void
  showVisibilityToggle?: boolean
}

function inboxMeta(unreadInboxCount: number): ReactNode {
  if (unreadInboxCount <= 0) return null
  return (
    <span className="ui-meta-text inline-flex min-w-5 items-center justify-center rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
      {unreadInboxCount > 99 ? "99+" : unreadInboxCount}
    </span>
  )
}

export function ProjectSidebarChrome({
  mainView,
  unreadInboxCount,
  factoryBetaEnabled,
  workflowDirty,
  selectedWorkflowPath,
  workflowSearchQuery,
  showSearch,
  onSearchChange,
  onOpenCreate,
  onOpenStartingPoints,
  onOpenSkills,
  onOpenInbox,
  onOpenFactory,
  onOpenSettings,
  onAddProject,
  onToggleVisibility,
  showVisibilityToggle = false,
}: ProjectSidebarChromeProps) {
  return (
    <>
      <div className="space-y-px px-1.5 pt-2.5 pb-1">
        <SidebarNavItem
          icon={FilePlus2}
          label="New flow"
          active={mainView === "workflow_create"}
          onClick={onOpenCreate}
        />

        <SidebarNavItem
          icon={LayoutTemplate}
          label="Library"
          active={mainView === "templates"}
          onClick={onOpenStartingPoints}
        />

        <SidebarNavItem
          icon={Sparkles}
          label="Skills"
          active={mainView === "skills"}
          onClick={onOpenSkills}
        />

        <SidebarNavItem
          icon={Inbox}
          label="Inbox"
          active={mainView === "inbox"}
          onClick={onOpenInbox}
          meta={inboxMeta(unreadInboxCount)}
        />

        {factoryBetaEnabled ? (
          <SidebarNavItem
            icon={Factory}
            label="Lab (beta)"
            active={mainView === "factory"}
            onClick={onOpenFactory}
          />
        ) : null}

        <SidebarNavItem
          icon={Settings}
          label="Settings"
          active={mainView === "settings"}
          onClick={onOpenSettings}
        />
      </div>

      <div className="px-2.5 pt-3 pb-1.5">
        <div className="flex items-center justify-between">
          <span className="section-kicker inline-flex items-center gap-1.5">
            Flows
            {workflowDirty && selectedWorkflowPath && (
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-status-warning" aria-label="Flow has unsaved changes" />
            )}
          </span>
          <div className="flex items-center gap-1">
            {showVisibilityToggle && onToggleVisibility && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    data-sidebar-item="true"
                    className="ui-icon-button hover:bg-sidebar-hover hover:text-foreground ui-transition-colors ui-motion-fast"
                    onClick={onToggleVisibility}
                    aria-label="Hide sidebar"
                  >
                    <PanelLeftClose size={12} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Hide sidebar</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-sidebar-item="true"
                  className="ui-icon-button hover:bg-sidebar-hover hover:text-foreground ui-transition-colors ui-motion-fast"
                  onClick={onOpenCreate}
                  aria-label="New flow"
                >
                  <Plus size={12} />
                </button>
              </TooltipTrigger>
              <TooltipContent>New flow</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-sidebar-item="true"
                  className="ui-icon-button hover:bg-sidebar-hover hover:text-foreground ui-transition-colors ui-motion-fast"
                  onClick={onAddProject}
                  aria-label="Add project"
                >
                  <FolderOpen size={12} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Add project</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="mt-1.5 h-px bg-hairline" />
      </div>

      {showSearch && (
        <div className="px-2.5 pb-1.5">
          <input
            type="search"
            placeholder="Search flows..."
            aria-label="Search flows"
            value={workflowSearchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            className="w-full h-control-sm rounded-md border border-hairline bg-surface-2/60 px-2 text-sidebar-item text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
          />
        </div>
      )}
    </>
  )
}
