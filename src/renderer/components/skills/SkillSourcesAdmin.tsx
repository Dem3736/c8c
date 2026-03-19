import type {
  InstalledPlugin,
  MarketplaceSource,
  PluginMcpServerInfo,
} from "@shared/types"
import { Badge } from "@/components/ui/badge"
import { SectionHeading } from "@/components/ui/page-shell"
import type { SkillLibrary } from "@/lib/store"
import {
  SkillLibraryCard,
  MarketplaceCard,
  PluginCard,
} from "@/components/skills/SkillSourceCards"
import {
  LIBRARY_ACTION_LABEL,
  type LibraryAction,
  MARKETPLACE_ACTION_LABEL,
  type MarketplaceAction,
  PLUGIN_ACTION_LABEL,
  type PluginAction,
} from "@/components/skills/skills-page-helpers"

interface SkillsActionState<TAction extends string> {
  id: string
  action: TAction
}

interface SkillSourcesAdminProps {
  libraries: SkillLibrary[]
  totalMarketplaceCount: number
  installedLibraries: SkillLibrary[]
  favoriteLibraries: SkillLibrary[]
  availableLibraries: SkillLibrary[]
  filteredMarketplaces: MarketplaceSource[]
  installedMarketplaces: MarketplaceSource[]
  availableMarketplaces: MarketplaceSource[]
  enabledPlugins: InstalledPlugin[]
  disabledPlugins: InstalledPlugin[]
  skillsCountByLibrary: Map<string, number>
  skillsCountByPlugin: Map<string, number>
  pluginMcpByPlugin: Map<string, PluginMcpServerInfo[]>
  pluginsByMarketplaceId: Map<string, InstalledPlugin[]>
  libraryAction: SkillsActionState<LibraryAction> | null
  marketplaceAction: SkillsActionState<MarketplaceAction> | null
  pluginAction: SkillsActionState<PluginAction> | null
  refreshing: boolean
  hasQuery: boolean
  onSetLibraryInstalled: (library: SkillLibrary, nextChecked: boolean) => void
  onUpdateLibrary: (library: SkillLibrary) => void
  onPreviewLibrary: (library: SkillLibrary) => void
  onInstallMarketplace: (marketplace: MarketplaceSource) => void
  onUpdateMarketplace: (marketplace: MarketplaceSource) => void
  onRequestRemoveMarketplace: (marketplace: MarketplaceSource) => void
  onSetPluginEnabled: (plugin: InstalledPlugin, nextChecked: boolean) => void
  onPreviewPlugin: (plugin: InstalledPlugin) => void
}

