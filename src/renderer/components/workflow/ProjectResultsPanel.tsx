import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatArtifactContractLabel } from "@/lib/workflow-entry"
import type { ArtifactContract, ArtifactRecord } from "@shared/types"

interface ProjectResultsPanelProps {
  artifacts: ArtifactRecord[]
  loading: boolean
  error: string | null
  requiredContracts?: ArtifactContract[]
  onOpenArtifact: (artifact: ArtifactRecord) => void
}

export function ProjectResultsPanel({
  artifacts,
  loading,
  error,
  requiredContracts,
  onOpenArtifact,
}: ProjectResultsPanelProps) {
  const latestArtifacts = artifacts.slice(0, 4)
  const availableKinds = new Set(artifacts.map((artifact) => artifact.kind))
  const requiredLabels = (requiredContracts || []).map((contract) => ({
    label: formatArtifactContractLabel(contract),
    satisfied: availableKinds.has(contract.kind),
    optional: contract.required === false,
  }))
  const shouldRender = loading || Boolean(error) || latestArtifacts.length > 0 || requiredLabels.length > 0

  if (!shouldRender) {
    return null
  }

  return (
    <section className="rounded-lg border border-hairline bg-surface-1/70 px-4 py-3 ui-fade-slide-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="section-kicker">Results</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="ui-meta-text px-2 py-0">
            {artifacts.length} saved
          </Badge>
          {requiredLabels.length > 0 && (
            <Badge variant="outline" className="ui-meta-text px-2 py-0">
              {requiredLabels.length} reusable
            </Badge>
          )}
        </div>
      </div>

      {requiredLabels.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {requiredLabels.map((item) => (
            <Badge
              key={`${item.label}-${item.optional ? "optional" : "required"}`}
              variant={item.satisfied ? "success" : "outline"}
              className="ui-meta-text px-2 py-0"
            >
              {item.label}{item.optional ? " (optional)" : ""}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-3">
        {loading ? (
          <div className="ui-meta-text text-muted-foreground">Loading results...</div>
        ) : error ? (
          <div role="alert" className="ui-meta-text text-status-danger">{error}</div>
        ) : latestArtifacts.length === 0 ? (
          <div className="ui-meta-text text-muted-foreground">No saved results yet.</div>
        ) : (
          <div className="space-y-1.5">
            {latestArtifacts.map((artifact) => (
              <div
                key={artifact.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-surface-2/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-body-sm font-medium text-foreground">{artifact.title}</div>
                  <div className="ui-meta-text text-muted-foreground">
                    {formatArtifactContractLabel(artifact.kind)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => onOpenArtifact(artifact)}
                >
                  Open
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
