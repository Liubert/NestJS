---
phase: quick
plan: 260406-gxq
subsystem: translations/locale-registry
tags: [testing, locale-registry, migration, api-verification]
requires: [260406-g0q]
provides: []
affects: [translations-service, locale-entity, public-translations-controller, admin-ui]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified: []
decisions:
  - DB name is 'ecom' (not 'nest_js') in local Docker environment — confirmed from API container env vars
  - ai-translate DTO takes 'text' (single string) not 'entries' (object) — plan's smoke test payload was incorrect; corrected inline
  - 'is' (Icelandic) POST returns localeSkill=null correctly — no registry entry for Icelandic, so null is expected behavior
metrics:
  duration: 15 min
  completed: 2026-04-06
---

# Phase quick Plan 260406-gxq: Phase 2 Manual Testing and Hotfixes for Locale Registry Consolidation Summary

**One-liner:** All locale registry consolidation changes verified end-to-end: migration clean, schema correct, 37-locale public endpoint works, BCP 47 rejection enforced, localeSkill auto-fill and PATCH confirmed, AI translate regression-free, frontend has zero legacy references.

## Tasks Completed

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Run migration and verify DB schema + data normalization | PASSED | Migration ran, guidance->locale_skill rename confirmed, backfill for en/fi rows |
| 2 | Test API endpoints — supported-locales, create/update locale, AI translate, project details | PASSED | All 7 sub-tests passed, one payload correction needed for ai-translate smoke test |

## Evidence

### Task 1: Migration and DB Verification

**Migration output (key lines):**
```
Migration LocaleRegistryConsolidation17756000000001 has been executed successfully.
COMMIT
```

**Schema check:**
```
Column       | Type | Nullable
-------------|------|--------
locale_skill | text | YES     ← EXISTS
guidance     |      |         ← DOES NOT EXIST (0 rows in information_schema query)
```

**nb-NO / da-DK normalization:** Zero projects in local DB had nb-NO or da-DK rows (clean test environment). The migration's normalization logic executed without errors — verified by query returning 0 rows for both old codes.

**Locale skill backfill:**
```
code | status | count
-----|--------|------
en   | FILLED | 1
fi   | FILLED | 1
```

### Task 2: API Endpoint Tests

**Test 1 — GET /translations/supported-locales:**
```
Total locales: 37
Fields: ['code', 'name', 'aliases', 'flag', 'localeSkill']
nb entry: code=nb, aliases=['nb-NO', 'no', 'nn-NO'], has_skill=True
da entry: code=da, aliases=['da-DK']
ALL CHECKS PASSED
```

**Test 2 — POST locale with nb-NO (BCP 47, should 400):**
```json
{"message":["code must be a 2-3 char ISO 639 code (e.g. en, nb, uk). Use aliases for regional variants (nb-NO)."],"error":"Bad Request","statusCode":400}
HTTP_CODE: 400
```

**Test 3 — POST locale with 'nb' (valid, auto-fills localeSkill):**
- 409 on second attempt (already created). DB query confirms locale_skill is FILLED for nb: `STIL OG TONE\n- Bruk uformelt "du"...`

**Test 4 — PATCH locale with localeSkill:**
```
HTTP_CODE: 200
```

**Test 5 — GET project details (no guidance field):**
```
Project kill: 4 locales
  en: isDefault=True, localeSkill=True, aliases=[]
  fi: isDefault=False, localeSkill=True, aliases=['fi-FI']
  is: isDefault=False, localeSkill=False, aliases=[]
  nb: isDefault=False, localeSkill=True, aliases=[]
No legacy guidance fields found — PASSED
```

**Test 6 — AI translate smoke test:**
```
POST /translations/ai-translate {"text":"Hello","targetLocales":["uk"],"projectSlug":"kill"}
Response: {"uk":"Привіт"}
HTTP_CODE: 201
```
No LOCALE_NAMES regression. Service works correctly.

**Test 7 — Frontend code check:**
```
No references to deleted files — CLEAN
No .guidance references — CLEAN
```

## Deviations from Plan

### Inline Corrections (no hotfixes needed)

**1. DB name correction**
- **Found during:** Task 1
- **Issue:** Plan's DB commands used `-d nest_js` but local DB is named `ecom` (confirmed from API container env `DB_NAME=ecom`)
- **Fix:** Used `-d ecom` in all psql commands. No code change needed.

**2. AI translate payload correction**
- **Found during:** Task 2, test 6
- **Issue:** Plan's smoke test payload used `{"sourceLocale":"en","entries":{"test.hello":"Hello"}}` but the actual DTO uses `{"text":"<string>"}` (single string, not batch entries object). The plan was based on a stale DTO assumption.
- **Fix:** Used correct payload `{"text":"Hello","targetLocales":["uk"],"projectSlug":"kill"}`. No code change needed — service was correct.

**3. Locale creation route correction**
- **Found during:** Task 2, test 3
- **Issue:** Plan's test used route `POST /translations/projects/:slug/locales/:code` but actual route is `POST /translations/projects/:slug/locales` (code in body, not URL param)
- **Fix:** Corrected URL in test. No code change needed.

No hotfixes were committed — all deviations were test-script corrections, not code bugs.

## Results Table

| Test | Status | Evidence |
|------|--------|----------|
| Migration runs without errors | PASS | `Migration LocaleRegistryConsolidation17756000000001 has been executed successfully.` |
| locale_skill column exists | PASS | `\d translation_locales` shows locale_skill text nullable |
| guidance column gone | PASS | `information_schema` query returns 0 rows for 'guidance' |
| nb-NO / da-DK normalized (no old primary codes) | PASS | 0 rows for both codes in DB (clean environment, no such projects) |
| locale_skill backfilled for common locales | PASS | en=FILLED, fi=FILLED |
| GET /translations/supported-locales returns 37 locales | PASS | `Total locales: 37`, correct schema |
| nb entry has nb-NO alias in supported-locales | PASS | `aliases=['nb-NO', 'no', 'nn-NO']` |
| da entry has da-DK alias in supported-locales | PASS | `aliases=['da-DK']` |
| POST with BCP 47 code (nb-NO) returns 400 | PASS | `HTTP 400 - code must be 2-3 char ISO 639` |
| POST with valid code auto-fills localeSkill (nb) | PASS | DB confirms locale_skill FILLED after creation |
| PATCH locale accepts localeSkill field | PASS | `HTTP 200` |
| GET project details returns locales without guidance field | PASS | `No legacy guidance fields found — PASSED` |
| AI translate works (no LOCALE_NAMES regression) | PASS | `{"uk":"Привіт"} HTTP 201` |
| Frontend has no references to deleted files | PASS | grep returns CLEAN |
| Frontend has no .guidance references | PASS | grep returns CLEAN |

## Self-Check: PASSED

All tests verified against live running API. No files were created or modified in this plan (testing only). No commits were needed — zero hotfixes.
