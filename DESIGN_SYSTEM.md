# DESIGN_SYSTEM.md

This file documents the c8c design system for Claude Code. Use these tokens, primitives, and rules when building or modifying UI.

## Sources of Truth

- **CSS variables**: `src/renderer/styles/globals.css` (:root + .dark)
- **Tailwind extensions**: `tailwind.config.js`
- **UI primitives**: `src/renderer/components/ui/`
- **Known debt**: `docs/ui-consistency-audit-2026-03-11.md`

## Color Palette

All colors are HSL via CSS custom properties. Light and dark mode defined in globals.css.

### Semantic colors

| Token | Usage |
|-------|-------|
| `background` / `foreground` | Page base |
| `card` / `card-foreground` | Card surfaces |
| `popover` / `popover-foreground` | Floating overlays |
| `primary` / `primary-foreground` | Primary actions (buttons, rings) |
| `secondary` / `secondary-foreground` | Secondary fills |
| `muted` / `muted-foreground` | Subdued backgrounds, helper text |
| `accent` / `accent-foreground` | Hover highlights |
| `destructive` / `destructive-foreground` | Danger actions |

### Surface layers

Three depth levels for nested containers:

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `surface-1` | white | 10% | Cards, panels, dialogs |
| `surface-2` | 96% | 12% | Recessed areas, hover fills |
| `surface-3` | 92% | 15% | Deep insets, active states |

### Sidebar

| Token | Usage |
|-------|-------|
| `sidebar` (bg) | Sidebar background |
| `sidebar-active` | Selected item background |
| `sidebar-hover` | Hovered item background |

### Sidebar List Primitives

For thread/workflow lists in sidebar, use these utility classes from `globals.css`:

| Class | Usage |
|-------|-------|
| `.sidebar-list-group` | Wrapper for one project/thread group block |
| `.sidebar-project-row` | Project/folder header row |
| `.sidebar-thread-row` | Thread/workflow list row |
| `.sidebar-thread-row--active` | Selected row state |
| `.sidebar-progress-track` | Thin progress track under active row |
| `.sidebar-progress-bar` | Progress fill inside track |

Rules:
- Keep list layout flat and lightweight; avoid heavy card borders around each row.
- Prefer one active highlight (`sidebar-active`) and subtle hover (`sidebar-hover`).
- Show progress bars only for actionable states (for example running/in-progress), not for every idle row.
- Keep row rhythm compact and consistent: one primary line + optional single meta line below.
- Running state is owner-based: show spinner/progress on the workflow that owns the active run, not on the currently selected row.
- For non-owner selected rows, show historical summary (`Last run`) instead of fake live progress.

### Borders

| Token | Usage |
|-------|-------|
| `border` | Standard border |
| `hairline` | Subtle dividers, shadow outlines |
| `input` | Input field borders |
| `input-background` | Input field fill |

### Status

| Token | Usage |
|-------|-------|
| `status-success` | Green — completed, pass |
| `status-warning` | Amber — caution |
| `status-danger` | Red — failed, error |
| `status-info` | Blue — running, info |

## Typography

### Tailwind font-size tokens

| Class | Size | Line-height | Weight | Usage |
|-------|------|-------------|--------|-------|
| `text-title-lg` | 1.75rem (28px) | 2.125rem | 600 | Page titles |
| `text-title-md` | 1.125rem (18px) | 1.5rem | 600 | Section headings, dialog titles |
| `text-title-sm` | 1rem (16px) | 1.375rem | 600 | Sub-section headings |
| `text-body-md` | 0.875rem (14px) | 1.25rem | — | Default body text |
| `text-body-sm` | 0.8125rem (13px) | 1.125rem | — | Compact body text, main content areas |
| `text-label-xs` | 0.75rem (12px) | 1rem | 600 | Labels, badges |

### Sidebar-specific tokens

Use these **exclusively** in sidebar — not generic `text-body-*` or `ui-meta-text`:

| Class | Size | Line-height | Weight | Usage |
|-------|------|-------------|--------|-------|
| `text-sidebar-item` | 0.8125rem (13px) | 1rem | — | Nav items, workflow names, interactive rows |
| `text-sidebar-label` | 0.6875rem (11px) | 1rem | 500 | Project folder group headers |
| `text-sidebar-meta` | 0.625rem (10px) | 0.875rem | — | Timestamps, helper text |

