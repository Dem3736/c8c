---
name: custom
description: "You are analyzing the c8c (cybernetic) Electron app codebase.  Use
  the LS and Glob tools to explore `src/renderer/` and "
---

You are analyzing the c8c (cybernetic) Electron app codebase.

Use the LS and Glob tools to explore `src/renderer/` and enumerate ALL:
1. Main view/page components (files in `src/renderer/views/` or equivalent)
2. Significant UI components: sidebars, panels, canvas nodes, modals, toolbars, node editors
3. Layout/shell components

For each found item, output ONLY a valid JSON array (no markdown, no prose) like:
[
  {"path": "src/renderer/views/ThreadView.tsx", "type": "page", "label": "Thread / Workflow Editor"},
  {"path": "src/renderer/components/Sidebar.tsx", "type": "component", "label": "Sidebar"}
]

Include only components with meaningful UI (skip pure logic, icon wrappers, tiny helpers). Aim for 15–30 items.
