# Roadmap: TMS Stabilization

## Overview

The TMS is working but unstable. This milestone hardens it into something teams can rely on daily. The work runs in strict dependency order: test infrastructure first (regression protection before touching anything), then deploy pipeline hardening (so fixes can be verified on stage), then product bug fixes (quality state, sandbox promotion), then dead code cleanup (after the codebase stabilizes), then UI polish (depends on quality state fixes being in production). Every phase delivers a verifiable state — no phase leaves the system worse than it found it.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Test Infrastructure** - Jest 29 + Testcontainers working; first real integration tests catch regressions (completed 2026-04-02)
- [x] **Phase 2: Deploy Hardening** - Deploys pass first attempt; health gates prevent silent failures (completed 2026-04-02)
- [x] **Phase 3: Bug Fixes** - Quality state correctness, sandbox promotion context, input validation (completed 2026-04-02)
- [x] **Phase 4: Dead Code Cleanup** - Every endpoint mapped; confirmed orphans removed (completed 2026-04-02)
- [ ] **Phase 5: UI Polish** - Quality indicators color-coded; translations page readable and filterable

## Phase Details

### Phase 1: Test Infrastructure
**Goal**: The codebase has a working test scaffold that catches real regressions before they reach stage
**Depends on**: Nothing (first phase)
**Requirements**: TEST-01, TEST-02
**Success Criteria** (what must be TRUE):
  1. `npm test` runs without warnings about ts-jest/Jest version incompatibility
  2. Integration tests execute against a real PostgreSQL instance (via Testcontainers) without mocking TypeORM
  3. A translation CRUD operation verified by an integration test fails that test when the underlying behavior is broken
**Plans**: 1 plan
Plans:
- [x] 01-01-PLAN.md — Jest 29 downgrade + Testcontainers integration tests

### Phase 2: Deploy Hardening
**Goal**: Deploys pass on the first attempt and the pipeline catches unhealthy services before reporting success
**Depends on**: Phase 1
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03
**Success Criteria** (what must be TRUE):
  1. `GET /health` returns 200 with DB and RabbitMQ status indicators
  2. `docker compose up -d` waits for Postgres and RabbitMQ to be healthy before starting the API container
  3. CI pipeline reports failure (not success) when a service is crash-looping after deploy
**Plans**: 2 plans
Plans:
- [x] 02-01-PLAN.md — Terminus health endpoint + Docker Compose API healthcheck
- [x] 02-02-PLAN.md — CI post-deploy verification with admin-ui check and diagnostics

### Phase 3: Bug Fixes
**Goal**: Known product bugs are corrected — quality states are accurate, sandbox promotion preserves all context fields
**Depends on**: Phase 2
**Requirements**: BUG-01, BUG-02, BUG-03
**Success Criteria** (what must be TRUE):
  1. A translation key that was skipped in quality check shows a blue indicator and "skipped" status (not green or missing) in the Admin UI
  2. A quality check chunk that times out leaves affected keys in "skipped" state (not silently stuck in 'processing'), visible for retry via backfill
  3. Promoting a sandbox namespace to production carries `contextNeed`, `contextReason`, and `context` fields alongside the translation values
**Plans**: 2 plans
Plans:
- [x] 03-01-PLAN.md — Quality state 'skipped' + timeout fix (BUG-01, BUG-02)
- [x] 03-02-PLAN.md — Sandbox context isolation and promote fix (BUG-03)

### Phase 4: Dead Code Cleanup
**Goal**: Every API endpoint is mapped to a known consumer; confirmed orphans are removed
**Depends on**: Phase 3
**Requirements**: CLEAN-01, CLEAN-02
**Success Criteria** (what must be TRUE):
  1. A written inventory exists mapping every route to Admin UI, MCP tool, or public API (or flagged as orphan)
  2. Confirmed orphaned endpoints are absent from the codebase with a commit message recording why each was removed
  3. No partially-reverted features remain — each is either fully implemented or fully removed
**Plans**: 3 plans
Plans:
- [x] 04-01-PLAN.md — Audit all endpoints and produce route-to-consumer inventory
- [x] 04-02-PLAN.md — Remove orphaned endpoints with cascading cleanup
- [x] 04-03-PLAN.md — Gap closure: remove dead FilesService methods, correct inventory

### Phase 5: UI Polish
**Goal**: The translations page is readable and quality state is visually clear without functional changes to the backend
**Depends on**: Phase 3
**Requirements**: UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. Quality state indicators are visually distinct: green (checked), blue (skipped), red (failed), gray (pending)
  2. A user can filter the translations list by quality score without scrolling through unrelated entries
  3. The translations page layout is readable at normal screen width without horizontal scrolling or cramped columns
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Test Infrastructure | 1/1 | Complete   | 2026-04-02 |
| 2. Deploy Hardening | 2/2 | Complete   | 2026-04-02 |
| 3. Bug Fixes | 2/2 | Complete   | 2026-04-02 |
| 4. Dead Code Cleanup | 3/3 | Complete   | 2026-04-02 |
| 5. UI Polish | 0/? | Not started | - |