export function SkillSourcesAdmin({
  libraries,
  totalMarketplaceCount,
  installedLibraries,
  favoriteLibraries,
  availableLibraries,
  filteredMarketplaces,
  installedMarketplaces,
  availableMarketplaces,
  enabledPlugins,
  disabledPlugins,
  skillsCountByLibrary,
  skillsCountByPlugin,
  pluginMcpByPlugin,
  pluginsByMarketplaceId,
  libraryAction,
  marketplaceAction,
  pluginAction,
  refreshing,
  hasQuery,
  onSetLibraryInstalled,
  onUpdateLibrary,
  onPreviewLibrary,
  onInstallMarketplace,
  onUpdateMarketplace,
  onRequestRemoveMarketplace,
  onSetPluginEnabled,
  onPreviewPlugin,
}: SkillSourcesAdminProps) {
  return (
    <>
      <section className="space-y-3">
        <SectionHeading title="Marketplaces" meta={<Badge variant="outline">{installedMarketplaces.length}/{totalMarketplaceCount}</Badge>} />

        {filteredMarketplaces.length === 0 ? (
          <div className="rounded-lg surface-panel ui-empty-state px-4 text-body-sm text-muted-foreground">
            No marketplaces match this filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {installedMarketplaces.map((marketplace) => {
              const busy = refreshing || marketplaceAction?.id === marketplace.id
              const actionLabel = marketplaceAction?.id === marketplace.id
                ? MARKETPLACE_ACTION_LABEL[marketplaceAction.action]
                : null
              return (
                <MarketplaceCard
                  key={marketplace.id}
                  marketplace={marketplace}
                  pluginCount={(pluginsByMarketplaceId.get(marketplace.id) || []).length}
                  busy={busy}
                  actionLabel={actionLabel}
                  onInstall={() => undefined}
                  onUpdate={() => onUpdateMarketplace(marketplace)}
                  onRemove={() => onRequestRemoveMarketplace(marketplace)}
                />
              )
            })}
            {availableMarketplaces.map((marketplace) => {
              const busy = refreshing || marketplaceAction?.id === marketplace.id
              const actionLabel = marketplaceAction?.id === marketplace.id
                ? MARKETPLACE_ACTION_LABEL[marketplaceAction.action]
                : null
              return (
                <MarketplaceCard
                  key={marketplace.id}
                  marketplace={marketplace}
                  pluginCount={0}
                  busy={busy}
                  actionLabel={actionLabel}
                  onInstall={() => onInstallMarketplace(marketplace)}
                  onUpdate={() => undefined}
                  onRemove={() => undefined}
                />
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading title="Enabled Plugins" meta={<Badge variant="outline">{enabledPlugins.length}</Badge>} />

        {enabledPlugins.length === 0 ? (
          <div className="rounded-lg surface-panel ui-empty-state px-4 text-body-sm text-muted-foreground">
            Install a marketplace and enable a plugin pack to bring in pipeline skills, templates, or MCP integrations.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {enabledPlugins.map((plugin) => {
              const busy = refreshing || pluginAction?.id === plugin.id
              const actionLabel = pluginAction?.id === plugin.id
                ? PLUGIN_ACTION_LABEL[pluginAction.action]
                : null
              return (
                <PluginCard
                  key={plugin.id}
                  plugin={plugin}
                  skillsCount={skillsCountByPlugin.get(plugin.id) ?? 0}
                  mcpCount={(pluginMcpByPlugin.get(plugin.id) || []).length}
                  busy={busy}
                  actionLabel={actionLabel}
                  onToggle={(nextChecked) => onSetPluginEnabled(plugin, nextChecked)}
                  onPreview={() => onPreviewPlugin(plugin)}
                />
              )
            })}
          </div>
        )}
      </section>

      {(disabledPlugins.length > 0 || hasQuery) && (
        <section className="space-y-3">
          <SectionHeading title="Installed But Disabled" meta={<Badge variant="outline">{disabledPlugins.length}</Badge>} />

          {disabledPlugins.length === 0 ? (
            <div className="rounded-lg surface-panel ui-empty-state px-4 text-body-sm text-muted-foreground">
              No disabled plugins match this filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {disabledPlugins.map((plugin) => {
                const busy = refreshing || pluginAction?.id === plugin.id
                const actionLabel = pluginAction?.id === plugin.id
                  ? PLUGIN_ACTION_LABEL[pluginAction.action]
                  : null
                return (
                  <PluginCard
                    key={plugin.id}
                    plugin={plugin}
                    skillsCount={skillsCountByPlugin.get(plugin.id) ?? 0}
                    mcpCount={(pluginMcpByPlugin.get(plugin.id) || []).length}
                    busy={busy}
                    actionLabel={actionLabel}
                    onToggle={(nextChecked) => onSetPluginEnabled(plugin, nextChecked)}
                    onPreview={() => onPreviewPlugin(plugin)}
                  />
                )
              })}
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <SectionHeading title="Installed Legacy Libraries" meta={<Badge variant="outline">{installedLibraries.length}/{libraries.length}</Badge>} />

        {installedLibraries.length === 0 ? (
          <div className="rounded-lg surface-panel ui-empty-state px-4 text-body-sm text-muted-foreground">
            No legacy libraries installed. Use plugin marketplaces above for the primary packaging model.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {installedLibraries.map((library) => {
              const busy = refreshing || libraryAction?.id === library.id
              const actionLabel = libraryAction?.id === library.id
                ? LIBRARY_ACTION_LABEL[libraryAction.action]
                : null
              return (
                <SkillLibraryCard
                  key={library.id}
                  library={library}
                  installedSkillsCount={skillsCountByLibrary.get(library.id) ?? 0}
                  busy={busy}
                  actionLabel={actionLabel}
                  onToggle={(nextChecked) => onSetLibraryInstalled(library, nextChecked)}
                  onUpdate={() => onUpdateLibrary(library)}
                  onPreview={() => onPreviewLibrary(library)}
                />
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading title="Legacy Favorites" meta={<Badge variant="outline">{favoriteLibraries.length}</Badge>} />

        {favoriteLibraries.length === 0 ? (
          <div className="rounded-lg surface-panel ui-empty-state px-4 text-body-sm text-muted-foreground">
            {hasQuery
              ? "No favorite libraries match this filter."
              : "Your favorite libraries are already installed."}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {favoriteLibraries.map((library) => {
              const busy = refreshing || libraryAction?.id === library.id
              const actionLabel = libraryAction?.id === library.id
                ? LIBRARY_ACTION_LABEL[libraryAction.action]
                : null
              return (
                <SkillLibraryCard
                  key={library.id}
                  library={library}
                  installedSkillsCount={0}
                  busy={busy}
                  actionLabel={actionLabel}
                  onToggle={(nextChecked) => onSetLibraryInstalled(library, nextChecked)}
                  onUpdate={() => undefined}
                  onPreview={() => onPreviewLibrary(library)}
                />
              )
            })}
          </div>
        )}
      </section>

      {(availableLibraries.length > 0 || hasQuery) && (
        <section className="space-y-3">
          <SectionHeading title="Legacy Available" meta={<Badge variant="outline">{availableLibraries.length}</Badge>} />

          {availableLibraries.length === 0 ? (
            <div className="rounded-lg surface-panel ui-empty-state px-4 text-body-sm text-muted-foreground">
              No other libraries match this filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {availableLibraries.map((library) => {
                const busy = refreshing || libraryAction?.id === library.id
                const actionLabel = libraryAction?.id === library.id
                  ? LIBRARY_ACTION_LABEL[libraryAction.action]
                  : null
                return (
                  <SkillLibraryCard
                    key={library.id}
                    library={library}
                    installedSkillsCount={0}
                    busy={busy}
                    actionLabel={actionLabel}
                    onToggle={(nextChecked) => onSetLibraryInstalled(library, nextChecked)}
                    onUpdate={() => undefined}
                    onPreview={() => onPreviewLibrary(library)}
                  />
                )
              })}
            </div>
          )}
        </section>
      )}
    </>
  )
}
