# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

c8c (cybernetic) — open-source skill operations for Claude Code. Like Apple Shortcuts, but for Claude — give input, pick a chain of skills, get processed output. Workflows are directed graphs of skill nodes executed via the Claude CLI.

## Commands

```bash
npm run dev          # Start Electron with hot reload
npm run build        # Build for production
npm run test         # Run all tests (vitest)
npm run test:watch   # Run tests in watch mode
npx tsc --noEmit     # Type-check without emitting
```

## Architecture

Electron app with three process layers:

- **Main** (`src/main/`) — Electron main process. IPC handlers in `ipc/`, business logic in `lib/`
- **Preload** (`src/preload/index.ts`) — Context bridge exposing `window.api` with 40+ IPC methods
- **Renderer** (`src/renderer/`) — React UI

Path aliases: `@` → `src/renderer`, `@shared` → `src/shared` (in tsconfig and electron-vite config).

### Graph-Based Workflow Model

Workflows are directed graphs, not linear chains. Defined in `src/shared/types.ts`:

**7 node types**: `input`, `skill`, `evaluator`, `splitter`, `merger`, `output`, `approval`
**3 edge types**: `default`, `pass`, `fail` — evaluator nodes branch on pass/fail

Key configs per node type:
- **Skill**: `skillRef`, `prompt`, `model` (sonnet|opus|haiku), `outputMode`, `maxTurns`, `allowedTools[]`
- **Evaluator**: `criteria`, `threshold` (1-10), `maxRetries`, `retryFrom` node
- **Splitter**: `strategy`, `maxBranches` — fans out into parallel branches at runtime
- **Merger**: `strategy` (concatenate|summarize|select_best)
- **Approval**: human gate with optional edit

Runtime expands the base graph — splitter nodes create parallel branches tracked via `runtimeNodesAtom`/`runtimeEdgesAtom`/`runtimeMetaAtom`.

### State Management

Jotai atoms in `src/renderer/lib/store.ts`. Key patterns:
- `currentWorkflowAtom` holds the full graph (nodes + edges)
- `workflowDirtyAtom` is a computed atom comparing current state against `workflowSavedSnapshotAtom`
- Persistent atoms (sidebar width, main view, chat panel width) survive across sessions
- Execution state: `runStatusAtom` ("idle"|"running"|"done"|"error"), `nodeStatesAtom`, `evalResultsAtom`

### View Routing

`mainViewAtom` switches between: `"thread"` (workflow editor), `"skills"`, `"templates"`, `"settings"`.

Two workflow editing modes via `viewModeAtom`: `"list"` (linear chain builder) and `"canvas"` (React Flow graph).

### Canvas System

`@xyflow/react` with **Dagre** for automatic hierarchical layout (LR direction). Custom components:
- `canvas/CanvasNode.tsx` — typed icons, status visualization (6 states), token/cost metrics
- `canvas/WorkflowEdge.tsx` — smooth-step paths, pass (green) / fail (red dashed) visual indicators

### IPC Pattern

Main ↔ Renderer communication via `window.api` (defined in preload). Two patterns:
1. **Invoke**: `window.api.runChain()`, `window.api.saveWorkflow()` — request/response
2. **Events**: `window.api.onWorkflowEvent()`, `window.api.onBatchEvent()` — returns unsubscribe function

## Styling

**Design system** built on CSS custom properties + Tailwind extensions.

### Key tokens

- **Surfaces**: `bg-sidebar`, `bg-surface-1`, `bg-surface-2`, `bg-surface-3` — layered depth
- **Status colors**: `text-status-success`, `text-status-warning`, `text-status-danger`, `text-status-info`
- **Elevation**: `--elevation-base`, `--elevation-overlay` (inset highlights + shadows)
- **Motion**: `--motion-fast` (140ms), `--motion-base` (170ms), `--motion-slow` (220ms)
- **Control heights**: `control-xs` (1.25rem), `control-sm` (1.75rem), `control-md` (2.25rem), `control-lg` (2.5rem)

### Sidebar typography tokens (defined in tailwind.config.js)

Use these for sidebar elements — not generic `text-body-sm` or `ui-meta-text`:

| Token | Size | Weight | Purpose |
|-------|------|--------|---------|
| `text-sidebar-item` | 13px, lh 1rem | 400 | Nav items, workflow names |
| `text-sidebar-label` | 11px, lh 1rem | 500 | Project folder group headers |
| `text-sidebar-meta` | 10px, lh 0.875rem | 400 | Timestamps, helper text |

`section-kicker` (11px, fw 600, uppercase, tracked) stays for structural section dividers like "Threads".

### Content typography tokens

`text-body-sm` and `text-body-md` are approved content tokens (defined in `tailwind.config.js`) and can be used in components.

- `text-body-md` (14px) — default readable body text
- `text-body-sm` (13px) — compact body/controls copy
- `ui-body-text` is the utility equivalent of `text-body-md`
- `ui-meta-text` is for metadata/helper text

### Custom utility classes (in globals.css)

- `.surface-panel`, `.surface-elevated`, `.surface-soft`, `.surface-inset-card`, `.surface-depth-header` — layered surface styles
- `.surface-danger-soft`, `.surface-warning-soft` — soft severity surfaces
- `.section-kicker`, `.ui-title-text`, `.ui-body-text`, `.ui-meta-text`, `.ui-meta-label`, `.ui-body-text-medium` — content typography
- `.ui-motion-fast`, `.ui-motion-standard` — transition duration shortcuts
- `.ui-transition-colors`, `.ui-transition-surface`, `.ui-transition-opacity`, `.ui-transition-width` — transition property helpers
- `.ui-scroll-region` — containment + gutter management
- `.ui-interactive-card`, `.ui-pressable`, `.ui-icon-button`, `.ui-resize-handle` — interaction feedback
- `.ui-status-badge`, `.ui-status-badge-success|warning|danger|info` — status badge pattern
- `.ui-badge-row`, `.ui-empty-state`, `.ui-metric-text`, `.inline-code`, `.prose-c8c` — layout/content helpers
- `.control-cluster`, `.control-badge`, `.border-hairline`, `.ui-disclosure` — shared control primitives
- `.ui-elevation-base`, `.ui-elevation-inset`, `.ui-fade-slide-in` — elevation + motion composition
- `.sidebar-progress-track`, `.sidebar-progress-bar`, `.ui-content-shell` — app-shell and sidebar utilities

## Key Dependencies

- `@claude-tools/runner` — Claude CLI subprocess spawner (`file:` link to `../shared-claude-tools/packages/claude-runner`)
- `@xyflow/react` + `@dagrejs/dagre` — Canvas graph editor and auto-layout
- `gray-matter` — YAML frontmatter parsing from .md skill files
- `yaml` — Workflow YAML serialization
- `jotai` — Atomic state management
- `sonner` — Toast notifications

## Data Storage

- Projects config: `~/.c8c/config.json`
- Global workflows: `~/.c8c/chains/`
- Project workflows: `{project}/.c8c/*.yaml` or `{project}/.claude/workflows/*.yaml`

## Stack

Electron 39 + electron-vite, React 19, Tailwind CSS 3, Radix UI, Jotai, Lucide icons, Vitest.