### CSS utility classes (globals.css)

| Class | Effect |
|-------|--------|
| `.section-kicker` | 11px, fw 600, uppercase, 0.11em tracking — structural section dividers |
| `.ui-title-text` | 28px, fw 600, -0.015em tracking — page titles |
| `.ui-body-text` | 14px, lh 1.25rem — body text |
| `.ui-meta-text` | 12px, lh 1rem, muted-foreground — metadata in main content |

### Font stack

```
"SF Pro Text", "SF Pro Display", "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

OpenType features enabled: `rlig`, `calt`.

## Spacing

8-step scale via CSS variables, available as Tailwind `p-space-*` / `m-space-*` / `gap-space-*`:

| Token | Value |
|-------|-------|
| `space-1` | 0.25rem (4px) |
| `space-2` | 0.5rem (8px) |
| `space-3` | 0.75rem (12px) |
| `space-4` | 1rem (16px) |
| `space-5` | 1.25rem (20px) |
| `space-6` | 1.5rem (24px) |
| `space-7` | 2rem (32px) |
| `space-8` | 2.5rem (40px) |

Additional rhythm variables (CSS-only, not in Tailwind):
- `--rhythm-1`: 0.5rem — `--rhythm-2`: 0.8125rem — `--rhythm-3`: 1.3125rem — `--rhythm-4`: 2.125rem
- `--content-gutter`: 1.5rem — `--dialog-gutter`: 1.5rem

### Spacing policy

- **Mode**: permissive.
- Prefer `*-space-*` utilities in shared primitives/layout wrappers and reusable component shells.
- Bare Tailwind spacing (for example `px-3`, `gap-2`) is allowed when the value is exactly on the approved spacing scale.
- Arbitrary spacing values must be treated as exceptions and documented.

### Opacity policy

- Preferred opacity checkpoints: `/10 /20 /30 /40 /50 /60 /70 /80 /90`.
- Avoid off-grid values such as `/17`, `/42`, `/85`, `/92+`; normalize to the nearest checkpoint.
- For shadows/elevation internals expressed as `rgba()` or `hsl(... / 0.xx)`, keep fine-grained values when needed for visual quality.

## Control Heights

Four sizes for buttons, inputs, and interactive elements:

| Token | Value | Usage |
|-------|-------|-------|
| `control-xs` | 1.25rem (20px) | Compact micro-controls (inline icon actions, tight toggles) |
| `control-sm` | 1.75rem (28px) | Compact controls, icon buttons |
| `control-md` | 2.25rem (36px) | Default buttons, inputs |
| `control-lg` | 2.5rem (40px) | Large CTAs |

Available as `h-control-xs|sm|md|lg`, `w-control-xs|sm|md|lg`, `min-h-control-xs|sm|md|lg`.

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded-sm` | `calc(var(--radius-control) - 2px)` ≈ 6px | Small elements inside controls |
| `rounded-md` | `var(--radius-control)` = 0.5rem (8px) | Buttons, inputs, interactive elements |
| `rounded-lg` | `var(--radius-container)` = 0.75rem (12px) | Cards, panels, dialogs |

**Rule**: use only `rounded-sm` / `rounded-md` / `rounded-lg` for standard UI. `rounded-full` only for true pills/avatars.

## Elevation

Two shadow levels combining inset highlight + hairline outline + drop shadow:

| Token | Usage |
|-------|-------|
| `--elevation-base` | Cards, panels, surfaces |
| `--elevation-overlay` | Dialogs, popovers, hover-lifted cards |
| `--inset-highlight` | Button/control inset highlight (swaps for dark mode) |
| `--inset-highlight-strong` | Stronger inset highlight for outline buttons |

Applied via:
- `.surface-panel` — base elevation on surface-1
- `.surface-elevated` — overlay elevation on surface-1
- `.surface-soft` — semi-transparent base elevation
- `.surface-depth-header` — surface-1→surface-2 gradient with hairline bottom border (dialog headers)

## Motion

