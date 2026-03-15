import { chmod, mkdir, rm, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { build } from "esbuild"
import { execFile as execFileCallback } from "node:child_process"
import { promisify } from "node:util"

const execFile = promisify(execFileCallback)
const packageRoot = resolve(import.meta.dirname, "..")
const repoRoot = resolve(packageRoot, "../..")
const distDir = resolve(packageRoot, "dist")
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"

async function writeDeclarationWrapper() {
  const wrapperPath = resolve(distDir, "index.d.ts")
  await mkdir(dirname(wrapperPath), { recursive: true })
  await writeFile(wrapperPath, "export {}\n")
}

await execFile(npmCommand, ["run", "build", "-w", "@c8c/workflow-runner"], {
  cwd: repoRoot,
})

await rm(distDir, { recursive: true, force: true })

await build({
  absWorkingDir: packageRoot,
  bundle: true,
  entryPoints: ["./src/index.ts"],
  external: [
    "electron",
    "@agentclientprotocol/sdk",
    "@anthropic-ai/claude-agent-sdk",
    "@claude-tools/runner",
    "@mcpc-tech/acp-ai-provider",
    "@zed-industries/codex-acp",
    "ai",
    "gray-matter",
  ],
  format: "esm",
  outfile: resolve(distDir, "index.js"),
  platform: "node",
  sourcemap: true,
  target: "node20",
  tsconfig: resolve(packageRoot, "tsconfig.json"),
})

await writeDeclarationWrapper()
await chmod(resolve(distDir, "index.js"), 0o755)
