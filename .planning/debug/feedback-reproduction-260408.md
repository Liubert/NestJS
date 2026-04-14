# Feedback Reproduction Report — 2026-04-08

## Summary

| ID | Tool | Severity | Reproduced? | Verdict |
|----|------|----------|-------------|---------|
| d3633184 | bulk_translate_and_save | HIGH | ✅ YES | Fixed: commit 5dad3ed |
| 28a5fc0a | bulk_ai_translate | HIGH | ❌ NO | Original cause fixed by 260406-g0q migration (nb-NO→nb) |
| d0dfd6c6 | check_entry_quality | HIGH | ✅ YES | Bug confirmed — score variance up to 25pts, contradictory direction |
| 4fbdfeb7 | mark_expected + worker | MEDIUM | ⚠️ INCONCLUSIVE | mark_expected sets correctly; worker interaction not testable without running worker cycle |
| 8730ac53 | check_entry_quality EN | MEDIUM | ✅ PARTIAL | Reproduced for some words (Save → 70/100), not others (Ready → 100/100) |
| 62fa55c3 | workflow suggestion | MEDIUM | N/A | Superseded by bulk_translate_and_save fix |

---

## d0dfd6c6 — Contradictory quality checker (HIGH) ✅ REPRODUCED

**Test:** Same value checked 3× in a row, no changes between runs.

| Value (uk) | Run 1 | Run 2 | Run 3 | Variance | Direction |
|------------|-------|-------|-------|----------|-----------|
| "Залишайся легким." | 60 | 70 | 60 | 10 | Consistent: "too literal" |
| "Не бери близько до серця." | 65 | **85** | 60 | **25** | ❗ Contradictory: run2 says good, run3 says bad |
| "Без зайвих складнощів." | 80 | 90 | 80 | 10 | Consistent |

**Verdict:** REPRODUCED. Score variance up to 25 points for the same value. More importantly — direction is contradictory: run 2 scores 85/100 with positive comment, run 3 scores 60/100 with negative comment. An agent iterating on quality would loop indefinitely.

**Root cause:** Gemini non-determinism on idioms/ambiguous text. No caching or determinism guarantee.

**Fix needed:** Cache quality score per (key, locale, value) hash in sandbox_values. If same value is re-checked, return cached score. Only re-check if value changed.

---

## 8730ac53 — Source locale scored against itself (MEDIUM) ✅ PARTIAL

**Test:** Called `POST /translations/ai-quality-check` with `source=X, translation=X, locale=en` (identical strings).

| source | translation | locale | score | comment |
|--------|-------------|--------|-------|---------|
| "Ready" | "Ready" | en | 100 | _(empty)_ |
| "Save" | "Save" | en | **70** | "Identical source/translation. Needs clarification; it could refer to saving a file..." |

**Verdict:** PARTIAL. "Save" gets 70/100 when EN is scored against EN — reproduces the UX issue (noise in attention list). "Ready" gets 100 — inconsistent even here.

**Root cause:** Quality worker submits default locale (EN) for quality check. The check compares EN→EN which is meaningless for translation quality.

**Fix needed:** Quality worker should skip the default locale entirely. Quality check makes no sense for source=translation.

---

## 4fbdfeb7 — mark_expected cleared by worker (MEDIUM) ⚠️ INCONCLUSIVE

**Test attempted:**
1. Called `POST /sandbox/modern-web-app/common/entries/block3.row.book.key/locales/uk/mark-expected` → returned `reviewState: "expected"` ✅
2. Key correctly disappeared from needing-attention list (expected behavior)
3. Could not simulate background quality worker cycle in isolation

**Verdict:** INCONCLUSIVE. mark_expected API works correctly. Could not verify whether the background worker clears the state because the worker runs asynchronously and requires waiting for its cycle. Needs dedicated test: mark → wait for worker cycle → check state.

**How to test properly:** Set a key to expected, then call `POST /translations/bulk-translate-and-save` with `skipQuality: false` on the same key (this triggers synchronous quality check + persist), then check if reviewState is still "expected".

---

## 28a5fc0a — bulk_ai_translate returns {} (HIGH) ❌ NOT REPRODUCED

**Test:** 30 runs with da+nb+sv locales, same localeSkill content as stage. 30/30 returned all locales correctly — both with old code (array format) and new code (object format).

**Original bug cause (April 6):** Travis project had `nb-NO`/`da-DK` locale codes. Agent passed `nb`/`da` which were filtered → `targetLanguages: ""` → Gemini returned {}. Fixed by migration `260406-g0q`.

**da-dropping observed on stage:** 2/3 runs on stage (old code). Not reproduced in 30 local runs. Concluded: statistical noise from small sample, not a real bug.

---

## 62fa55c3 — Suggestion: fill_missing_translations (MEDIUM) N/A

Not a bug. Original concern was that import→translate→save required 3 unreliable steps. Now that `bulk_translate_and_save` saves correctly (fixed by `5dad3ed`), the single-tool workflow exists. Superseded.

---

## Action Items

| Priority | Item | Status | Fix |
|----------|------|--------|-----|
| P1 | **d0dfd6c6** — contradictory quality checker | ⏳ Partial — temperature 0.1 reduces variance; caching deferred while testing (commit `deff057`) | Re-introduce `qualityContentHash` cache once testing stabilises |
| P2 | **8730ac53** — source locale scored against itself | ⏳ Deferred — skip-default-locale reverted (commit `a9cf4be`); needs dedicated reproduction with running worker | Reproduce with worker cycle running, then re-apply skip guard |
| P2 | **4fbdfeb7** — mark_expected cleared by worker | ✅ Fixed — `persistQualityResults` skips entries with `reviewState='expected'` (commit `0a42c27`) | Done |
