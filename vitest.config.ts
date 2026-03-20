import { defineConfig } from "vitest/config"
import { resolve } from "path"

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "packages/**/*.test.ts"],
  },
  resolve: {
    alias: [
      { find: "@c8c/workflow-runner/node", replacement: resolve(__dirname, "packages/workflow-runner/src/node/index.ts") },
      { find: "@c8c/workflow-runner/schema", replacement: resolve(__dirname, "packages/workflow-runner/src/schema.ts") },
      { find: "@c8c/workflow-runner", replacement: resolve(__dirname, "packages/workflow-runner/src/index.ts") },
      { find: "@shared", replacement: resolve(__dirname, "src/shared") },
      { find: "@", replacement: resolve(__dirname, "src/renderer") },
    ],
  },
})
