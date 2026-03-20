import { Loader2 } from "lucide-react"

export function SkillsActionStatus({
  libraryActionLabel,
  marketplaceActionLabel,
  pluginActionLabel,
}: {
  libraryActionLabel: string | null
  marketplaceActionLabel: string | null
  pluginActionLabel: string | null
}) {
  return (
    <>
      {libraryActionLabel && (
        <div className="ui-alert-info text-status-info flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          {libraryActionLabel}
        </div>
      )}

      {marketplaceActionLabel && (
        <div className="ui-alert-info text-status-info flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          {marketplaceActionLabel}
        </div>
      )}

      {pluginActionLabel && (
        <div className="ui-alert-info text-status-info flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          {pluginActionLabel}
        </div>
      )}
    </>
  )
}
