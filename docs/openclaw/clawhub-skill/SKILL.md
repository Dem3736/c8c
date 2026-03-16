# chain-runner OpenClaw

Use this skill when you want OpenClaw to execute a deterministic `chain-runner`
workflow instead of improvising the entire task in a single agent session.

## When to use it

Use `chain-runner-openclaw` when:

- the task already exists as a workflow file
- the task needs deterministic branching, evaluators, or retry behavior
- the task may suspend for approval and resume later

Do not use it when:

- the task is a one-off chat answer
- no workflow file exists yet
- you need arbitrary shell piping instead of a workflow graph

## Setup checklist

1. Install the `chain-runner-openclaw` binary.
2. Set the OpenClaw Lobster plugin `lobsterPath` to that binary.
3. Keep workflow files in a stable project path.
4. Use absolute paths when calling the binary from OpenClaw.

## Invocation pattern

```bash
chain-runner-openclaw run --mode tool /abs/path/workflow.yaml --args-json '{"input":"...","inputType":"text","projectPath":"/abs/path/project","provider":"claude"}'
```

If the result returns `needs_approval`, resume with:

```bash
chain-runner-openclaw resume --token '<resume-token>' --approve yes
chain-runner-openclaw resume --token '<resume-token>' --approve no
```

## Local operator fallback

If the checkpoint should be resolved outside OpenClaw, use:

```bash
c8c-workflow hil list --project /abs/path/project
c8c-workflow hil show --task '<task-token>'
c8c-workflow hil approve --task '<task-token>'
```

## Failure modes

- `ok: false`: treat as a runtime or contract error
- `status: "cancelled"`: the approval was explicitly rejected
- `status: "needs_approval"`: the workflow is safe to resume later; do not restart it from scratch
