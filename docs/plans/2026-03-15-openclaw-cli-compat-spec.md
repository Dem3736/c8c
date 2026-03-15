# OpenClaw-Compatible CLI Spec

## Summary

`chain-runner` already has most of the runtime primitives needed for OpenClaw integration:

- headless workflow execution
- persisted workspace state
- approval nodes
- resume and rerun support

The missing piece is not a new workflow engine. It is a compatibility layer for the
OpenClaw `lobster` tool contract plus a runtime and CLI upgrade so human-in-the-loop
checkpoints can suspend and resume across separate CLI invocations.

OpenClaw compatibility alone is not sufficient. The local CLI must also expose
first-class HIL operations, otherwise the only supported path is machine-to-machine
resume and there is no durable operator workflow on top of the CLI itself.

This spec defines that combined target and breaks delivery into staged releases.

## Research Summary

### OpenClaw side

From `../openclaw` and official docs:

- OpenClaw does not require our binary to literally be named `lobster`.
  Its plugin can call any configured executable via `lobsterPath`.
- The plugin contract is narrow:
  - `run --mode tool <pipeline> [--args-json ...]`
  - `resume --token <token> --approve yes|no`
- Stdout must be a JSON envelope:
  - success: `ok: true`, `status: "ok" | "needs_approval" | "cancelled"`
  - failure: `ok: false`, `error`
- Approval flow is resumable:
  - first call returns `needs_approval` plus `resumeToken`
  - second call resumes using that token

### Current `chain-runner` CLI side

Current `packages/workflow-cli` behavior is not yet true HIL:

- it understands `approval-requested`
- it supports `--auto-approve`
- without `--auto-approve`, it effectively treats approval as a terminal CLI condition
- it does not expose a durable `hil list/show/respond` command surface
- it does not expose a transport layer for out-of-band delivery such as Telegram

That gap matters because OpenClaw compatibility depends on resumable suspension, but
real operators also need a human-facing path on top of the same workspace artifacts.

### Long-running jobs in OpenClaw

OpenClaw has three distinct patterns:

- `heartbeat`
  - periodic, context-aware checks in the main session
  - best for recurring awareness tasks
- `cron`
  - exact-time scheduling
  - supports isolated sessions and delivery
- `sessions_spawn`
  - fire-and-forget background sub-agents
  - best for non-blocking work initiated from chat

`Lobster` is not the scheduler. It is the deterministic workflow runtime that
executes steps after one of those triggers decides the run should happen.

### ClawHub side

ClawHub distributes skills, not general binaries.

That means distribution splits into two layers:

- binary distribution for the CLI compatibility shim
- optional ClawHub skill distribution for the OpenClaw-side instructions,
  conventions, and example prompts that use the shim

## Goal

Make `chain-runner` callable from OpenClaw as a Lobster-compatible workflow
runtime for deterministic pipelines with resumable human-in-the-loop checkpoints,
while also exposing a native CLI HIL surface for local operators and optional
delivery adapters such as Telegram.

## Non-Goals

- Implement the full Lobster DSL parser
- Replace OpenClaw scheduling with a separate scheduler in `chain-runner`
- Reproduce OpenClaw Gateway, cron, heartbeat, or sub-agent features inside this repo
- Promise byte-for-byte parity with Lobster internals
- Support arbitrary shell pipelines in v1

## Compatibility Definition

For v1, “OpenClaw-compatible” means:

1. OpenClaw can invoke our executable through the existing Lobster plugin.
2. `run --mode tool` works against a `chain-runner` workflow file path.
3. HIL checkpoints can suspend the run and return a resumable token.
4. `resume --token ... --approve yes|no` continues from the suspended approval-style checkpoint.
5. Stdout is a valid Lobster-style JSON envelope.

For v1, “CLI HIL support” means:

1. The same suspended run can be inspected and resolved without OpenClaw.
2. The CLI exposes task-oriented commands against persisted HIL artifacts.
3. A local delivery bridge can be implemented purely on top of the CLI commands.
4. Telegram is an optional adapter, not a requirement for core runtime correctness.

For v1, “OpenClaw-compatible” does **not** mean:

- full Lobster DSL support
- shell pipe execution
- OpenClaw-native UI rendering beyond the generic tool result view

## Target User Flows

### Flow A: direct workflow run from OpenClaw

1. OpenClaw calls the Lobster plugin.
2. Plugin launches our compatibility binary.
3. Binary runs a workflow file from disk.
4. Binary returns either:
   - `status: "ok"` with run summary
   - `status: "needs_approval"` with `resumeToken`
   - `status: "cancelled"` if approval was rejected

### Flow B: scheduled run

