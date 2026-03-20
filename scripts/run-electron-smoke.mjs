import { spawn } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const SCENARIOS = [
  "launch-empty",
  "seeded-project-sidebar",
  "command-palette-toggle",
  "settings-navigation",
  "quick-switch-rail",
  "canvas-add-recenter-delete",
  "approval-dialog",
]

const require = createRequire(import.meta.url)
const electronBinary = require("electron")
const scriptDir = fileURLToPath(new URL(".", import.meta.url))
const repoRoot = resolve(scriptDir, "..")
const artifactRoot = resolve(repoRoot, "output", "ui-smoke")

function printHelp() {
  process.stdout.write(`Usage: node scripts/run-electron-smoke.mjs [all|<scenario>] [options]

Options:
  --scenario <name>                 Run a single smoke scenario
  --scenario=<name>                 Run a single smoke scenario
  --show-window                     Show the Electron window during smoke
  --json                            Print a JSON summary to stdout
  --keep-artifacts-on-success       Keep output/ui-smoke/<scenario> on success
  --no-keep-artifacts-on-success    Remove successful scenario artifacts
  --help                            Show this help
`)
}

function resolveScenarioSelection(requested) {
  if (!requested || requested === "all") return SCENARIOS
  if (!SCENARIOS.includes(requested)) {
    throw new Error(`Unknown Electron smoke scenario: ${requested}`)
  }
  return [requested]
}

