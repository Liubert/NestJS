# Translation Management Service (TMS) — Stabilization

## What This Is

An internal Translation Management Service built with NestJS + React admin UI that serves as a centralized store for JSON localization keys across 3–4 internal projects. Changes apply instantly without redeployment. Also exposes an MCP module (published to NPM) allowing AI agents to read/write translations directly. The system exists and is partially working — this milestone focuses on stabilization, bug fixes, and cleanup rather than new features.

## Core Value

Translations are reliably stored, served, and editable — teams can use the system daily without workarounds or broken workflows.

## Requirements

### Validated

- ✓ REST API to get/set/delete translation keys per project/locale — existing
- ✓ Real-time updates without redeployment — existing
- ✓ MCP module with tools for push, delete, find duplicates, auto-translate, quality scoring, fix translations — existing
- ✓ Background workers for heavy tasks (auto-translation, quality checks) — existing
- ✓ Admin UI for manual edits — existing
- ✓ JWT + MCP token dual authentication — existing
- ✓ Sandbox/staging environment for translations — existing
- ✓ Webhook delivery with batching and retries — existing
- ✓ AI-powered translation via Gemini 2.0 Flash — existing
- ✓ ZIP import/export — existing

### Active

- [ ] Stable deployment pipeline — deploys pass on first attempt without manual retries
- [ ] Base test coverage to catch regressions
- [ ] Fix Quality Check skip bug — "skipped" must be a distinct state (score=100, blue indicator)
- [ ] Endpoint audit — verify every endpoint is connected to MCP or frontend, remove or fix orphans
- [ ] Clean up unfinished/partially-reverted features — finish or remove completely
- [ ] UI polish for translations page — improve readability and UX without new functionality

### Out of Scope

- New features — this milestone is stability-only
- OAuth / SSO integration — email/password + MCP tokens sufficient for internal use
- Mobile app — web-first, internal tool
- Multi-tenancy — 3-4 internal projects, no external customers
- Automated CI test suite with full coverage — focus on base coverage for regressions, not 100%

## Context

- **Scale:** ~3-4 projects × ~3-4K keys each. Low load, internal use only.
- **Teams:** 3-4 internal development teams consume the API.
- **AI consumers:** MCP module allows Claude and other AI agents to manage translations programmatically.
- **Current state:** Working but unstable. Deploys fail frequently. Some endpoints may be orphaned. Quality Check skip flow has a confirmed UI bug. Some features were partially reverted and left in the codebase.
- **Stack:** NestJS 11 + TypeORM + PostgreSQL + RabbitMQ (backend), React 19 + Ant Design v5 + TanStack React Query v5 (admin UI), Docker Compose (local + stage).
- **Stage server:** 79.76.35.167, deploys via GitHub Actions (push to develop → build → GHCR → SSH deploy).
- **Codebase map:** See `.planning/codebase/` for detailed analysis (7 documents, 1791 lines).

## Constraints

- **Tech stack**: NestJS + React + PostgreSQL — no stack changes, stabilize what exists
- **Deployment**: Docker Compose on single VPS — no Kubernetes or cloud migration
- **AI provider**: Gemini 2.0 Flash for translations — already integrated, not switching
- **Port**: Admin UI on port 3010 — port 3001 is reserved by another project

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Stability before features | Existing bugs and deploy failures block real team adoption | — Pending |
| Quality Check "skipped" as distinct state | Skip ≠ unchecked; needs its own score (100), color (blue), and status | — Pending |
| Audit-then-remove for dead code | Don't delete blindly; verify each endpoint's usage first | — Pending |
| Base test coverage, not full coverage | Catch regressions without over-investing in tests for a small internal tool | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-02 after initialization*
