# Test suite history

## 2026-10-15 — Exercise real library consumers and direct CLI use

The original 22,335 test bytes remain an exact prefix. Two added scenario groups
run six concurrent CommonJS/ESM child consumers with unrelated, help, and dry-run
arguments; each performs 64 cached-import repetitions and checks its public API and
continued host execution. These repetitions check cache reuse, not repeated module
top-level evaluation. Direct CLI help, mock dry-run, and unknown-command behavior
are checked separately.

Children use synthetic homes, omit provider keys, block fetch/socket access, and
have a 10-second timeout and 1 MiB output cap. The actual final `npm test` passed
all 51 tests, with zero failures or skips. This bounded process exercise does not
certify sustained production load, live provider behavior, or other Node/OS versions.

Commit: resolve through Git history for this path.
