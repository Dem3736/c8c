import { useAtom } from "jotai"
import { AlertTriangle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cliStatusAtom, cliStatusBannerDismissedAtom, mainViewAtom } from "@/lib/store"

export function CliBanner() {
  const [cliStatus] = useAtom(cliStatusAtom)
  const [dismissed, setDismissed] = useAtom(cliStatusBannerDismissedAtom)
  const [, setMainView] = useAtom(mainViewAtom)

  if (dismissed || !cliStatus) return null

  let message: string | null = null
  if (!cliStatus.cliInstalled) {
    message = "Claude CLI not found. Install it to run workflows."
  } else if (!cliStatus.loggedIn) {
    message = "Claude CLI not authenticated. Run `claude login` in your terminal."
  }

  if (!message) return null

  return (
    <div className="flex items-center gap-2 border-b border-status-warning/25 bg-status-warning/10 px-3 py-2 text-body-sm">
      <AlertTriangle size={14} className="shrink-0 text-status-warning" />
      <span className="flex-1 text-status-warning">{message}</span>
      <Button
        variant="ghost"
        size="sm"
        className="text-status-warning"
        onClick={() => setMainView("settings")}
      >
        Open Settings
      </Button>
      <button
        type="button"
        className="shrink-0 rounded p-0.5 text-status-warning hover:bg-status-warning/15"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  )
}
