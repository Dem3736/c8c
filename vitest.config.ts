import { defineConfig } from "vitest/config"
import { resolve } from "path"

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
      "@": resolve(__dirname, "src/renderer"),
      "@c8c/workflow-runner": resolve(__dirname, "packages/workflow-runner/src/index.ts"),
      "@c8c/workflow-runner/schema": resolve(__dirname, "packages/workflow-runner/src/schema.ts"),
    },
  },
})
