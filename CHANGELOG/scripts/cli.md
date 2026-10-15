# CLI and library entry history

## 2026-10-15 — Keep a consumer's process separate from CLI dispatch

A developer importing the public API may have their own command-line arguments.
Previously the import dispatched those arguments, printing help or a mock report,
or exiting the host with an unknown-command error.

The existing CLI error handler now runs only for the direct CommonJS entry point
(`require.main === module`). Public exports and command implementations are unchanged.
The same external consumer changed from exit 1 with unrelated arguments to exit 0
with its API and continuation markers. Imported help/dry-run arguments no longer
print CLI output; direct help and mock dry-run remain successful and an unknown
direct command still exits 1. No provider calls were made.

Commit: resolve through Git history for this path.
