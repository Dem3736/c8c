import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RESULT_MODES } from "@/lib/result-modes"
import type { ResultModeId } from "@shared/types"

export function WorkflowCreateModeTabs({
  selectedModeId,
  onSelectMode,
}: {
  selectedModeId: ResultModeId
  onSelectMode: (modeId: ResultModeId) => void
}) {
  return (
    <div className="px-1">
      <Tabs
        value={selectedModeId}
        onValueChange={(value) => onSelectMode(value as ResultModeId)}
        className="w-full"
      >
        <TabsList className="h-auto w-fit flex-wrap gap-1 rounded-none border-0 bg-transparent p-0 shadow-none">
          {RESULT_MODES.map((mode) => (
            <TabsTrigger
              key={mode.id}
              value={mode.id}
              className="h-8 gap-2 rounded-full border-transparent px-3 text-[15px] font-medium text-muted-foreground hover:bg-surface-2/45 hover:text-foreground data-[state=active]:border-transparent data-[state=active]:bg-surface-2/70 data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <span aria-hidden>{mode.emoji}</span>
              <span>{mode.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
