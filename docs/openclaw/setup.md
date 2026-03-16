# OpenClaw Setup

This integration treats `chain-runner` as the deterministic workflow runtime and
OpenClaw as the trigger/orchestration layer.

## What to point OpenClaw at

OpenClaw's current lobster plugin validates that `lobsterPath` ends with a file
named `lobster` (or `lobster.cmd` on Windows). For that reason this package
ships a wrapper executable at `dist/lobster` that forwards into the same
`c8c-workflow` CLI entrypoint.

Example absolute path:

```bash
/abs/path/to/node_modules/@c8c-ai/cli/dist/lobster
```

Minimal plugin config example:

```json
{
  "lobsterPath": "/abs/path/to/node_modules/@c8c-ai/cli/dist/lobster"
}
```

## Supported contract

OpenClaw calls the binary with:

```bash
/abs/path/to/node_modules/@c8c-ai/cli/dist/lobster run --mode tool /abs/path/workflow.yaml --args-json '{"input":"draft copy","inputType":"text","projectPath":"/abs/path/project","provider":"claude"}'
```

If a checkpoint needs approval, stdout returns `status: "needs_approval"` plus a
resume token.

Resume looks like:

```bash
/abs/path/to/node_modules/@c8c-ai/cli/dist/lobster resume --token '<resume-token>' --approve yes
/abs/path/to/node_modules/@c8c-ai/cli/dist/lobster resume --token '<resume-token>' --approve no
```

## Native HIL path

The same suspended checkpoint is available from the local CLI:

```bash
c8c-workflow hil list --project /abs/path/project
c8c-workflow hil show --task '<task-token>'
c8c-workflow hil approve --task '<task-token>'
c8c-workflow hil reject --task '<task-token>'
c8c-workflow hil respond --task '<task-token>' --data-json '{"approved":true,"editedContent":"edited text"}'
```

`hil ...` persists the response only. The next OpenClaw or local `resume` call
continues the run deterministically from the saved workspace state.

## Manual verification

1. Build the packages.
2. Run the example workflow in tool mode.
3. Confirm stdout is JSON only.
4. Confirm `needs_approval` includes a resume token.
5. Run `c8c-workflow hil list` and verify the same checkpoint appears there.
6. Approve or reject from CLI.
7. Resume with the token and verify the run completes or returns `cancelled`.

## Example workflow

See [approval-workflow.yaml](/Users/vlad/Code/projects/chain-runner/docs/openclaw/examples/approval-workflow.yaml).

## Telegram adapter guidance

Telegram is intentionally not the source of truth. A local bridge should:

1. poll `c8c-workflow hil list --json`
2. send messages for newly opened tasks
3. map bot actions back to `hil approve`, `hil reject`, or `hil respond`

The workflow state remains in the run workspace under `human-tasks/` and
`approvals/`.
