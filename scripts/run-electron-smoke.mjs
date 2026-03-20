import { spawn } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const SCENARIOS = [
  "launch-empty",
  "seeded-project-sidebar",
  "command-palette-toggle",
  "settings-navigation",
  "quick-switch-rail",
  "canvas-add-recenter-delete",
  "approval-dialog",
  "create-ready-continuation",
  "blocked-relaunch",
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

function sanitizeTaskSegment(value) {
  return value.replace(/[^a-zA-Z0-9-]/g, "_")
}

async function writeJsonFixture(filePath, payload, updatedAtMs) {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(payload, null, 2))
  if (updatedAtMs) {
    const updatedAt = new Date(updatedAtMs)
    await utimes(filePath, updatedAt, updatedAt)
  }
}

async function writeTextFixture(filePath, content, updatedAtMs) {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, "utf-8")
  if (updatedAtMs) {
    const updatedAt = new Date(updatedAtMs)
    await utimes(filePath, updatedAt, updatedAt)
  }
}

async function writeRunWorkspaceFixture(projectPath, {
  runId,
  workflowName,
  workflowPath,
  status,
  updatedAtMs,
  reportBody,
}) {
  const workspace = join(projectPath, ".c8c", "runs", runId)
  const reportPath = join(workspace, "report.md")
  await mkdir(workspace, { recursive: true })
  await writeTextFixture(reportPath, reportBody, updatedAtMs)
  await writeJsonFixture(join(workspace, "run-result.json"), {
    runId,
    status,
    workflowName,
    workflowPath,
    startedAt: updatedAtMs - 5_000,
    completedAt: updatedAtMs,
    reportPath,
    workspace,
  }, updatedAtMs)
  return { workspace, reportPath }
}

async function writeArtifactFixture(projectPath, {
  baseName,
  id,
  kind,
  title,
  description,
  workspace,
  runId,
  templateId,
  templateName,
  workflowPath,
  workflowName,
  caseId,
  caseLabel,
  factoryId,
  factoryLabel,
  updatedAtMs,
  content,
}) {
  const artifactsDir = join(projectPath, ".c8c", "artifacts")
  const contentPath = join(artifactsDir, `${baseName}.md`)
  const metadataPath = join(artifactsDir, `${baseName}.json`)
  const relativePath = `.c8c/artifacts/${baseName}.md`
  const createdAt = updatedAtMs - 2_000

  const metadata = {
    version: 1,
    id,
    kind,
    title,
    description,
    factoryId,
    factoryLabel,
    caseId,
    caseLabel,
    projectPath,
    workspace,
    runId,
    templateId,
    templateName,
    workflowPath,
    workflowName,
    relativePath,
    contentPath,
    metadataPath,
    createdAt,
    updatedAt: updatedAtMs,
    contract: {
      kind,
      title,
      ...(description ? { description } : {}),
    },
  }

  await writeTextFixture(contentPath, content, updatedAtMs)
  await writeJsonFixture(metadataPath, metadata, updatedAtMs)
  return metadata
}

async function writeCaseStateFixture(projectPath, fileName, record, updatedAtMs) {
  await writeJsonFixture(
    join(projectPath, ".c8c", "case-state", `${fileName}.json`),
    {
      version: 1,
      ...record,
    },
    updatedAtMs,
  )
}

async function writeApprovalTaskFixture({
  workspace,
  runId,
  workflowName,
  workflowPath,
  projectPath,
  nodeId,
  title,
  summary,
  instructions,
  allowEdit,
  updatedAtMs,
}) {
  const taskId = `approval-${sanitizeTaskSegment(nodeId)}`
  const taskDir = join(workspace, "human-tasks", taskId)
  const request = {
    version: 1,
    kind: "approval",
    title,
    instructions,
    summary,
    fields: [
      {
        id: "approved",
        type: "boolean",
        label: "Approve changes",
        required: true,
      },
    ],
    defaults: { approved: true },
    metadata: {
      generatedByNodeId: nodeId,
      priority: "normal",
      allowEdit,
    },
  }
  const state = {
    version: 1,
    taskId,
    chainId: workspace,
    sourceRunId: runId,
    kind: "approval",
    checkpointKind: "approval",
    status: "open",
    workspace,
    nodeId,
    workflowName,
    workflowPath,
    projectPath,
    title,
    instructions,
    summary,
    allowEdit,
    requestHash: "smoke-fixture",
    responseRevision: 0,
    createdAt: updatedAtMs - 1_000,
    updatedAt: updatedAtMs,
  }

  await mkdir(join(taskDir, "responses"), { recursive: true })
  await writeJsonFixture(join(taskDir, "request.json"), request, updatedAtMs)
  await writeJsonFixture(join(taskDir, "state.json"), state, updatedAtMs)
}