| Token | Duration | Usage |
|-------|----------|-------|
| `--motion-fast` | 140ms | Hovers, toggles, micro-interactions |
| `--motion-base` | 170ms | Standard transitions |
| `--motion-slow` | 220ms | Emphasis animations |

Easing curves:
- `--ease-standard`: `cubic-bezier(0.2, 0, 0, 1)` — general purpose
- `--ease-emphasis`: `cubic-bezier(0.16, 1, 0.3, 1)` — entrance animations, emphasis

### Utility classes

| Class | Effect |
|-------|--------|
| `.ui-motion-fast` | `transition-duration: var(--motion-fast)` + standard easing |
| `.ui-motion-standard` | `transition-duration: var(--motion-base)` + standard easing |
| `.ui-pressable` | Full transition set + `scale(0.995)` on `:active` |
| `.ui-interactive-card` | `translateY(-1px)` + elevation-overlay on hover |
| `.ui-fade-slide-in` | Entrance: fade + 4px slide-up over `--motion-base` |
| `.lux-hover` | Slow emphasis transitions for premium hover feel |

All motion respects `prefers-reduced-motion: reduce`.

## UI Primitives

### Button (`ui/button.tsx`)

CVA variants via `class-variance-authority`:

**Variants**: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`
**Sizes**: `xs` (control-xs), `sm` (control-sm), `default` (control-md), `lg` (control-lg), `icon` (square control-sm)

Each variant includes its own shadow, inset highlight, and border treatment. All use `.ui-pressable` base.

### Badge (`ui/badge.tsx`)

**Variants**: `default`, `secondary`, `destructive`, `outline`

### Dialog (`ui/dialog.tsx`)

Two dialog styles:
- `DialogContent` — standard 600px dialog with close button
- `CanvasDialogContent` — compact 420px dialog for canvas/workflow actions
  - Uses `CanvasDialogHeader` / `CanvasDialogBody` / `CanvasDialogFooter` sub-components
  - Footer has `bg-surface-2/75` tinted background with top border

### Page Shell (`ui/page-shell.tsx`)

- `PageShell` — scrollable container, max-width 72rem, respects `--titlebar-height`
- `PageHeader` — title + subtitle + optional action cluster
- `SectionHeading` — section title with optional meta slot

### Other primitives

`Input`, `Textarea`, `Select`, `Tabs`, `Switch`, `Tooltip`, `ErrorBoundary`

## Platform Integration

- macOS titlebar: `--titlebar-height: 2rem` via `[data-platform="macos"]`
- Drag regions: `.drag-region` / `.no-drag` for Electron frameless window
- Dark mode: `.dark` class on root, full color remap

## Allowed Exceptions

1. **Canvas geometry**: React Flow handles and edge-routing visuals may keep non-control dimensions where library hit-area behavior depends on it.
2. **Elevation internals**: `rgba()`/`hsl(... / 0.xx)` shadow internals can use non-checkpoint opacity for anti-banding and depth consistency.
3. **Content width backlog**: arbitrary width tokens are temporarily allowed and tracked for tokenization:
   - `w-[168px]`, `w-[188px]`, `w-[196px]`, `w-[220px]`
   - `min-w-[156px]`, `min-w-[212px]`, `min-w-[280px]`
   - `max-w-[198px]`, `max-w-[248px]`, `max-w-[280px]`, `max-w-[340px]`, `max-w-[360px]`, `max-w-[380px]`, `max-w-[640px]`
   - `w-[420px]`, `w-[600px]`

## Known Issues and Constraints

Per `docs/ui-consistency-audit-2026-03-11.md`:

1. **Don't use raw Tailwind text sizes** (`text-xs`, `text-sm`, `text-lg`) in components — use the semantic tokens (`text-body-sm`, `text-title-md`, etc.)
2. **Don't hardcode font sizes** (`text-[24px]`, `text-[13px]`) — map to the nearest semantic token
3. **Prefer `Button` variants** over raw `<button>` with local class stacks
4. **Stick to 3 radius tiers** (`rounded-sm/md/lg`) — avoid mixing `rounded-xl`, bare `rounded`, etc.
5. **Sidebar uses its own type tokens** — `text-sidebar-item/label/meta`, not content tokens
6. **Limit text hierarchy per screen** to ~3 tiers (title, body, meta) plus monospace for logs
