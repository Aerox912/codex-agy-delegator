# Cross-Agent Delegator

[![CI](https://github.com/Aerox912/codex-agy-delegator/actions/workflows/ci.yml/badge.svg)](https://github.com/Aerox912/codex-agy-delegator/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Aerox912/codex-agy-delegator)](https://github.com/Aerox912/codex-agy-delegator/releases)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

This is the Aerox912 security and Windows integration fork of
[`swjturay/codex-agy-delegator`](https://github.com/swjturay/codex-agy-delegator).
It provides a narrow MCP execution layer for dispatching bounded coding tasks
between Codex, Claude Code, and Antigravity (`agy`). Routing policy remains the
responsibility of the host configuration.

Version 0.3.0 replaces the unrestricted backend selector with host-specific
tools and enforces a one-hop worker boundary.

## Routing contract

Every server process requires a fixed `AGENT_DISPATCH_HOST`:

| Host | Tools exposed |
| --- | --- |
| `codex` | `delegate_to_claude`, `delegate_to_agy` |
| `claude` | `delegate_to_codex`, `delegate_to_agy` |
| `agy` | none until the explicit reverse-route promotion gate is enabled |

The fork contains the Agy reverse-route implementation, but it remains hard-off
unless the launch owner sets `AGENT_DISPATCH_ENABLE_AGY_REVERSE=1`. Do not set
that flag until the Agy child-isolation release gate has passed.

The generic `delegate_to_agent` tool and custom-executable selection are not
exposed over MCP. A delegated agent receives `DISPATCH_WORKER_BOUNDARY=1` and
`DISPATCH_DEPTH=1`. If it inherits a dispatcher registration, that server
instance exposes no tools and rejects direct calls.

Every `delegate_to_claude` run uses a 1M-context model alias. Omitting `model`
selects `opus[1m]`; pass `sonnet` or `sonnet[1m]` for small tasks. Accepted
values are `sonnet`, `opus`, `fable`, their
explicit `[1m]` aliases, or their `[200k]` aliases; matching is case-insensitive
and every accepted value resolves to `sonnet[1m]`, `opus[1m]`, or `fable[1m]`.
All other Claude model values are rejected.

Every `delegate_to_agy` run also includes an explicit model. Omitting `model`
selects the installed Agy CLI's Gemini 3.1 Pro High alias,
`gemini-3.1-pro-high`; explicit Agy model overrides remain supported.

## Worker isolation

| Backend | Default execution boundary |
| --- | --- |
| Agy 1.1.1+ | `--sandbox --mode accept-edits --model gemini-3.1-pro-high --disable-slash-commands` |
| Codex | `exec --ephemeral --ignore-user-config --sandbox workspace-write` |
| Claude Code | `--strict-mcp-config --mcp-config {"mcpServers":{}} --no-session-persistence --permission-mode acceptEdits --model opus[1m]` |

Each run uses a generated Git worktree by default. The server persists task,
report, log, diff, and patch artifacts, validates file allow/deny rules, runs
verification commands without a shell, and requires explicit confirmation
before applying a reviewed patch.

## MCP tools

- Two host-allowed `delegate_to_<target>` tools.
- `get_agent_run_report` for progress, logs, diff stat, or patch retrieval.
- `apply_agent_run` for explicit reviewed application.
- `cleanup_agent_run` for managed cancellation and cleanup.
- `list_agent_backends` for local CLI availability checks.

Example from a Codex host:

```json
{
  "repoPath": "C:/absolute/path/to/project",
  "task": "Add focused unit tests for the URL parser.",
  "allowedFiles": ["src/url.ts", "tests/url.test.ts"],
  "forbiddenFiles": [".env", "package-lock.json"],
  "testCommands": ["npm run typecheck", "npm test"],
  "permissionMode": "workspace-write",
  "useWorktree": true
}
```

Submit this to `delegate_to_claude` or `delegate_to_agy`. For a small Claude
task, add `"model": "sonnet"`; for a different Agy lane, pass its exact model
ID from `agy models`.
Runs are asynchronous unless `waitForCompletion` is true. Review the returned
run with `get_agent_run_report`, then call `apply_agent_run` with `confirm: true`.
Blocked runs cannot be applied.

## Build

Requirements are Node.js 20 or newer and Git:

```powershell
git clone https://github.com/Aerox912/codex-agy-delegator.git
Set-Location codex-agy-delegator
npm ci
npm run typecheck
npm test
npm audit --omit=dev
```

The supported `.agent-system` installation uses this repository as a pinned Git
submodule, builds `dist/index.js` from `package-lock.json`, and registers one
host-specific MCP process for each client that is present. Standalone Codex
setup remains available with `npm run setup`; it sets
`AGENT_DISPATCH_HOST=codex`.

The standalone installers require an explicit release tag or full commit:

```powershell
.\install.ps1 -Ref v0.3.0
```

```bash
./install.sh v0.3.0
```

## Releases and updates

CI runs type checking and tests on Windows, Linux, and macOS. A `v*` tag whose
version matches `package.json` runs the release workflow. The workflow rebuilds
on `windows-latest`, runs the production dependency audit, creates the npm
package archive, and publishes both a SHA-256 checksum and a machine-readable
release manifest.

Consumers should pin a release tag or commit. Do not execute an installer from
a moving `main` branch. The `.agent-system` update check compares its recorded
submodule commit with `Aerox912/codex-agy-delegator` and requires an explicit
submodule update.

## Security model

- Missing or invalid host identity fails closed.
- Same-host and disallowed target calls fail closed even if invoked directly.
- Delegated workers cannot recursively dispatch.
- Agy inherits the hard worker boundary even though its CLI has no isolated MCP
  profile flag; Claude and Codex also receive client-native MCP isolation.
- Agy-originated reverse routes are hard-off until separately promoted after an
  independent child-configuration isolation proof.
- Public dispatch tools expose only `read-only` and `workspace-write`; custom
  commands and unsafe full access are not remotely selectable.
- Every run records its origin, target, depth, and trace identifier.
- Reviewed patches carry a SHA-256 binding and are rejected if either the patch
  or the target repository HEAD changes before explicit apply.
- Worktree and cleanup paths are containment-checked.
- The server never commits or pushes delegated changes.

A Git worktree is not an operating-system sandbox. Keep `workspace-write`, use
narrow file rules, review the patch, and do not delegate secrets or irreversible
production changes.

Run artifacts live in `.codex-agent-runs/`; generated worktrees live beside the
repository in `<repo>-agent-worktrees/`.

See [CHANGELOG.md](CHANGELOG.md) and [SECURITY.md](SECURITY.md).
