---
phase: 01-test-infrastructure
plan: 01
subsystem: testing
tags: [jest, testcontainers, postgresql, nestjs, supertest, integration-tests]

# Dependency graph
requires: []
provides:
  - Jest 29.7.0 + ts-jest 29.4.9 installed without version incompatibility warnings
  - Testcontainers PostgreSQL bootstrap via test/test-setup.ts
  - 2 passing integration tests covering translation CRUD and public endpoint
  - Reusable test helpers: setupTestApp, teardownTestApp, getAuthToken, createTestAdminUser
affects: [02-deploy-stability, 03-quality-check, 04-endpoint-audit, 05-ui-polish]

# Tech tracking
tech-stack:
  added:
    - "@testcontainers/postgresql ^11.13.0 — real PostgreSQL containers for integration tests"
  patterns:
    - "Testcontainers pattern: start container, set env vars, bootstrap NestJS, run tests, teardown"
    - "synchronize:true when NODE_ENV=test for schema auto-creation from entities"
    - "moduleNameMapper .js→ts for Jest to handle ESM-style .js imports in TypeScript source"

key-files:
  created:
    - test/test-setup.ts
    - test/translations.e2e-spec.ts
  modified:
    - package.json
    - package-lock.json
    - test/jest-e2e.json
    - src/config/app.config.ts

key-decisions:
  - "Use synchronize:true in test env instead of running migrations — avoids need to configure migration paths in NestJS DataSource"
  - "Use top-level import for bcryptjs instead of dynamic import — Jest CommonJS mode doesn't support dynamic import() without --experimental-vm-modules"
  - "Add moduleNameMapper .js->ts in jest-e2e.json — all src imports use .js extensions (ESM style) that ts-jest must resolve to .ts files"
  - "Add transformIgnorePatterns exception for uuid — uuid v13 ships ESM-only, requires Jest transform"

patterns-established:
  - "Integration test setup: PostgreSqlContainer → set env vars → Test.createTestingModule → ValidationPipe → app.init() → run tests"
  - "Admin user seed: raw SQL INSERT into users table using bcrypt hash (bypasses API circular dependency)"
  - "Auth token acquisition: POST /auth/login → res.body.accessToken (camelCase, not snake_case)"

requirements-completed: [TEST-01, TEST-02]

# Metrics
duration: 45min
completed: 2026-04-02
---

# Phase 01 Plan 01: Test Infrastructure Setup Summary

**Jest 29.7.0 + Testcontainers PostgreSQL with 2 passing integration tests covering translation CRUD and public endpoint serving**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-04-02T15:15:00Z
- **Completed:** 2026-04-02T16:00:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Downgraded Jest 30 to 29.7.0 (resolves ts-jest 29.x compatibility) and removed boilerplate test
- Created shared test bootstrap in `test/test-setup.ts` — starts real PostgreSQL via Testcontainers, bootstraps NestJS with AppModule, provides auth helpers
- Created `test/translations.e2e-spec.ts` with 2 integration tests that exercise the full NestJS stack with a real PostgreSQL database

## Task Commits

Each task was committed atomically:

1. **Task 1: Downgrade Jest 30 to 29.7.0 and clean up boilerplate test** - `434f756` (chore)
2. **Task 2: Create Testcontainers bootstrap and translations CRUD integration tests** - `18739fb` (feat)

**Plan metadata:** committed with state updates (docs)

## Files Created/Modified
- `test/test-setup.ts` — PostgreSqlContainer bootstrap, NestJS app init with ValidationPipe, getAuthToken helper, createTestAdminUser helper
- `test/translations.e2e-spec.ts` — 2 integration tests: create/retrieve entry + public endpoint
- `test/jest-e2e.json` — added testTimeout:120000, moduleNameMapper for .js→ts, transformIgnorePatterns for uuid ESM
- `package.json` — jest ^29.7.0, @types/jest ^29.5.14, ts-jest ^29.4.9, @testcontainers/postgresql ^11.13.0
- `src/config/app.config.ts` — synchronize:true when NODE_ENV=test

## Decisions Made
- **synchronize vs migrations:** Used `synchronize: true` in test env (set in `app.config.ts`) rather than calling `dataSource.runMigrations()`. The NestJS-injected DataSource doesn't have migration file paths configured, so `runMigrations()` was a no-op. `synchronize: true` auto-creates schema from entities in one line.
- **bcryptjs import style:** Plan used `await import('bcryptjs')` (dynamic import). Jest in CommonJS mode rejects this without `--experimental-vm-modules`. Changed to static `import * as bcrypt from 'bcryptjs'`.
- **accessToken vs access_token:** Auth service returns `{ accessToken, user }` (camelCase), not `access_token`. Plan had the wrong field name.
- **moduleNameMapper required:** All source files use `.js` extensions in imports (ESM convention). Jest + ts-jest needs a `moduleNameMapper` to strip the `.js` and look for `.ts` files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed uuid v13 ESM-only module not transformable by Jest**
- **Found during:** Task 2 (first test run)
- **Issue:** `uuid` v13 ships only ESM exports, Jest's CommonJS runtime couldn't parse it
- **Fix:** Added `transformIgnorePatterns: ["node_modules/(?!(uuid)/)"]` to jest-e2e.json
- **Files modified:** test/jest-e2e.json
- **Verification:** Test suite compilation succeeded
- **Committed in:** 18739fb (Task 2 commit)

