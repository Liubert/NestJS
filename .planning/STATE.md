---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verifying
stopped_at: "Completed quick task 260406-ihm: add prompt preview endpoint and UI in AI Settings"
last_updated: "2026-04-06T10:35:00.000Z"
last_activity: "2026-04-06 - Completed quick task 260406-ihm: buildTranslatePrompt/buildQualityPrompt extractors, POST /translations/ai-preview-prompt, Prompt Preview tab in AI Settings"
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-02)

**Core value:** Translations are reliably stored, served, and editable — teams can use the system daily without workarounds or broken workflows.
**Current focus:** Phase 05 — ui-polish

## Current Position

Phase: 05
Plan: Not started
Status: Phase complete — ready for verification
Last activity: 2026-04-05 - Completed quick task 260405-p2j: implement bulk_translate_and_save MCP tool and backend endpoint

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: none yet
- Trend: -

*Updated after each plan completion*
| Phase 01-test-infrastructure P01 | 45 | 2 tasks | 6 files |
| Phase 02-deploy-hardening P01 | 12 | 2 tasks | 6 files |
| Phase 02-deploy-hardening P02 | 2 | 1 tasks | 1 files |
| Phase 03-bug-fixes P01 | 15 | 2 tasks | 7 files |
| Phase 03-bug-fixes P02 | 20 | 2 tasks | 3 files |
| Phase 04-dead-code-cleanup P01 | 35 | 1 tasks | 1 files |
| Phase 04-dead-code-cleanup P02 | 15 | 2 tasks | 4 files |
| Phase 04-dead-code-cleanup P03 | 8 | 2 tasks | 6 files |
| Phase 05-ui-polish P01 | 525626 | 2 tasks | 7 files |
| Phase 05-ui-polish P01 | 25 | 2 tasks | 7 files |
| Phase 05-ui-polish P02 | 8 | 2 tasks | 2 files |
| Phase 05-ui-polish P03 | 15 | 2 tasks | 7 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Init: Quality Check "skipped" treated as distinct state (score=100, blue, own status)
- Init: Audit-then-remove policy — verify MCP tool cross-reference before deleting any endpoint
- Init: Base test coverage only — Testcontainers for real DB, mock Gemini and RabbitMQ in CI
- [Phase 01-test-infrastructure]: synchronize:true in test env replaces runMigrations() — NestJS DataSource has no migration file paths configured
- [Phase 01-test-infrastructure]: moduleNameMapper .js->ts required in jest-e2e.json — all src imports use .js extensions (ESM style)
- [Phase 02-deploy-hardening]: Use wget not curl in Docker healthcheck — node:22-alpine has wget but not curl
- [Phase 02-deploy-hardening]: Merge static /health and DB-only /ready into single terminus /health endpoint per D-04
- [Phase 02-deploy-hardening]: Default STAGE_ADMIN_UI_URL to http://localhost:3010 inline — matches VPS .env ADMIN_UI_PORT=3010 per CLAUDE.md
- [Phase 02-deploy-hardening]: dump_diagnostics() shared by both CI failure paths — single function covers docker compose ps + 4-service log tails
- [Phase 03-bug-fixes]: Documentation-only migration for 'skipped' state — quality_review_state is VARCHAR(20), no DDL needed
- [Phase 03-bug-fixes]: allSkippedKeys declared at outer scope before try block to be accessible in results persistence loop
- [Phase 03-bug-fixes]: Context columns added to sandbox_values with nullable defaults — no backfill needed, existing rows populate on next sandbox edit
- [Phase 03-bug-fixes]: createSandboxEntry and batchUpsert create key entity without context to prevent production leak; context written to sandbox_values rows after upsert
- [Phase 04-dead-code-cleanup]: Webhook GET /webhooks/:id classified as orphan — MCP tools do not call it
- [Phase 04-dead-code-cleanup]: POST /translations/import flagged for missing auth guard (security gap, has Admin UI consumer)
- [Phase 04-dead-code-cleanup]: files/ module has zero active consumers — ready for orphan removal in Plan 02
- [Phase 04-dead-code-cleanup]: Added JwtAuthGuard to POST /translations/import — security gap; single-decorator fix closing unguarded write endpoint
- [Phase 04-dead-code-cleanup]: FilesModule removed entirely: all 2 endpoints were orphans with no consumers
- [Phase 04-dead-code-cleanup]: FileVisibility enum moved to file-record.entity.ts — enums belong with the entity, not in deleted DTO files
- [Phase 04-dead-code-cleanup]: ENDPOINT-INVENTORY.md corrected: FilesModule is a live indirect dependency of UsersModule (getViewUrl for avatars), SUMMARY 04-02 overclaimed module removed entirely
- [Phase 05-ui-polish]: Shared types in components/types.ts — single source of truth; avoids type duplication across extracted components
- [Phase 05-ui-polish]: buildColumns wrapped in useMemo in EntriesTable — prevents Ant Design Table re-rendering all rows on every render
- [Phase 05-ui-polish]: Failed state uses orange (#fa8c16) with WarningOutlined to distinguish system errors from quality judgments (red reserved for poor quality)
- [Phase 05-ui-polish]: Typography.Text ellipsis replaces manual wordBreak/whiteSpace styles for table locale columns — built-in tooltip included
- [Phase 05-ui-polish]: level:/state: prefix convention for combined quality filter — single Select dropdown maps to qualityLevel (level:) or reviewState (state:) params, parsed in onChange handler

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 2: pg_dump availability on VPS unconfirmed — verify during Phase 2 planning; fallback is manual snapshot runbook entry
- Phase 4: MCP npm package source location unknown — must locate before scoping endpoint deletions

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260404-e9w | Implement MVP agent feedback comments feature | 2026-04-04 | 70206db | [260404-e9w-implement-mvp-agent-feedback-comments-fe](./quick/260404-e9w-implement-mvp-agent-feedback-comments-fe/) |
| 260404-eqq | Add FeedbackPage to admin UI with grouped layout | 2026-04-04 | aecc2da | [260404-eqq-add-feedbackpage-to-admin-ui-with-groupi](./quick/260404-eqq-add-feedbackpage-to-admin-ui-with-groupi/) |
| 260404-gm9 | Implement locale guidance feature for AI translations | 2026-04-04 | 4f21a2b | [260404-gm9-implement-locale-guidance-feature-add-gu](./quick/260404-gm9-implement-locale-guidance-feature-add-gu/) |
| 260405-j3w | Add bulk quality check, bulk mark-expected, bulk context endpoints | 2026-04-05 | b3cd917 | [260405-j3w-add-bulk-quality-check-bulk-mark-expecte](./quick/260405-j3w-add-bulk-quality-check-bulk-mark-expecte/) |
| 260405-jfc | Fix MCP agent guidance pre-flight warning and boundary guidance | 2026-04-05 | 5dffe71 | [260405-jfc-fix-mcp-agent-guidance-pre-flight-warnin](./quick/260405-jfc-fix-mcp-agent-guidance-pre-flight-warnin/) |
| 260405-jop | Fix per-project MCP config footgun: -s user flag, README warning, 401 errors, startup validation | 2026-04-05 | 7f7ce56 | [260405-jop-fix-per-project-mcp-config-issue-s-user-](./quick/260405-jop-fix-per-project-mcp-config-issue-s-user-/) |
| 260405-ms8 | Add optional context parameter to ai_translate MCP tool | 2026-04-05 | 3184a2a | [260405-ms8-add-context-parameter-to-mcp-ai-translat](./quick/260405-ms8-add-context-parameter-to-mcp-ai-translat/) |
| 260405-n49 | Add optional targetLocales parameter to ai_translate MCP tool | 2026-04-05 | b018387 | [260405-n49-add-targetlocales-parameter-to-mcp-ai-tr](./quick/260405-n49-add-targetlocales-parameter-to-mcp-ai-tr/) |
| 260405-ng9 | Fix ai_translate save guidance and sandbox warning condition | 2026-04-05 | 82b976b | [260405-ng9-fix-ai-translate-save-guidance-and-sandb](./quick/260405-ng9-fix-ai-translate-save-guidance-and-sandb/) |
| 260405-nmt | Add bulk AI translate endpoint and MCP tool | 2026-04-05 | ec6fecc | [260405-nmt-add-bulk-ai-translate-mcp-tool-and-backe](./quick/260405-nmt-add-bulk-ai-translate-mcp-tool-and-backe/) |
| 260405-ogo | Fix AI quality check — symmetric multi-locale support | 2026-04-05 | 3be35bf | [260405-ogo-fix-ai-quality-check-symmetric-multi-loc](./quick/260405-ogo-fix-ai-quality-check-symmetric-multi-loc/) |
| 260405-p2j | Implement bulk_translate_and_save MCP tool and backend endpoint | 2026-04-05 | cf5669f | [260405-p2j-implement-bulk-translate-and-save-mcp-to](./quick/260405-p2j-implement-bulk-translate-and-save-mcp-to/) |
| 260405-q5q | Remove init_sandbox dead tool — replaced by auto-init | 2026-04-05 | 20f4e6a | [260405-q5q-remove-init-sandbox-dead-tool-replaced-b](./quick/260405-q5q-remove-init-sandbox-dead-tool-replaced-b/) |
| 260405-uvr | Fix sandbox quality reset bug and MCP pre-flight / REST URL guidance | 2026-04-05 | decce64 | [260405-uvr-fix-sandbox-quality-reset-bug-and-mcp-pr](./quick/260405-uvr-fix-sandbox-quality-reset-bug-and-mcp-pr/) |
| 260406-g0q | Locale registry consolidation: single source of truth, rename guidance→localeSkill, DB migration nb-NO/da-DK→aliases, public API endpoint, remove frontend hardcoded data | 2026-04-06 | c966903 | [260406-g0q-locale-registry-consolidation-create-sin](./quick/260406-g0q-locale-registry-consolidation-create-sin/) |
| 260406-gca | Pass previousComment to Gemini on quality re-check | 2026-04-06 | af4b6fc | [260406-gca-add-previouscomment-to-quality-check-pas](./quick/260406-gca-add-previouscomment-to-quality-check-pas/) |
| 260406-gxq | Phase 2 testing for locale registry consolidation — migration verified, all 15 API/DB/frontend tests passed, zero hotfixes | 2026-04-06 | c5fa1f8 | [260406-gxq-phase-2-manual-testing-and-hotfixes-for-](./quick/260406-gxq-phase-2-manual-testing-and-hotfixes-for-/) |
| 260406-he7 | Add initTranslate flag to locale for one-time bulk AI translation of all existing keys | 2026-04-06 | 1e79982 | [260406-he7-add-inittranslate-flag-to-locale-for-one](./quick/260406-he7-add-inittranslate-flag-to-locale-for-one/) |
| 260406-ihm | Add prompt preview endpoint and UI in AI Settings | 2026-04-06 | 42c8134 | [260406-ihm-add-prompt-preview-endpoint-and-ui-in-ai](./quick/260406-ihm-add-prompt-preview-endpoint-and-ui-in-ai/) |
| 260406-wje | Add average quality score per namespace to project details and ProjectSettingsPage | 2026-04-06 | 145ae9a | [260406-wje-add-average-quality-score-per-namespace-](./quick/260406-wje-add-average-quality-score-per-namespace-/) |
| 260407-hur | Quality column-header filters, FilterBar settings gear, AddLocaleModal, contextNeed priority merge, vite preview config | 2026-04-07 | 7511168 | [260407-hur-deploy-uncommitted-changes-to-stage](./quick/260407-hur-deploy-uncommitted-changes-to-stage/) |

## Session Continuity

Last session: 2026-04-07T09:54:00.000Z
Stopped at: Completed quick task 260407-hur: deploy uncommitted UI+API changes to stage
Resume file: None
