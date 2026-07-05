# Selective n9router Port Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Port only the useful ideas from `nightwalker89/n9router` into this local 9router repo without changing branding, package identity, or SQLite architecture.

**Architecture:** Rebuild selected features around local SQLite repositories and existing Next.js/MITM seams. Do not copy the fork's `db.json`/lowdb runtime model. Keep Antigravity account pooling opt-in, bounded, auditable, and described as failover/health management.

**Tech Stack:** Next.js 16, React 19, SQLite repository layer under `src/lib/db/*`, Vitest unit tests, existing MITM server code.

---

## MVP Scope

Implement **Antigravity Account Pool MVP** first.

The MVP is:

- Account-pool settings stored in local SQLite settings.
- Account-pool metadata stored in existing provider connection JSON metadata.
- Pure service that selects eligible Antigravity accounts and records success/failure/cooldown state.
- MITM integration only when `antigravityAccountPoolEnabled` is true.
- Minimal dashboard later with neutral wording: Account Pool, Failover, Cooldown, Account Health.

The MVP is not:

- Full fork merge.
- `n9router` branding/package/publish flow.
- Direct copy of `src/mitm/tokenPool.js`.
- Reintroduction of `db.json` as source of truth.
- Hidden or auto-enabled token rotation.
- UI copy using bypass/unlimited/evade language.

## Phase 1: Discovery Lock

**Files to inspect before service/MITM work:**

- `src/lib/db/repos/settingsRepo.js`
- `src/lib/db/repos/connectionsRepo.js`
- `src/lib/db/index.js`
- `src/mitm/server.js`
- `src/mitm/handlers/antigravity.js`
- `src/mitm/dbReader.js`
- `src/app/(dashboard)/dashboard/cli-tools/components/AntigravityToolCard.js`
- `src/app/(dashboard)/dashboard/mitm/MitmPageClient.js`

**Reference-only fork files:**

- `C:\Users\Fadheel Ahmad Al F\AppData\Local\Temp\opencode\n9router-compare\src\mitm\tokenPool.js`
- `C:\Users\Fadheel Ahmad Al F\AppData\Local\Temp\opencode\n9router-compare\src\mitm\tokenSwapRetry.js`
- `C:\Users\Fadheel Ahmad Al F\AppData\Local\Temp\opencode\n9router-compare\src\lib\usageLimiter.js`
- `C:\Users\Fadheel Ahmad Al F\AppData\Local\Temp\opencode\n9router-compare\src\app\(dashboard)\dashboard\cli-tools\components\TokenSwapPoolCard.js`

Acceptance:

- No product behavior changes during discovery.
- Confirm `IzRouter Proxy` branding stays unchanged.
- Confirm SQLite remains source of truth.

## Phase 2: SQLite Metadata

Status: partially implemented in commit `1951c7a`.

Files:

- `src/lib/db/repos/settingsRepo.js`
- `src/lib/db/repos/connectionsRepo.js`
- `src/lib/db/driver.js`
- `src/lib/db/index.js`
- `tests/unit/account-pool-db.test.js`

Data mapping:

| Fork idea | Local field |
| --- | --- |
| token swap enabled | `antigravityAccountPoolEnabled` |
| pool strategy | `antigravityAccountPoolStrategy` |
| cooldown threshold | `antigravityCooldownStrikeThreshold` |
| default cooldown | `antigravityDefaultCooldownMs` |
| retry count | `antigravity503RetryCount` |
| rate limit state | connection `rateLimitedUntil` |
| auth cooldown | connection `authCooldownUntil` |
| model cooldown | connection `modelCooldowns` |
| strikes | connection `consecutiveStrikes`, `modelStrikes` |

Verification:

```powershell
cd tests
& ".\node_modules\.bin\vitest.cmd" run --reporter=verbose --config ./vitest.config.js unit/account-pool-db.test.js
```

## Phase 3: Antigravity Endpoint Helpers

Status: implemented in commit `d189352`.

Files:

- `src/lib/antigravity-ide-lib.js`
- `src/app/api/antigravity-targets/route.js`
- `src/app/api/antigravity-app/route.js`
- `src/app/api/antigravity-app-v2/route.js`
- `src/app/api/antigravity-ide/route.js`
- `tests/unit/antigravity-endpoint-helpers.test.js`

Behavior:

- `GET /api/antigravity-targets` lists known local Antigravity targets.
- Target-specific `GET` routes return installation status only.
- No mutation, no process launch, no config rewrite.

Verification:

```powershell
cd tests
& ".\node_modules\.bin\vitest.cmd" run --reporter=verbose --config ./vitest.config.js unit/antigravity-endpoint-helpers.test.js
```

## Phase 4: Account Pool Service

Create:

- `src/lib/accountPool/antigravityPool.js`
- `tests/unit/antigravity-account-pool.test.js`

Service responsibilities:

- Filter active Antigravity OAuth connections.
- Skip accounts with active `rateLimitedUntil`.
- Skip accounts with active `authCooldownUntil`.
- Skip model-specific cooldowns only for the requested model.
- Select by `round-robin` first.
- Record success by clearing strikes and updating `lastUsedAt`.
- Record transient failures by incrementing strike counters.
- Apply cooldown only after threshold.
- Record auth failures with auth cooldown.

Initial test cases:

- selects first active non-cooled account
- skips inactive accounts
- skips account-level cooldown
- skips auth cooldown
- skips model-specific cooldown only for matching model
- first `429` records strike without cooldown
- threshold `429` applies cooldown
- `401`/`403` applies auth cooldown
- success clears strikes and updates `lastUsedAt`

Do not import Next.js server APIs into this pure service.

## Phase 5: MITM Opt-In Integration

Likely files:

- `src/mitm/handlers/antigravity.js`
- `src/mitm/server.js`
- `src/mitm/dbReader.js`
- maybe `src/mitm/accountPoolReader.js`

Rules:

- If `antigravityAccountPoolEnabled` is false, preserve current behavior exactly.
- If enabled, choose an eligible account and retry bounded failures.
- Do not directly import native SQLite repo code into MITM unless verified safe.
- Prefer a narrow bridge: internal API or derived read-only snapshot.
- Stop after bounded retry attempts.
- Return a clear error when all accounts are unavailable.
- Never log raw tokens.

Tests:

- disabled setting preserves old path
- enabled setting selects eligible account
- `429`/`503` can move to another eligible account after threshold
- `401`/`403` records auth cooldown
- all accounts unavailable does not infinite loop

## Phase 6: Dashboard MVP

Likely files:

- `src/app/(dashboard)/dashboard/cli-tools/components/AntigravityToolCard.js`
- new `src/app/(dashboard)/dashboard/cli-tools/components/AntigravityAccountPoolCard.js`
- `src/app/(dashboard)/dashboard/mitm/MitmPageClient.js`

UI rules:

- Feature off by default.
- Explicit enable/disable control.
- Show healthy/cooled/unavailable account status.
- Mask account identifiers by default.
- Use neutral wording: Account Pool, Failover, Cooldown, Health, Retry Attempts.
- Avoid wording: bypass, evade, unlimited bypass, hack.

Visual/manual QA:

- desktop dashboard
- mobile dashboard
- keyboard focus
- disabled default state
- enable/disable persistence
- `IzRouter Proxy` still visible

## Phase 7: Usage Reporting and Key Limits

Only after Account Pool/MITM is stable.

Potential files:

- `src/app/api/usage/report/route.js`
- `src/lib/db/repos/usageReportRepo.js`
- `src/lib/db/repos/apiKeysRepo.js`
- `src/app/api/keys/[id]/usage/route.js`
- `src/app/api/keys/[id]/reset-usage/route.js`

Rules:

- Use local SQLite usage history.
- Existing keys remain unlimited by default.
- Limits are opt-in.
- Avoid full dashboard rewrite in first pass.

## Verification Gates

Before each commit:

```powershell
$env:GIT_MASTER='1'; git status --short --branch
$env:GIT_MASTER='1'; git diff --stat
```

Targeted tests:

```powershell
cd tests
& ".\node_modules\.bin\vitest.cmd" run --reporter=verbose --config ./vitest.config.js unit/account-pool-db.test.js unit/antigravity-endpoint-helpers.test.js
```

Broader checks before final handoff:

```powershell
npm run build
```

Known Windows note:

- `tests/package.json` uses Unix-style `NODE_PATH=...`, so on Windows run local Vitest binary directly.
- LSP diagnostics may be unavailable if TypeScript LSP is not installed.

## Commit Strategy

Use small semantic commits.

Already created:

- `1951c7a feat(antigravity): add account pool sqlite metadata`
- `d189352 feat(antigravity): add target helper routes`

Recommended next commits:

- `feat(antigravity): add account pool selection service`
- `feat(antigravity): gate mitm account pool failover`
- `feat(antigravity): add account pool dashboard controls`
- `feat(usage): add sqlite usage report api`
- `feat(endpoint): add optional api key limits`

## Explicit Non-Goals

Do not port:

- `n9router` package name
- `n9router` branding
- npm/Docker publish scripts from fork
- lowdb/`db.json` persistence
- full `tokenPool.js` as-is
- direct `fs.readFileSync(DATA_DIR/db.json)` logic
- hidden account rotation
- auto-enabled pooling
- bypass-oriented UI wording
- unrelated provider additions
- shutdown/update routes
- full usage dashboard rewrite in MVP