1. OpenClaw `cron` or `heartbeat` decides a run should happen.
2. Agent/tool invokes the Lobster plugin.
3. Plugin launches our compatibility binary.
4. Workflow runs inside `chain-runner`, not inside the OpenClaw scheduler.

### Flow C: background run from chat

1. An OpenClaw agent uses `sessions_spawn`.
2. The spawned run eventually calls the Lobster plugin.
3. Plugin launches our compatibility binary.
4. Result is announced back by OpenClaw.

### Flow D: local operator resolves HIL from CLI

1. A workflow suspends on a HIL checkpoint.
2. The CLI returns a resumable token and persists task artifacts in the workspace.
3. Operator runs `c8c-workflow hil list` or `hil show`.
4. Operator resolves the task with `hil respond`, `hil approve`, or `hil reject`.
5. The next CLI/OpenClaw resume continues deterministically from persisted state.

### Flow E: Telegram delivery on top of CLI

1. A local Telegram bridge watches open HIL tasks through CLI commands.
2. When a new task appears, the bridge sends a Telegram message to a configured chat.
3. The user responds in Telegram.
4. The bridge maps the Telegram action back to `c8c-workflow hil ...` commands.
5. The underlying workflow continues through the same persisted task state as any other CLI path.

## Product Decision

We should build a **compatibility shim**, not a clone of Lobster.

The correct architecture is:

- OpenClaw owns trigger/orchestration surface:
  - cron
  - heartbeat
  - sub-agents
- `chain-runner` owns deterministic workflow execution
- a thin compatibility contract bridges the two
- a native HIL CLI layer sits beside that compatibility contract
- delivery adapters such as Telegram sit on top of the native HIL CLI layer

## External Contract

### Command surface

#### Run

```bash
chain-runner-openclaw run --mode tool <workflow-path> [--args-json '<json>']
```

Rules:

- `--mode tool` is required for OpenClaw compatibility mode
- `<workflow-path>` points to a local workflow file
- supported file formats in v1:
  - `.json`
  - `.yaml`
  - `.yml`

`argsJson` v1 schema:

```json
{
  "input": "string",
  "inputType": "text",
  "projectPath": "/abs/path/optional",
  "provider": "claude"
}
```

Notes:

- `input` may later expand to structured objects, but v1 should stay minimal
- if omitted, input defaults to empty text

#### Resume

```bash
chain-runner-openclaw resume --token <token> --approve yes|no
```

Rules:

- token must carry enough information to find the suspended workspace
- `yes` continues past the approval node
- `no` finalizes the run as cancelled/rejected from OpenClaw’s perspective

### Native HIL CLI contract

These commands are not required by OpenClaw's Lobster plugin, but they are required
for `chain-runner` to have first-class CLI HIL support.

#### List open tasks

```bash
c8c-workflow hil list [--project PATH] [--json]
```

Returns the currently open HIL tasks derived from persisted workspace artifacts.

#### Show task details

```bash
c8c-workflow hil show --task <task-id> [--json]
```

Returns request payload, workflow context, workspace, timestamps, and current status.

#### Submit structured response

```bash
c8c-workflow hil respond --task <task-id> --data-json '<json>' [--comment TEXT] [--idempotency-key KEY]
```

Rules:

- `data-json` must be valid against the task schema
- the response is persisted before any attempt to continue execution
- repeated calls with the same idempotency key must be safe

#### Approve / reject convenience commands

```bash
c8c-workflow hil approve --task <task-id> [--comment TEXT] [--idempotency-key KEY]
c8c-workflow hil reject --task <task-id> [--comment TEXT] [--idempotency-key KEY]
```

These map to the generic response path for approval-style checkpoints.

### Telegram bridge contract

Telegram delivery is an optional local adapter on top of the native HIL CLI.

Recommended shape:

```bash
c8c-workflow hil telegram serve --config /abs/path/hil-telegram.json
```

Minimal config:

```json
{
  "botTokenEnv": "C8C_TELEGRAM_BOT_TOKEN",
  "chatId": "123456789",
  "allowedUserIds": ["123456789"],
  "pollIntervalSec": 10
}
```

Rules:

- the Telegram bridge must not become the source of truth for task state
- it may only read and write through the same persisted HIL task store / CLI commands
- bot credentials should come from env, not be stored in plaintext config by default
- Telegram support is a local operator convenience layer, not part of the OpenClaw plugin contract

### Stdout envelope

#### Success

```json
{
  "ok": true,
  "status": "ok",
  "output": [
    {
      "type": "run_summary",
      "runId": "run-123",
      "workspace": "/abs/path",
      "reportPath": "/abs/path/report.md",
      "durationMs": 1234
    }
  ],
  "requiresApproval": null
}
```

#### Needs approval