function parseCliOptions(argv, env = process.env) {
  let requestedScenario = null
  let showWindow = env.C8C_SMOKE_SHOW_WINDOW === "1"
  let json = false
  let keepArtifactsOnSuccess = env.C8C_SMOKE_KEEP_ARTIFACTS_ON_SUCCESS === "1" || !env.CI

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--help") {
      printHelp()
      process.exit(0)
    }
    if (arg === "--json") {
      json = true
      continue
    }
    if (arg === "--show-window") {
      showWindow = true
      continue
    }
    if (arg === "--keep-artifacts-on-success") {
      keepArtifactsOnSuccess = true
      continue
    }
    if (arg === "--no-keep-artifacts-on-success") {
      keepArtifactsOnSuccess = false
      continue
    }
    if (arg === "--scenario") {
      const nextArg = argv[index + 1]?.trim()
      if (!nextArg) {
        throw new Error("--scenario requires a value")
      }
      requestedScenario = nextArg
      index += 1
      continue
    }
    if (arg.startsWith("--scenario=")) {
      requestedScenario = arg.slice("--scenario=".length).trim()
      continue
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`)
    }
    if (requestedScenario) {
      throw new Error(`Unexpected extra positional argument: ${arg}`)
    }
    requestedScenario = arg.trim()
  }

  return {
    scenarios: resolveScenarioSelection(requestedScenario),
    showWindow,
    json,
    keepArtifactsOnSuccess,
  }
}

function buildWorkflowNode(id, type, x, y, config) {
  return {
    id,
    type,
    position: { x, y },
    config,
  }
}

function buildLinearWorkflow(name, skillRef) {
  return {
    version: 1,
    name,
    description: `${name} smoke fixture`,
    nodes: [
      buildWorkflowNode("input", "input", 0, 120, {
        inputType: "text",
        required: true,
      }),
      buildWorkflowNode("skill-main", "skill", 280, 120, {
        skillRef,
        prompt: `Run ${skillRef}`,
      }),
      buildWorkflowNode("output", "output", 560, 120, {
        title: `${name} output`,
        format: "markdown",
      }),
    ],
    edges: [
      { id: "e-input-skill-main", source: "input", target: "skill-main", type: "default" },
      { id: "e-skill-main-output", source: "skill-main", target: "output", type: "default" },
    ],
    canvasLayout: {
      input: { x: 0, y: 120 },
      "skill-main": { x: 280, y: 120 },
      output: { x: 560, y: 120 },
    },
  }
}

function buildApprovalWorkflow(name) {
  return {
    version: 1,
    name,
    description: `${name} smoke fixture`,
    nodes: [
      buildWorkflowNode("input", "input", 0, 120, {
        inputType: "text",
        required: true,
      }),
      buildWorkflowNode("skill-plan", "skill", 260, 120, {
        skillRef: "research/plan",
        prompt: "Draft the plan to review",
      }),
      buildWorkflowNode("approval", "approval", 520, 120, {
        message: "Review and approve this step before continuing.",
        show_content: true,
        allow_edit: false,
      }),
      buildWorkflowNode("output", "output", 780, 120, {
        title: `${name} output`,
        format: "markdown",
      }),
    ],
    edges: [
      { id: "e-input-skill-plan", source: "input", target: "skill-plan", type: "default" },
      { id: "e-skill-plan-approval", source: "skill-plan", target: "approval", type: "default" },
      { id: "e-approval-output", source: "approval", target: "output", type: "default" },
    ],
    canvasLayout: {
      input: { x: 0, y: 120 },
      "skill-plan": { x: 260, y: 120 },
      approval: { x: 520, y: 120 },
      output: { x: 780, y: 120 },
    },
  }
}

async function writeWorkflowFixture(projectPath, fileName, workflow, updatedAtMs) {
  const workflowPath = join(projectPath, ".c8c", `${fileName}.chain`)
  const updatedAt = new Date(updatedAtMs)
  await mkdir(join(projectPath, ".c8c"), { recursive: true })
  await writeFile(workflowPath, JSON.stringify(workflow, null, 2))
  await utimes(workflowPath, updatedAt, updatedAt)
  return workflowPath
}

async function seedScenarioProjects(workspaceDir, scenario) {
  if (scenario === "launch-empty" || scenario === "command-palette-toggle" || scenario === "settings-navigation") {
    return []
  }

  const projectAlpha = join(workspaceDir, "project-alpha")
  await mkdir(projectAlpha, { recursive: true })

  if (scenario === "seeded-project-sidebar") {
    return [projectAlpha]
  }

  const baseTime = Date.now() - 60_000
  if (scenario === "quick-switch-rail") {
    await writeWorkflowFixture(projectAlpha, "beta-flow", buildLinearWorkflow("Beta flow", "research/beta"), baseTime + 1_000)
    await writeWorkflowFixture(projectAlpha, "alpha-flow", buildLinearWorkflow("Alpha flow", "research/alpha"), baseTime + 2_000)
    return [projectAlpha]
  }

  if (scenario === "canvas-add-recenter-delete") {
    await writeWorkflowFixture(projectAlpha, "canvas-flow", buildLinearWorkflow("Canvas flow", "research/canvas"), baseTime + 1_000)
    return [projectAlpha]
  }

  await writeWorkflowFixture(projectAlpha, "approval-flow", buildApprovalWorkflow("Approval flow"), baseTime + 1_000)
  return [projectAlpha]
}

function runElectronScenario({
  scenario,
  homeDir,
  userDataDir,
  outputDir,
  projects,
  selectedProject,
  showWindow,
}) {
  return new Promise((resolvePromise) => {
    const env = {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
      C8C_TEST_MODE: "1",
      C8C_TEST_HOME_DIR: homeDir,
      C8C_TEST_USER_DATA_DIR: userDataDir,
      C8C_SMOKE_SCENARIO: scenario,
      C8C_SMOKE_OUTPUT_DIR: outputDir,
      C8C_SMOKE_PROJECTS: JSON.stringify(projects),
      C8C_SMOKE_SELECTED_PROJECT: selectedProject ?? "",
      C8C_SMOKE_SHOW_WINDOW: showWindow ? "1" : "",
      ELECTRON_ENABLE_LOGGING: "1",
    }

    const child = spawn(electronBinary, ["."], {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, 30_000)

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })

    child.on("close", (code, signal) => {
      clearTimeout(timeout)
      resolvePromise({
        code,
        signal,
        stdout,
        stderr,
        timedOut,
      })
    })
  })
}

async function loadScenarioReport(outputDir) {
  try {
    return JSON.parse(await readFile(join(outputDir, "report.json"), "utf8"))
  } catch {
    return null
  }
}

async function main() {
  const options = parseCliOptions(process.argv)
  const scenarios = options.scenarios
  const runRoot = await mkdtemp(join(tmpdir(), "c8c-electron-smoke-"))
  await mkdir(artifactRoot, { recursive: true })
  const failures = []
  const scenarioSummaries = []
  const logLine = (line) => {
    const target = options.json ? process.stderr : process.stdout
    target.write(`${line}\n`)
  }

  for (const scenario of scenarios) {
    const scenarioRoot = join(runRoot, scenario)
    const homeDir = join(scenarioRoot, "home")
    const userDataDir = join(scenarioRoot, "userData")
    const workspaceDir = join(scenarioRoot, "workspace")
    const outputDir = join(artifactRoot, scenario)

    await rm(outputDir, { recursive: true, force: true })
    await Promise.all([
      mkdir(homeDir, { recursive: true }),
      mkdir(userDataDir, { recursive: true }),
      mkdir(workspaceDir, { recursive: true }),
      mkdir(outputDir, { recursive: true }),
    ])
    const projects = await seedScenarioProjects(workspaceDir, scenario)
    const selectedProject = projects[0] ?? null

    logLine(`Running Electron smoke scenario: ${scenario}`)
    const result = await runElectronScenario({
      scenario,
      homeDir,
      userDataDir,
      outputDir,
      projects,
      selectedProject,
      showWindow: options.showWindow,
    })

    await Promise.all([
      writeFile(join(outputDir, "stdout.log"), result.stdout),
      writeFile(join(outputDir, "stderr.log"), result.stderr),
    ])
    const report = await loadScenarioReport(outputDir)

    if (result.code !== 0) {
      failures.push({
        scenario,
        code: result.code,
        signal: result.signal,
        timedOut: result.timedOut,
      })
      scenarioSummaries.push({
        scenario,
        ok: false,
        outputDir,
        artifactsRetained: true,
        assertionsCount: report?.assertions?.length ?? 0,
        unexpectedRendererConsoleCount: report?.rendererConsole?.length ?? 0,
        ignoredRendererConsoleCount: report?.ignoredRendererConsole?.length ?? 0,
        error: report?.error ?? null,
      })
      logLine(`  failed -> ${outputDir}`)
      continue
    }

    scenarioSummaries.push({
      scenario,
      ok: true,
      outputDir: options.keepArtifactsOnSuccess ? outputDir : null,
      artifactsRetained: options.keepArtifactsOnSuccess,
      assertionsCount: report?.assertions?.length ?? 0,
      unexpectedRendererConsoleCount: report?.rendererConsole?.length ?? 0,
      ignoredRendererConsoleCount: report?.ignoredRendererConsole?.length ?? 0,
      error: null,
    })
    if (!options.keepArtifactsOnSuccess) {
      await rm(outputDir, { recursive: true, force: true })
    }
    logLine(`  passed -> ${options.keepArtifactsOnSuccess ? outputDir : "(artifacts cleaned)"}`)
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      const target = options.json ? process.stderr : process.stderr
      target.write(
        `Smoke failed: ${failure.scenario} (code=${failure.code ?? "null"}, signal=${failure.signal ?? "null"}, timedOut=${failure.timedOut})\n`,
      )
    }
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      ok: failures.length === 0,
      artifactRoot,
      keepArtifactsOnSuccess: options.keepArtifactsOnSuccess,
      scenarios: scenarioSummaries,
    }, null, 2)}\n`)
  }

  if (failures.length > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
  process.exitCode = 1
})
