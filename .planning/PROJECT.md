# Translation Management Service (TMS)

## What This Is

An internal Translation Management Service built with NestJS + React admin UI that serves as a centralized store for JSON localization keys across 3–4 internal projects. Changes apply instantly without redeployment. Also exposes an MCP module (published to NPM) allowing AI agents to read/write translations directly. The system is stable and actively used by internal teams after a full stabilization milestone.

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
- ✓ Base test coverage to catch regressions — v1.0 (Phase 1)
- ✓ Health endpoint with DB + RabbitMQ checks — v1.0 (Phase 2)
- ✓ CI deploy verification with health checks — v1.0 (Phase 2)
- ✓ Quality Check "skipped" as distinct state (score=100, blue indicator) — v1.0 (Phase 3)
- ✓ Sandbox context field isolation during promotion — v1.0 (Phase 3)
- ✓ Endpoint audit — 77 routes mapped, 4 orphans removed — v1.0 (Phase 4)
- ✓ Dead code cleanup — orphan endpoints removed, import secured — v1.0 (Phase 4)
- ✓ UI component extraction — TranslationsPage modularized — v1.0 (Phase 5)
- ✓ Color-coded quality badges with review-state filter and sort — v1.0 (Phase 5)

### Active

- [ ] Uptime Kuma monitoring for all services (DEPLOY-04, deferred from v1.0)

### Out of Scope

- New features beyond stabilization — stability-only milestone complete; next milestone may add features
- OAuth / SSO integration — email/password + MCP tokens sufficient for internal use
- Mobile app — web-first, internal tool
- Multi-tenancy — 3-4 internal projects, no external customers
- Full test coverage (100%) — base coverage for regressions, not exhaustive
- Vitest migration — NestJS decorator metadata issues; Jest is working

## Context

- **Scale:** ~3-4 projects × ~3-4K keys each. Low load, internal use only.
- **Teams:** 3-4 internal development teams consume the API.
- **AI consumers:** MCP module allows Claude and other AI agents to manage translations programmatically.
- **Current state:** Stable after v1.0 stabilization. Deploys verified via CI health checks. Quality states accurate. Dead code removed. Admin UI translations page modularized with color-coded badges and filter/sort controls.
- **Stack:** NestJS 11 + TypeORM + PostgreSQL + RabbitMQ (backend), React 18 + Ant Design v5 + TanStack React Query v5 (admin UI), Docker Compose (local + stage).
- **Stage server:** 79.76.35.167, deploys via GitHub Actions (push to develop → build → GHCR → SSH deploy).
- **Codebase:** 34 files changed in v1.0, +2184/-1762 lines.

## Constraints

- **Tech stack**: NestJS + React + PostgreSQL — no stack changes
- **Deployment**: Docker Compose on single VPS — no Kubernetes or cloud migration
- **AI provider**: Gemini 2.0 Flash for translations — already integrated
- **Port**: Admin UI on port 3010 — port 3001 is reserved by another project

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Stability before features | Existing bugs and deploy failures block real team adoption | ✓ v1.0 shipped |
| Quality Check "skipped" as distinct state | Skip ≠ unchecked; needs its own score (100), color (blue), and status | ✓ Phase 3 |
| Audit-then-remove for dead code | Don't delete blindly; verify each endpoint's usage first | ✓ Phase 4 |
| Base test coverage, not full coverage | Catch regressions without over-investing in tests for a small internal tool | ✓ Phase 1 |
| Minimal backend changes in UI phase | Review-state filter requires DTO + service change; user approved expanding scope | ✓ Phase 5 (D-14) |
| Component extraction before visual changes | Reduce monolith first to avoid merge conflicts during parallel visual work | ✓ Phase 5 (D-13) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-02 after v1.0 milestone — TMS Stabilization complete*
