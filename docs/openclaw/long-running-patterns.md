# OpenClaw Long-Running Patterns

OpenClaw owns scheduling. `chain-runner` owns deterministic execution after the
trigger fires.

## `cron -> chain-runner workflow`

Use this when the run must start at an exact time.

Recommended shape:

```bash
chain-runner-openclaw run --mode tool /abs/path/workflow.yaml --args-json '{"projectPath":"/abs/path/project","provider":"claude"}'
```

Use `cron` for:

- nightly reports
- timed content generation
- pre-market or end-of-day checks

Operational rule:

- if the run returns `needs_approval`, let OpenClaw deliver that state and resume later

## `heartbeat -> chain-runner workflow`

Use this when the agent should decide whether work is needed on each periodic pass.

Pattern:

1. OpenClaw heartbeat gathers current context.
2. The heartbeat decides whether a deterministic workflow should run.
3. If yes, it invokes `chain-runner-openclaw run --mode tool ...`.

Use `heartbeat` for:

- monitoring a repo for specific conditions
- recurring triage
- context-aware maintenance that should sometimes skip

Operational rule:

- keep the decision logic in OpenClaw
- keep the actual execution graph in `chain-runner`

## `sessions_spawn -> chain-runner workflow`

Use this when a chat command should kick off background work without blocking the
main interaction.

Pattern:

1. OpenClaw spawns a background session.
2. The spawned session invokes `chain-runner-openclaw`.
3. OpenClaw announces the result back into chat or inbox.

Use `sessions_spawn` for:

- long-running research
- report generation
- non-blocking content pipelines

Operational rule:

- do not move scheduling into `chain-runner`
- treat `chain-runner` as the execution worker for the spawned session

## Failure behavior

- `ok: true, status: "ok"`: workflow completed
- `ok: true, status: "needs_approval"`: workflow is safely suspended on a durable checkpoint
- `ok: true, status: "cancelled"`: checkpoint was explicitly rejected
- `ok: false`: runtime or contract error; OpenClaw should surface the error and decide whether to retry

## Workspace expectations

Every run persists its own workspace under the project `.c8c/runs/` root when a
project path is provided. That workspace is the stable lineage anchor across:

- OpenClaw resume
- local `hil` commands
- future delivery adapters
