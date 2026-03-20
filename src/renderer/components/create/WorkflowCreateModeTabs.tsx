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
    <div className="flex flex-col gap-2 px-1">
      <Tabs
        value={selectedModeId}
        onValueChange={(value) => onSelectMode(value as ResultModeId)}
        className="w-full"
      >
        <TabsList className="h-auto w-fit flex-wrap rounded-[0.95rem] border border-hairline/75 bg-surface-1/72 p-1 shadow-[inset_0_1px_0_var(--inset-highlight)]">
          {RESULT_MODES.map((mode) => (
            <TabsTrigger
              key={mode.id}
              value={mode.id}
              className="h-8 gap-2 rounded-[0.75rem] border-transparent px-3 text-[15px] font-medium text-muted-foreground hover:bg-surface-2/45 hover:text-foreground data-[state=active]:border-transparent data-[state=active]:bg-surface-1 data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_1px_0_var(--inset-highlight),0_1px_2px_hsl(var(--foreground)/0.08)]"
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