**2. [Rule 3 - Blocking] Fixed .js imports in TypeScript source not resolved by Jest**
- **Found during:** Task 2 (after uuid fix, next error was missing admin-create-user.dto.js)
- **Issue:** All NestJS source files use `.js` extensions (ESM style). Jest doesn't have a built-in way to resolve these to `.ts` files
- **Fix:** Added `moduleNameMapper: {"^(\\.{1,2}/.*)\\.js$": "$1"}` to jest-e2e.json
- **Files modified:** test/jest-e2e.json
- **Verification:** All imports resolved correctly
- **Committed in:** 18739fb (Task 2 commit)

**3. [Rule 1 - Bug] Fixed migrations not running in test setup**
- **Found during:** Task 2 (users table not found)
- **Issue:** `dataSource.runMigrations()` was a no-op because NestJS TypeORM module doesn't configure migration file paths. Users table wasn't created.
- **Fix:** Added `synchronize: process.env.NODE_ENV === 'test'` to TypeORM config in app.config.ts. Schema auto-created from entities on app init.
- **Files modified:** src/config/app.config.ts
- **Verification:** All tables created, tests ran against real schema
- **Committed in:** 18739fb (Task 2 commit)

**4. [Rule 1 - Bug] Fixed user role enum value (ADMIN → admin)**
- **Found during:** Task 2 (enum validation error in DB)
- **Issue:** Plan's SQL used `'ADMIN'` but UserRole enum values are lowercase strings (`'admin'`, `'user'`, `'guest'`)
- **Fix:** Changed INSERT to use `'admin'` lowercase
- **Files modified:** test/test-setup.ts
- **Verification:** User inserted successfully, login succeeded
- **Committed in:** 18739fb (Task 2 commit)

**5. [Rule 1 - Bug] Fixed login response token field name**
- **Found during:** Task 2 (token was undefined, got 401 on API calls)
- **Issue:** Plan used `res.body.access_token` but AuthService returns `{ accessToken, user }` (camelCase)
- **Fix:** Changed to read `res.body.accessToken`
- **Files modified:** test/test-setup.ts
- **Verification:** Token obtained successfully, all API calls authenticated
- **Committed in:** 18739fb (Task 2 commit)

**6. [Rule 1 - Bug] Fixed CreateEntryDto field (translations → values)**
- **Found during:** Task 2 (reviewing DTO before writing test)
- **Issue:** Plan used `translations: { en: 'Hello' }` but CreateEntryDto field is `values`
- **Fix:** Changed to `values: { en: 'Hello' }` in test
- **Files modified:** test/translations.e2e-spec.ts
- **Verification:** Entry created successfully
- **Committed in:** 18739fb (Task 2 commit)

**7. [Rule 1 - Bug] Fixed CreateNamespaceDto field (name → slug)**
- **Found during:** Task 2 (reviewing DTO before writing test)
- **Issue:** Plan used `{ name: 'common' }` but CreateNamespaceDto uses `slug` field
- **Fix:** Changed to `{ slug: 'common' }` in test
- **Files modified:** test/translations.e2e-spec.ts
- **Verification:** Namespace created successfully
- **Committed in:** 18739fb (Task 2 commit)

**8. [Rule 1 - Bug] Fixed CreateProjectDto (removed defaultLocale, added explicit locale/namespace creation)**
- **Found during:** Task 2 (reviewing DTO before writing test)
- **Issue:** Plan used `{ name, slug, defaultLocale }` but CreateProjectDto only accepts `slug` and optional `name`. Sending `defaultLocale` would fail validation (`forbidNonWhitelisted: true`). Also, createProject does not auto-create locale or namespace.
- **Fix:** Removed `defaultLocale` from project creation. Added explicit POST /locales and POST /namespaces calls in beforeAll.
- **Files modified:** test/translations.e2e-spec.ts
- **Verification:** Project, locale, and namespace created successfully
- **Committed in:** 18739fb (Task 2 commit)

---

**Total deviations:** 8 auto-fixed (3 blocking, 5 bug)
**Impact on plan:** All fixes were necessary for correctness — the plan's code snippets had several API mismatches with the actual codebase. No scope creep; all fixes stayed within the test infrastructure scope.

## Issues Encountered
- TypeORM DataSource in NestJS module doesn't include migration file paths, making `runMigrations()` ineffective. Resolved via `synchronize: true` in test mode — a clean, well-established pattern for integration testing.
- uuid v13 ESM compatibility with Jest CommonJS requires explicit transform config.

## User Setup Required
None - no external service configuration required. Tests require Docker to be running (for Testcontainers).

## Next Phase Readiness
- Test infrastructure is complete and reusable: `setupTestApp` and `getAuthToken` can be imported in future test suites
- 2 integration tests act as regression guards for translation CRUD and public serving
- Phase 2 (deploy stability) can proceed independently — no test blockers

## Self-Check: PASSED

- FOUND: test/test-setup.ts
- FOUND: test/translations.e2e-spec.ts
- FOUND: commit 434f756 (chore: downgrade Jest)
- FOUND: commit 18739fb (feat: Testcontainers tests)

---
*Phase: 01-test-infrastructure*
*Completed: 2026-04-02*
