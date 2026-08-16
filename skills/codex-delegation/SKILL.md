# Agent Delegation Skill

## Purpose

Use the local `codex-agent-delegator` MCP server to hand bounded, mechanical
coding work to an installed agent while keeping architecture and review in the
current Codex task.

## Good delegation candidates

- mechanical refactors and API migrations;
- focused unit-test additions;
- documentation updates;
- repetitive style or UI changes;
- repository searches that benefit from a persisted report.

Do not delegate secrets, authentication/payment/cryptography changes,
irreversible data migrations, major architecture decisions, or a task the user
explicitly asked the current agent to implement personally.

## Required task card

Before delegating, define:

- the exact expected outcome;
- narrow `allowedFiles` and appropriate `forbiddenFiles`;
- acceptance commands in `testCommands`;
- one target exposed by the current host-specific server;
- the least privilege needed.

For `delegate_to_claude`, `model` always resolves to a 1M-context alias.
Omitting it selects `opus[1m]`. Use `sonnet` or `sonnet[1m]` for small tasks.
Accepted values are `sonnet`, `opus`, `fable`, or their explicit
`sonnet[1m]` / `opus[1m]` / `fable[1m]` aliases (case-insensitive). Any `[200k]`
variant of those three is upgraded to `[1m]`. Every other value is rejected.

For `delegate_to_agy`, omitting `model` selects `gemini-3.1-pro-high`.
An explicit Agy model override is passed through after surrounding whitespace
is removed.

Use `permissionMode: "workspace-write"` and `useWorktree: true` for edits.
The public MCP surface does not expose `full-access`, `allowUnsafe`, custom
commands, or arbitrary agent arguments.

## Workflow

1. Call `list_agent_backends` if backend availability is unknown.
2. Call the available `delegate_to_<target>` tool with a narrow task card.
3. For the default asynchronous mode, poll `get_agent_run_report` using the
   returned `runId`.
4. Follow the review skill. Fetch logs or patches only when the compact report
   does not provide enough evidence.
5. Call `apply_agent_run` only after review and with `confirm: true`.
6. Call `cleanup_agent_run` when the run and worktree are no longer needed.

## Example

```json
{
  "repoPath": "/workspace/my-app",
  "task": "Convert model interfaces to exported type aliases without changing runtime code.",
  "allowedFiles": ["src/models/*.ts"],
  "forbiddenFiles": ["src/models/legacy/**", ".env"],
  "testCommands": ["npm run typecheck"],
  "permissionMode": "workspace-write",
  "useWorktree": true
}
```
