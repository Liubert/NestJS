# Roadmap: TMS

## Milestones

- ✅ **v1.0 TMS Stabilization** — Phases 1-5 (shipped 2026-04-02)

## Phases

<details>
<summary>✅ v1.0 TMS Stabilization (Phases 1-5) — SHIPPED 2026-04-02</summary>

- [x] Phase 1: Test Infrastructure (1/1 plans) — completed 2026-04-02
- [x] Phase 2: Deploy Hardening (2/2 plans) — completed 2026-04-02
- [x] Phase 3: Bug Fixes (2/2 plans) — completed 2026-04-02
- [x] Phase 4: Dead Code Cleanup (3/3 plans) — completed 2026-04-02
- [x] Phase 5: UI Polish (3/3 plans) — completed 2026-04-02

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Test Infrastructure | v1.0 | 1/1 | Complete | 2026-04-02 |
| 2. Deploy Hardening | v1.0 | 2/2 | Complete | 2026-04-02 |
| 3. Bug Fixes | v1.0 | 2/2 | Complete | 2026-04-02 |
| 4. Dead Code Cleanup | v1.0 | 3/3 | Complete | 2026-04-02 |
| 5. UI Polish | v1.0 | 3/3 | Complete | 2026-04-02 |

## Backlog

### Phase 999.1: bulk_translate_and_save (BACKLOG)

**Goal:** Single MCP tool that translates N keys, saves to sandbox, and runs quality check — replacing the 3-step flow (bulk_ai_translate → bulk_import → quality check).

**Design decisions (captured from discussion 2026-04-05):**
- One tool only: `bulk_translate_and_save` — no separate solo (use with 1 entry)
- Schema: `{ projectSlug, namespace, entries: [{ key, text, context? }], targetLocales?, skipQuality?: boolean }`
- `skipQuality: false` (default): translate → save → sync quality check → return `{ key: { locale: { score, level, comment } } }`
- `skipQuality: true`: translate → save → trigger QualityWorkerService.triggerNow() immediately → return `{ saved: N, qualityStatus: "queued" }`
- Agent behavior: green = ignore, yellow = optional review, red = must fix via set_translation
- No RabbitMQ needed — QualityWorkerService polling exists, triggerNow() bypasses 30s wait
- Backend: `POST /translations/ai-translate/bulk-and-save` + new `AiTranslateService.bulkTranslateAndSave()`
- MCP: new tool in `mcp-server/src/tools/ai.ts`

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)
