# ADR 0001: better-sqlite3 runtime strategy

- Status: Accepted
- Date: 2026-04-18

## Context

Phosphene uses `better-sqlite3`, which is a native module. The binding must be
compiled against the ABI of the runtime that will load it:

- Node.js for Vitest and other CLI-driven tooling
- Electron for local app runs, e2e, and packaging

The repo already contains separate rebuild commands:

- `npm run rebuild:node`
- `npm run rebuild:electron`

That split works, but the active binding is still whichever rebuild command ran
most recently. The result is stateful local behavior: unit tests, e2e, and
packaging each depend on a different ABI, and plain `npm test` is fragile after
Electron-targeted commands.

## Observed failure mode

Baseline verification on 2026-04-18 showed:

- `npm run rebuild:node && npm test` passes with `311/311` tests green.
- `npm run rebuild:electron && npm test` fails with `8` `NODE_MODULE_VERSION`
  mismatches.
- The runtime-sensitive Vitest files currently affected by ABI drift are:
  - `electron/ipc/database.integration.test.ts`
  - `electron/ipc/schema/schema.test.ts`
  - `electron/ipc/schema/migrations.test.ts`

Those failures all come from loading a `better-sqlite3` binary compiled for the
Electron ABI from a Node-based Vitest process.

## Options

### Option A: Standardize dual-runtime scripts

Keep the current real-`better-sqlite3` Vitest coverage, but make the Node test
entry point repair the Node ABI automatically. Electron rebuilds remain owned by
Electron-targeted commands such as e2e, development, and packaging.

Pros:

- Matches the current repo and CI behavior
- Preserves real schema, migration, and WAL coverage in Vitest
- Fixes the common developer foot-gun without redesigning the test suite

Cons:

- The repo still has two native-runtime modes
- Scripts and docs must make the contract explicit

### Option B: Remove real `better-sqlite3` from Vitest

Mock or relocate the runtime-sensitive tests so Node-based Vitest never loads
the native binding.

Pros:

- Removes ABI drift from the default unit-test loop

Cons:

- Gives up or relocates the current real SQLite schema and migration coverage
- Requires broader test-suite redesign than the repo currently needs

### Option C: Maintain separate native build outputs or caches

Keep both runtimes available by managing separate build artifacts or caches for
the same dependency.

Pros:

- Reduces rebuild churn when switching between runtimes

Cons:

- Adds infrastructure and maintenance cost
- Is more complex than the current codebase needs

## Decision

Adopt **Option A: standardize dual-runtime scripts**.

Phosphene will keep real `better-sqlite3` coverage in Vitest and make
Node-targeted commands self-healing. Electron rebuilds remain the responsibility
of Electron-targeted commands (`dev:electron`, `test:e2e`, and
`build:electron`).

This means:

- `npm test` must always leave the repo in a Node-safe state
- Electron-targeted commands must rebuild for Electron themselves
- The repo must provide one explicit command that proves the transition
  `Node -> Electron -> Node` still works

## Consequences

- Contributors do not need to remember a manual `rebuild:node` step before
  running plain `npm test`.
- CI should rely on the shared package scripts instead of inlining ABI repair in
  workflow YAML.
- The project keeps real-SQLite coverage in Vitest instead of replacing it with
  mocks.
- The repo still needs documentation that tells humans which commands are
  Node-targeted versus Electron-targeted.