```json
{
  "ok": true,
  "status": "needs_approval",
  "output": [
    {
      "type": "run_summary",
      "runId": "run-123",
      "workspace": "/abs/path"
    }
  ],
  "requiresApproval": {
    "type": "approval_request",
    "prompt": "Approve publishing these changes?",
    "items": [
      {
        "nodeId": "approval-1",
        "content": "preview text",
        "allowEdit": false
      }
    ],
    "resumeToken": "..."
  }
}
```

For generic HIL tasks that are richer than yes/no approval, the OpenClaw-facing
compatibility envelope may still use `status: "needs_approval"` for Lobster
compatibility, but the payload should distinguish the task kind:

```json
{
  "ok": true,
  "status": "needs_approval",
  "output": [
    {
      "type": "run_summary",
      "runId": "run-123",
      "workspace": "/abs/path"
    }
  ],
  "requiresApproval": {
    "type": "human_task",
    "taskId": "task-01",
    "title": "Fill missing production inputs",
    "fields": [
      {
        "id": "target_volume",
        "type": "number",
        "label": "Target monthly volume"
      }
    ],
    "resumeToken": "..."
  }
}
```

#### Cancelled

```json
{
  "ok": true,
  "status": "cancelled",
  "output": [
    {
      "type": "run_summary",
      "runId": "rerun-456",
      "workspace": "/abs/path"
    }
  ],
  "requiresApproval": null
}
```

#### Error

```json
{
  "ok": false,
  "error": {
    "type": "runtime_error",
    "message": "Workflow file not found"
  }
}
```

## Runtime Requirements

### HIL suspension

Current `chain-runner` approval behavior is process-local: it waits inside the
same run until approval arrives. OpenClaw compatibility and real CLI HIL support
require cross-process
suspension.

Required runtime behavior:

1. approval or `human` node enters a persisted waiting state
2. run persists state without failing the node
3. run exits with internal status `blocked` or a temporary compatibility equivalent
4. OpenClaw-facing `run --mode tool` maps that internal state to `status: "needs_approval"`
5. later invocation writes the HIL decision into persisted workspace state
6. resume continues from the waiting node without re-running completed nodes

### Resume token

v1 token requirements:

- opaque to OpenClaw
- generated by `chain-runner`
- enough to locate:
  - workspace
  - task id or waiting node id
  - compatibility context

Recommended implementation:

- base64url JSON token
- minimal payload:
  - `version`
  - `workspace`
  - `taskId`

Compatibility context should be persisted in the workspace, not fully encoded
into the token. That keeps tokens short and resilient to future schema growth.

### Persisted compatibility context

Store a sidecar file in the run workspace:

```json
{
  "workflowPath": "/abs/path/workflow.yaml",
  "workflow": { "...": "parsed workflow snapshot" },
  "projectPath": "/abs/path/project",
  "provider": "claude",
  "taskId": "task-01",
  "checkpointKind": "approval"
}
```

Why:

- resume should keep working if current cwd changes
- workflow file should still be resumable even if moved or edited later
- provider override must survive the first process exit

## File Format Support

v1 workflow loading must support:

- JSON
- YAML

v1 explicitly does not support:

- Lobster DSL text pipelines
- arbitrary shell pipes

If a pipeline argument is not a readable workflow file, the CLI should return a
clear envelope error explaining that v1 supports workflow file paths only.

## Distribution Strategy

### Binary distribution

Primary path:

- publish the compatibility binary as part of the npm package

Recommended binary names:

- `c8c-workflow`
- `chain-runner-openclaw`

OpenClaw can point its Lobster plugin to the absolute binary path via
`lobsterPath`.

### ClawHub distribution

ClawHub should be treated as an **optional distribution layer for the OpenClaw
usage pattern**, not as the primary binary delivery channel.

Use ClawHub for:

- a skill that teaches the agent when and how to invoke our compatible runtime
- example prompts
- example workflow file layout
- setup instructions for `lobsterPath`

Do not use ClawHub as the only delivery mechanism for the binary itself.

## Observability

Minimum required fields in v1 output:

- `runId`
- `chainId`
- `workspace`
- `reportPath` when available
- `durationMs`
- `status`
- `taskId` when a HIL checkpoint is open

Nice-to-have later:

- token usage
- cost
- node-level summary
- approval audit trail
- delivery audit trail for Telegram or other local transports

## Security Constraints

v1 must keep the surface narrow:

- no arbitrary shell pipeline execution
- no arbitrary cwd escape from what the caller already controls
- no arbitrary executable selection by the OpenClaw agent
- resume token must be validated before use

## Acceptance Criteria

### v1 acceptance

- OpenClaw Lobster plugin can call the binary via configured `lobsterPath`
- `run --mode tool` succeeds for a local workflow file
- approval node returns `needs_approval` instead of failing
- `resume --token ... --approve yes` completes the run
- `resume --token ... --approve no` returns `cancelled`
- output is valid JSON envelope with no extra stdout noise

