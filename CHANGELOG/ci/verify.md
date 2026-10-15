# Offline CI history

## 2026-10-15 — Verify clean source checkouts on hosted runners

A developer needs an automatic check that installs the locked dependencies, builds current source through npm test, preserves library/CLI entry behavior, and audits the dependency set. The original default commit had no check runs or statuses and no workflow.

The workflow runs on pull requests and pushes to the verified master default branch, across Ubuntu 24.04 and Windows 2025 with Node 22 and 24. Each job has a ten-minute limit, read-only contents permission, pinned checkout/setup actions and no provider-secret inputs. CLI dry-run uses mock data. GitHub still supplies its normal automatic workflow token; checkout does not persist its credentials.

Validation at authoring: the functional change was independently reviewed at tree e8ab671ae86bdaf7f119f54f32cfdd68ff3b3756; the local clean-output test run passed 51 tests with no failures or skips. Those are local results. Hosted matrix status must be read at the exact PR and default-branch heads after publication.

Limits: no model/provider quality, npm release, deployment, other runtime versions or full product security certification. The lock and all tested runtime sources remain unchanged by this CI addendum.
