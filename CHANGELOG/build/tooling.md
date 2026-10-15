# Build and test workflow history

## 2026-10-15 — Build current source before testing

A developer running `npm test` after a clean checkout previously received
`ERR_MODULE_NOT_FOUND` because the test imported an absent `dist/index.js`.
The test script now runs the existing TypeScript build before the existing Node
test runner. No dependency, lockfile, compiler configuration, or other script changed.

Verification: with the owned generated `dist/` preserved outside the checkout and
actually absent at command start, one `npm test` regenerated the compiler outputs
and passed 51 tests with zero failures or skips. The original failed fresh test and
successful baseline build remain separate evidence; the original suite was not
claimed to have passed before the repair.

Commit: resolve through Git history for this path.