### CLI HIL baseline acceptance

- suspended tasks are discoverable through `c8c-workflow hil list`
- task payload is inspectable through `c8c-workflow hil show`
- a human can resolve a task without OpenClaw through CLI commands alone
- the OpenClaw path and CLI path share the same persisted task store

## Release Plan

### Release 0: Spec and Alignment

Goal:

- freeze the contract before implementation

Scope:

- this spec
- sample envelopes
- exact v1 non-goals
- agreement on distribution model

Exit criteria:

- contract accepted
- no implementation started beyond exploratory spikes

### Release 1: Compatibility Alpha

Goal:

- make the CLI invokable from OpenClaw in the simplest happy path

Scope:

- `run --mode tool`
- `resume --token --approve yes|no`
- JSON envelope writer
- opaque resume token
- JSON/YAML workflow loading
- one binary name dedicated to OpenClaw usage
- no fake HIL: if a task suspends, the contract must preserve resumability instead of auto-rejecting

Out of scope:

- multi-approval workflows
- Telegram delivery
- ClawHub packaging
- scheduler examples

Exit criteria:

- manual OpenClaw invocation works locally
- compatibility run path works without extra stdout noise

### Release 2: HIL-Safe Beta

Goal:

- make human checkpoints first-class and resumable

Scope:

- runtime `blocked` status or explicit compatibility mapping
- suspend-on-HIL semantics
- persisted compatibility context in workspace
- resume from waiting approval / waiting human checkpoint
- task ids and persisted HIL artifacts
- tests for reject/approve/multi-step suspension

Exit criteria:

- HIL no longer requires same-process state
- interrupted CLI process can be resumed cleanly

### Release 3: Native CLI HIL Operations

Goal:

- make HIL usable without OpenClaw

Scope:

- `hil list`
- `hil show`
- `hil respond`
- `hil approve`
- `hil reject`
- idempotency keys for task resolution
- human-readable and JSON output modes

Exit criteria:

- operator can fully resolve a checkpoint from the CLI alone
- no OpenClaw dependency remains for local HIL workflows

### Release 4: Telegram Delivery Bridge

Goal:

- make HIL notifications actionable outside the terminal

Scope:

- local Telegram bridge process or subcommand
- Telegram bot config format
- message templates for approval-style and form-style HIL
- callback mapping from Telegram actions back to CLI task resolution
- basic auth/allowlist rules for who can resolve tasks

Exit criteria:

- a local user can receive a HIL task in Telegram and resolve it safely
- Telegram remains an optional adapter over the same task store

### Release 5: OpenClaw Integration Pack

Goal:

- make setup repeatable for real users

Scope:

- OpenClaw setup doc
- example plugin config using `lobsterPath`
- example workflows
- examples showing when to use OpenClaw-native resume vs local CLI/Telegram HIL
- optional skill folder prepared for ClawHub publishing
- packaging sanity check for npm/global install

Exit criteria:

- fresh user can connect OpenClaw to `chain-runner` without reading code

### Release 6: Long-Running Jobs and Scheduling

Goal:

- document and ship the correct operational patterns for scheduled/background use

Scope:

- examples for:
  - `cron -> chain-runner workflow`
  - `heartbeat -> chain-runner workflow`
  - `sessions_spawn -> chain-runner workflow`
- guidance on when to use each trigger
- delivery expectations and failure behavior

Important:

- scheduler remains owned by OpenClaw
- `chain-runner` remains the deterministic execution runtime

Exit criteria:

- long-running usage has one recommended pattern per scenario

### Release 7: ClawHub Distribution

Goal:

- make the OpenClaw-side usage pattern shareable

Scope:

- publish a ClawHub skill for invoking `chain-runner`
- include setup checks, examples, and failure modes
- optional update/sync workflow for future revisions

Exit criteria:

- users can install the integration skill from ClawHub
- binary install remains independent from ClawHub

## Recommended Build Order

Implement in this order:

1. Release 1
2. Release 2
3. Release 3
4. Release 4
5. Release 5
6. Release 6
7. Release 7

Reason:

- compatibility surface first
- HIL correctness second
- operator-facing CLI before transport adapters
- packaging and distribution only after the contract is stable

## Open Questions

1. Do we want the OpenClaw-facing binary to be a new name, or should `c8c-workflow`
   absorb this mode directly?
2. Should the workspace persist the full workflow snapshot, or only the original
   workflow path plus hash?
3. In multi-branch graphs, should approval/HIL suspend immediately, or only after all
   currently running nodes finish?
4. Do we want v1 to expose report content inline, or only paths and summary data?
5. Should the Telegram bridge live in the main binary, or as a thin helper that shells out to `c8c-workflow hil ...`?