async function seedCreateReadyContinuationProject(projectPath, updatedAtMs) {
  const caseId = "case:delivery-foundation:checkout-polish"
  const workflowName = "Delivery Lab: Research the Change"
  const { workspace } = await writeRunWorkspaceFixture(projectPath, {
    runId: "run-ready-research",
    workflowName,
    workflowPath: join(projectPath, ".c8c", "delivery-research-phase.chain"),
    status: "completed",
    updatedAtMs,
    reportBody: "# Research Pack\n\nCheckout polish constraints and open questions.\n",
  })

  const artifact = await writeArtifactFixture(projectPath, {
    baseName: "run-ready-research-research-pack",
    id: "run-ready-research:research_pack",
    kind: "research_pack",
    title: "Research Pack",
    description: "Evidence and constraints for checkout polish.",
    workspace,
    runId: "run-ready-research",
    templateId: "delivery-research-phase",
    templateName: workflowName,
    workflowPath: join(projectPath, ".c8c", "delivery-research-phase.chain"),
    workflowName,
    caseId,
    caseLabel: "Checkout polish",
    factoryId: "factory:delivery-foundation",
    factoryLabel: "Delivery Lab",
    updatedAtMs,
    content: "# Research Pack\n\nEvidence and risks for checkout polish.\n",
  })

  await writeCaseStateFixture(projectPath, "checkout-polish-ready", {
    caseId,
    projectPath,
    workLabel: "Checkout polish",
    caseLabel: "Checkout polish",
    factoryId: "factory:delivery-foundation",
    factoryLabel: "Delivery Lab",
    workflowPath: artifact.workflowPath,
    workflowName,
    continuationStatus: "ready",
    nextStepLabel: "Plan the Change",
    artifactIds: [artifact.id],
    lastGate: {
      family: "review_check",
      outcome: "passed",
      summaryText: "Research pack saved. Planning can continue.",
      reasonText: "The latest research pass completed successfully.",
      stepLabel: "Plan the Change",
      happenedAt: updatedAtMs,
    },
    createdAt: updatedAtMs - 2_000,
    updatedAt: updatedAtMs,
  }, updatedAtMs)
}

async function seedBlockedRelaunchProject(projectPath, updatedAtMs) {
  const workflowName = "Blocked approval flow"
  const workflowPath = await writeWorkflowFixture(
    projectPath,
    "blocked-approval-flow",
    buildApprovalWorkflow(workflowName),
    updatedAtMs - 500,
  )
  const caseId = "case:delivery-foundation:checkout-polish"
  const { workspace } = await writeRunWorkspaceFixture(projectPath, {
    runId: "run-blocked-approval",
    workflowName,
    workflowPath,
    status: "blocked",
    updatedAtMs,
    reportBody: "# Verification Report\n\nVerification is waiting on approval.\n",
  })

  const artifact = await writeArtifactFixture(projectPath, {
    baseName: "run-blocked-approval-verification-report",
    id: "run-blocked-approval:verification_report",
    kind: "verification_report",
    title: "Verification Report",
    description: "Verification findings for checkout polish.",
    workspace,
    runId: "run-blocked-approval",
    templateId: "delivery-verify-phase",
    templateName: "Delivery Lab: Verify the Change",
    workflowPath,
    workflowName,
    caseId,
    caseLabel: "Checkout polish",
    factoryId: "factory:delivery-foundation",
    factoryLabel: "Delivery Lab",
    updatedAtMs,
    content: "# Verification Report\n\nCheckout polish is ready for approval.\n",
  })

  await writeCaseStateFixture(projectPath, "checkout-polish-blocked", {
    caseId,
    projectPath,
    workLabel: "Checkout polish",
    caseLabel: "Checkout polish",
    factoryId: "factory:delivery-foundation",
    factoryLabel: "Delivery Lab",
    workflowPath,
    workflowName,
    continuationStatus: "awaiting_approval",
    artifactIds: [artifact.id],
    lastGate: {
      family: "approval",
      outcome: "awaiting_human",
      summaryText: "Approval pending. Review block before verification continues.",
      reasonText: "Waiting for an approval decision before the flow can continue.",
      stepLabel: "Verify the Change",
      happenedAt: updatedAtMs,
    },
    createdAt: updatedAtMs - 2_000,
    updatedAt: updatedAtMs,
  }, updatedAtMs)

  await writeApprovalTaskFixture({
    workspace,
    runId: "run-blocked-approval",
    workflowName,
    workflowPath,
    projectPath,
    nodeId: "approval",
    title: "Review block",
    summary: "Confirm whether the checkout polish is ready for verification.",
    instructions: "Approve the verification report before this flow can continue.",
    allowEdit: false,
    updatedAtMs: updatedAtMs + 250,
  })
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

  if (scenario === "create-ready-continuation") {
    await seedCreateReadyContinuationProject(projectAlpha, baseTime + 3_000)
    return [projectAlpha]
  }

  if (scenario === "blocked-relaunch") {
    await seedBlockedRelaunchProject(projectAlpha, baseTime + 4_000)
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
