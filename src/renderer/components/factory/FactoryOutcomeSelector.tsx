import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SectionHeading } from "@/components/ui/page-shell"

interface FactoryOption {
  id: string
  label: string
  summary: string
  caseCount: number
  artifactCount: number
  origin: "saved" | "derived" | "draft"
}

interface FactoryOutcomeSelectorProps {
  effectiveSelectedFactoryId: string | null
  factoryOptions: FactoryOption[]
  onSelectFactory: (factoryId: string) => void
  onStartNewFactory: () => void
}

export function FactoryOutcomeSelector({
  effectiveSelectedFactoryId,
  factoryOptions,
  onSelectFactory,
  onStartNewFactory,
}: FactoryOutcomeSelectorProps) {
  return (
    <article className="rounded-xl surface-panel p-5 space-y-4">
      <SectionHeading
        title="Outcomes"
        meta={(
          <Button variant="outline" size="sm" onClick={onStartNewFactory}>
            New outcome
          </Button>
        )}
      />

      {factoryOptions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-body-sm text-muted-foreground">
          No saved outcomes yet. Start a mode once, then let tracks and results accumulate underneath it.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          {factoryOptions.map((factory) => (
            <button
              key={factory.id}
              type="button"
              onClick={() => onSelectFactory(factory.id)}
              className={`rounded-lg border px-4 py-3 text-left space-y-2 ui-transition-colors ui-motion-fast ${
                effectiveSelectedFactoryId === factory.id
                  ? "border-primary/35 bg-primary/8 shadow-[inset_0_1px_0_hsl(var(--primary)/0.08),0_10px_22px_hsl(var(--foreground)/0.05)]"
                  : "border-hairline bg-surface-2/35 hover:bg-surface-2/55"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-title-sm text-foreground">{factory.label}</div>
                <Badge variant="outline" className="ui-meta-text px-2 py-0">
                  {factory.origin === "saved" ? "Saved" : factory.origin === "draft" ? "Draft" : "Derived"}
                </Badge>
              </div>
              <p className="line-clamp-2 text-body-sm text-muted-foreground">
                {factory.summary}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
                <span>{factory.caseCount} track{factory.caseCount === 1 ? "" : "s"}</span>
                <span className="text-border">•</span>
                <span>{factory.artifactCount} output{factory.artifactCount === 1 ? "" : "s"}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </article>
  )
}
