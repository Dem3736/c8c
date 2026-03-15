# OpenClaw-Compatible CLI Spec

## Summary

`chain-runner` already has most of the runtime primitives needed for OpenClaw integration:

- headless workflow execution
- persisted workspace state
- approval nodes
- resume and rerun support

The missing piece is not a new workflow engine. It is a compatibility layer for the
OpenClaw `lobster` tool contract plus a small runtime change so approval checkpoints
can suspend and resume across separate CLI invocations.

This spec defines that compatibility target and breaks delivery into staged releases.

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
runtime for deterministic pipelines with approvals.

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
3. Approval checkpoints can suspend the run and return a resumable token.
4. `resume --token ... --approve yes|no` continues from the suspended approval node.
5. Stdout is a valid Lobster-style JSON envelope.

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

## Product Decision

We should build a **compatibility shim**, not a clone of Lobster.

The correct architecture is:

- OpenClaw owns trigger/orchestration surface:
  - cron
  - heartbeat
  - sub-agents
- `chain-runner` owns deterministic workflow execution
- a thin CLI contract bridges the two

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

### Approval suspension

Current `chain-runner` approval behavior is process-local: it waits inside the
same run until approval arrives. OpenClaw compatibility requires cross-process
suspension.

Required runtime behavior:

1. approval node enters `waiting_approval`
2. run persists state without failing the node
3. run exits with status `paused`
4. later invocation writes approval decision into persisted workspace state
5. resume continues from the approval node without re-running completed nodes

### Resume token

v1 token requirements:

- opaque to OpenClaw
- generated by `chain-runner`
- enough to locate:
  - workspace
  - approval node id
  - compatibility context

Recommended implementation:

- base64url JSON token
- minimal payload:
  - `version`
  - `workspace`
  - `nodeId`

Compatibility context should be persisted in the workspace, not fully encoded
into the token. That keeps tokens short and resilient to future schema growth.

### Persisted compatibility context

Store a sidecar file in the run workspace:

```json
{
  "workflowPath": "/abs/path/workflow.yaml",
  "workflow": { "...": "parsed workflow snapshot" },
  "projectPath": "/abs/path/project",
  "provider": "claude"
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
- `workspace`
- `reportPath` when available
- `durationMs`
- `status`

Nice-to-have later:

- token usage
- cost
- node-level summary
- approval audit trail

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

Out of scope:

- multi-approval workflows
- ClawHub packaging
- scheduler examples

Exit criteria:

- manual OpenClaw invocation works locally
- no approval flow yet, or approval flow behind a temporary limitation if needed

### Release 2: Approval-Safe Beta

Goal:

- make approvals first-class and resumable

Scope:

- runtime `paused` status
- suspend-on-approval semantics
- persisted compatibility context in workspace
- resume from waiting approval
- tests for reject/approve/multi-step pause

Exit criteria:

- approval no longer requires same-process state
- interrupted CLI process can be resumed cleanly

### Release 3: OpenClaw Integration Pack

Goal:

- make setup repeatable for real users

Scope:

- OpenClaw setup doc
- example plugin config using `lobsterPath`
- example workflows
- optional skill folder prepared for ClawHub publishing
- packaging sanity check for npm/global install

Exit criteria:

- fresh user can connect OpenClaw to `chain-runner` without reading code

### Release 4: Long-Running Jobs and Scheduling

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

### Release 5: ClawHub Distribution

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

Reason:

- compatibility surface first
- approval correctness second
- packaging and distribution only after the contract is stable

## Open Questions

1. Do we want the OpenClaw-facing binary to be a new name, or should `c8c-workflow`
   absorb this mode directly?
2. Should the workspace persist the full workflow snapshot, or only the original
   workflow path plus hash?
3. In multi-branch graphs, should approval suspend immediately, or only after all
   currently running nodes finish?
4. Do we want v1 to expose report content inline, or only paths and summary data?
