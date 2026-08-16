# Changelog

All notable changes to this project are documented here.

## Unreleased

### Security

- Claude Code delegation now fails closed to 1M-context model aliases.
  Omitting `model` selects `sonnet[1m]`; `sonnet`, `opus`, and `fable` and
  their `[1m]` or `[200k]` variants normalize to the corresponding `[1m]`
  alias. Every other Claude model value is rejected.

## 0.3.0 - 2026-08-16

### Added

- Host-specific Codex, Claude, and Agy dispatch matrices.
- A hard-off promotion gate for Agy-originated reverse routes.
- Target-specific MCP tools and fail-closed host identity validation.
- One-hop worker boundary enforcement through inherited environment state.
- Strict empty-MCP Claude child configuration and Agy slash-command isolation.
- Origin, target, depth, and trace metadata for delegated runs.
- Patch SHA-256 and target-base verification at explicit apply time.
- Windows-built, checksum-verifiable GitHub release artifacts with an SBOM and
  recorded dependency-lock hash.
- Node 20/22 CI coverage and Dependabot update checks.

### Changed

- Removed the unrestricted generic and legacy dispatch tools from the MCP
  surface. Internal custom execution remains test-only and is not remotely
  selectable.
- Limited public dispatch permissions to read-only and workspace-write.
- Updated the locked dependency graph; the production audit reports no known
  vulnerabilities.

## 0.2.0 - 2026-07-25

### Added

- Universal `delegate_to_agent` support for Antigravity, Codex, Claude Code,
  and explicit custom executables.
- Agent discovery, persisted background progress, report/log retrieval,
  reviewed patch application, and managed cleanup tools.
- Safe backend permission modes with explicit opt-in for full access.
- End-to-end tests and CI across macOS, Linux, and Windows.

### Security

- Removed unconditional `--dangerously-skip-permissions`.
- Prevented run ID path traversal during report retrieval and cleanup.
- Refused cleanup of worktrees outside generated managed roots.
- Removed shell parsing from test and custom-agent execution.
- Added clean-tree checks and `git apply --check` before patch application.
- Updated dependencies; `npm audit` reports no known vulnerabilities at release.

### Changed

- Node.js 20 or newer is now required.
- New run artifacts use `.codex-agent-runs/` and sibling
  `<repo>-agent-worktrees/` directories.
- Antigravity CLI 1.1.1 or newer is required.
- macOS installs use `~/Library/Application Support/codex-agent-delegator`.

### Compatibility

- `delegate_to_agy`, `get_agy_run_report`, and `cleanup_agy_run` remain as
  deprecated aliases.
- Existing `.codex-agy-runs/` reports and sibling agy worktrees remain
  discoverable for reporting and safe cleanup.
