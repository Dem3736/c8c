import { useAtom } from "jotai"
import { AlertTriangle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"
import { cliStatusAtom, cliStatusBannerDismissedAtom, mainViewAtom } from "@/lib/store"

export function CliBanner() {
  const [cliStatus] = useAtom(cliStatusAtom)
  const [dismissed, setDismissed] = useAtom(cliStatusBannerDismissedAtom)
  const [, setMainView] = useAtom(mainViewAtom)

  if (dismissed || !cliStatus) return null

  let message: string | null = null
  let toneClass = "text-status-warning"
  let bannerClass = "ui-alert-warning"
  if (!cliStatus.cliInstalled) {
    message = "Claude CLI not found. Install it to run workflows."
    toneClass = "text-status-danger"
    bannerClass = "ui-alert-danger"
  } else if (!cliStatus.loggedIn) {
    message = "Claude CLI not authenticated. Run `claude login` in your terminal."
  }

  if (!message) return null

  return (
    <div className={cn("mx-3 mt-3 flex items-center gap-2", bannerClass)}>
      <AlertTriangle size={14} className={cn("shrink-0", toneClass)} />
      <span className={cn("flex-1 text-body-sm", toneClass)}>{message}</span>
      <Button
        variant="ghost"
        size="sm"
        className={toneClass}
        onClick={() => setMainView("settings")}
      >
        Open Settings
      </Button>
      <button
        type="button"
        className={cn("ui-icon-button shrink-0", toneClass)}
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  )
}
