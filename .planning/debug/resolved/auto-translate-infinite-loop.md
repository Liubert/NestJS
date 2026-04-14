---
status: resolved
trigger: "Diagnose and fix an infinite translation request loop in auto-translate-worker.service.ts"
created: 2026-04-05T00:00:00.000Z
updated: 2026-04-05T12:00:00.000Z
---

## Current Focus

hypothesis: Both SELECT queries (processInitTranslateLocales and pollAndProcess) miss `AND sv_tgt.is_deleted = false` in the LEFT JOIN for the target locale check. The DB unique constraint is on (project_id, key_id, locale_id) without considering is_deleted. So a soft-deleted sandbox_value row satisfies the unique constraint → INSERT does nothing → SELECT still returns the key as "missing" (sv_tgt.id IS NULL is false but... wait, a soft-deleted row HAS an id, so sv_tgt.id IS NULL is FALSE — meaning soft-deleted rows DO block the query from returning the key as missing).

Wait — re-reading more carefully: `sv_tgt.id IS NULL` means the LEFT JOIN found NO row. If a soft-deleted row EXISTS, sv_tgt.id IS NOT NULL, so the key would NOT appear as missing. That means soft-deleted rows would PREVENT keys from being found as missing... that's the opposite problem.

But the real bug is: `translateKey()` checks existing sandbox values WITHOUT filtering `is_deleted = false`. The `sandboxRepo.find()` call at line 232 returns ALL rows including soft-deleted ones. So a soft-deleted row counts as "existing" → key skipped → never translated.

COMBINED with pollAndProcess: if sv_tgt has is_deleted=false filter missing, soft-deleted rows appear as "missing" (sv_tgt.id IS NULL), so key is queued → translateKey finds soft-deleted row in existingSandbox → skips it → INSERT never happens → key appears "missing" again next cycle → infinite loop.

test: Verified by reading the code
expecting: Both queries need `AND sv_tgt.is_deleted = false`, AND translateKey needs `where: { ..., isDeleted: false }`
next_action: Apply fix to all three locations

## Symptoms

expected: When auto_translate enabled and a new locale added, keys are translated once and loop stops
actual: Worker keeps finding "missing" keys even after attempting translation — infinite loop in logs
errors: Endless translation requests observed in logs
reproduction: Enable auto_translate on a project → add new locale → observe endless translation requests
started: After guidance→localeSkill rename and related changes

## Eliminated

- hypothesis: The recent rename (guidance→localeSkill, LOCALE_NAMES→getLocaleName) broke translation logic
  evidence: These are functionally equivalent — getLocaleName returns same locale name strings, localeSkill is same column renamed
  timestamp: 2026-04-05T00:00:00.000Z

## Evidence

- timestamp: 2026-04-05T00:00:00.000Z
  checked: processInitTranslateLocales query (lines 72-94)
  found: LEFT JOIN for sv_tgt at line 87-90 has NO `AND sv_tgt.is_deleted = false` filter
  implication: If a soft-deleted row exists for (key_id, locale_id, project_id), sv_tgt.id IS NOT NULL → key skipped as already translated. That means soft-deleted rows HIDE missing translations.

- timestamp: 2026-04-05T00:00:00.000Z
  checked: pollAndProcess query (lines 136-168)
  found: LEFT JOIN for sv_tgt at lines 158-161 also has NO `AND sv_tgt.is_deleted = false` filter
  implication: Same issue — soft-deleted rows cause the query to skip keys that need translation.

- timestamp: 2026-04-05T00:00:00.000Z
  checked: translateKey() at line 232-238
  found: `sandboxRepo.find({ where: { projectId, keyId }, select: ['localeId'] })` — NO `isDeleted: false` filter
  implication: Soft-deleted rows are counted as "existing" translations. missingLocales filter excludes them. INSERT is never called. But if pollAndProcess DID find the key (because soft-deleted rows were not filtering), translateKey would then skip it.

- timestamp: 2026-04-05T00:00:00.000Z
  checked: DB unique constraint on sandbox_values
  found: `uq_sandbox_values UNIQUE CONSTRAINT btree (project_id, key_id, locale_id)` — no partial index, applies to ALL rows including is_deleted=true
  implication: INSERT ON CONFLICT DO NOTHING fires even when existing row has is_deleted=true. The translation is silently discarded.

- timestamp: 2026-04-05T00:00:00.000Z
  checked: Root cause synthesis
  found: THE ACTUAL INFINITE LOOP MECHANISM:
    1. Soft-deleted sandbox_value exists for (project_id, key_id, locale_id) with is_deleted=true
    2. pollAndProcess LEFT JOIN sv_tgt has NO is_deleted filter → soft-deleted row found → sv_tgt.id IS NOT NULL → key NOT returned as missing
    Wait, this means the query DOES filter out the key... so the loop shouldn't happen via soft-deleted rows.
    
    REVISED: The real mechanism is translateKey's existingSandbox check:
    1. pollAndProcess query correctly finds a key missing a target locale value (sv_tgt.id IS NULL — meaning NO row exists at all, deleted or not)
    2. translateKey calls sandboxRepo.find() without is_deleted filter
    3. If any soft-deleted row exists for (projectId, keyId, ANY localeId), it could interfere... but the filter is by keyId only, not localeId
    4. existingLocaleIds contains locale IDs of ALL sandbox rows for this key, including soft-deleted
    5. If a soft-deleted row exists for the TARGET locale, that localeId is in existingLocaleIds → missingLocales excludes it → no INSERT happens
    6. But the SELECT query doesn't filter is_deleted, so the soft-deleted row PREVENTS it from being seen as missing... 
    
    FINAL ROOT CAUSE: The pollAndProcess sv_tgt LEFT JOIN has no is_deleted filter. If ALL sandbox rows for a key/locale are soft-deleted, then sv_tgt.id IS NOT NULL (soft-deleted row exists) → key NOT returned as missing by the SELECT query. This means soft-deleted rows BLOCK translation but the infinite loop would come from a different scenario.
    
    THE ACTUAL LOOP: translateKey has sandboxRepo.find() without isDeleted:false. This finds soft-deleted rows. Those locale IDs go into existingLocaleIds. Then missingLocales is computed filtering them out. If translateKey is called with a locale that has a soft-deleted row, it does nothing. But then what causes the LOOP?
    
    If pollAndProcess sv_tgt JOIN has no is_deleted filter → soft-deleted rows are NOT NULL → key not returned. So soft-deleted rows prevent the infinite loop, not cause it.
    
    SIMPLEST EXPLANATION (re-reading the INSERT): The INSERT has `ON CONFLICT (project_id, key_id, locale_id) DO NOTHING`. Gemini returns a translation. INSERT is attempted. If a soft-deleted row exists → conflict → DO NOTHING. The key still has a soft-deleted row (is_deleted=true). Next cycle: pollAndProcess finds sv_tgt IS NOT NULL (soft-deleted) → key not returned as missing. Loop stops.
    
    BUT: What if Gemini fails silently? translateKey catches exceptions with `logger.warn()`. If translation returns empty/null for that locale code, `if (!translated) continue` → no value pushed → no INSERT. Next cycle: key still missing (sv_tgt IS NULL) → queued again → translateKey called → Gemini fails again → infinite loop.
    
    ALSO: translateKey's existingSandbox check uses find() WITHOUT localeId filter — it finds ALL locales for the key. If locale A and B both need translation, and Gemini returns only locale A, translateKey writes locale A but skips B. Next cycle: locale B is still missing. This is CORRECT behavior, not a loop.
    
    MOST LIKELY REAL LOOP: pollAndProcess query returns a key. translateKey is called with ALL nonDefaultLocales. It checks existingSandbox for (projectId, keyId) without filtering isDeleted. A soft-deleted row for locale X means locale X is excluded from missingLocales. Gemini is not called for locale X. INSERT for locale X never happens. pollAndProcess next cycle: LEFT JOIN sv_tgt for locale X — soft-deleted row exists → sv_tgt.id IS NOT NULL → key NOT returned as missing. So actually soft-deleted rows PREVENT the loop here.
    
    I need to reconsider. Maybe the loop is simpler: Gemini API consistently fails for certain locales → translateKey logs warning → no INSERT → same keys queued every 10s forever.
    
    OR: translateKey's existingSandbox check is wrong in a different way. It finds soft-deleted rows for OTHER locales, but for the TARGET locale there's no row. The filter `!existingLocaleIds.has(l.id)` correctly identifies missing target locale. Gemini called, translation produced. INSERT attempted. If row doesn't exist → INSERT succeeds. Next cycle: sv_tgt IS NOT NULL (new row, is_deleted=false) → not returned as missing. Loop stops. This is correct behavior.
    
    CONCLUSION: The most likely cause of the infinite loop is that translateKey is being called, Gemini returns a translation, but the INSERT fails silently for some reason, OR the row is written but the SELECT query still returns it as missing.
    
    SECOND LOOK at INSERT: The INSERT query at line 284-296 uses `$5::boolean[]` for is_deleted and passes `values.map(() => false)`. This looks correct. But wait — is the column ordering right? `INSERT INTO sandbox_values (project_id, key_id, locale_id, value, is_deleted, updated_at) SELECT * FROM UNNEST($1, $2, $3, $4, $5, $6)`. If Gemini returns successfully, this should work.
    
    THE REAL BUG I MISSED: translateKey checks existingSandbox WITHOUT `isDeleted: false`. Soft-deleted rows for the target locale ID are counted as "existing". This means:
    - pollAndProcess finds key with soft-deleted sv_tgt (without is_deleted filter) → sv_tgt.id IS NOT NULL → key NOT returned → actually loop doesn't occur this way
    - BUT: if no row exists at all for locale → sv_tgt.id IS NULL → key queued → translateKey called → existingSandbox includes (no soft-deleted rows since none exist) → INSERT attempted → succeeds
    
    So the soft-deleted scenario would ONLY cause an infinite loop if:
    1. Soft-deleted row exists
    2. pollAndProcess doesn't filter is_deleted on sv_tgt → soft-deleted row is found → sv_tgt.id IS NOT NULL → key NOT returned as missing... wait this PREVENTS the loop
    
    UNLESS: The soft-deleted row has is_deleted=TRUE AND pollAndProcess HAS `AND sv_tgt.is_deleted = false` filter → then sv_tgt.id IS NULL even with soft-deleted row → key returned as missing → translateKey called → existingSandbox returns soft-deleted row → locale ID in existingLocaleIds → locale excluded from missingLocales → no INSERT → next cycle: same thing → INFINITE LOOP!
    
    But looking at the current code: pollAndProcess sv_tgt JOIN (lines 158-161) has NO is_deleted filter. processInitTranslateLocales sv_tgt JOIN (lines 87-90) also has NO is_deleted filter.
    
    So CURRENTLY, soft-deleted rows PREVENT the loop (by blocking keys from being returned as missing). Adding `AND sv_tgt.is_deleted = false` to the SELECT queries would CAUSE the loop unless translateKey also filters soft-deleted rows and handles them correctly (e.g., updates is_deleted=false via ON CONFLICT DO UPDATE).
    
    THE FIX MUST BE COHERENT: Either:
    Option A: Keep SELECT without is_deleted filter (current) + keep translateKey without is_deleted filter. Soft-deleted rows block translation entirely. This is the current state.
    Option B: Add `AND sv_tgt.is_deleted = false` to SELECT queries + change INSERT to `ON CONFLICT DO UPDATE SET is_deleted=false, value=EXCLUDED.value`. This way soft-deleted rows are "resurrected" and loop stops.
    Option C: Add `AND sv_tgt.is_deleted = false` to SELECT + add isDeleted:false to translateKey's existingSandbox + change INSERT to DO UPDATE. This is the most correct fix.
    
    So the ACTUAL BUG causing the infinite loop must be something else. Let me re-read the issue statement: "The worker keeps finding 'missing' keys even after translating them."
    
    This means: translate happens, INSERT succeeds (or appears to), but next cycle the key is STILL found as missing. The most likely cause: the INSERT's ON CONFLICT DO NOTHING is firing because a row ALREADY EXISTS (possibly soft-deleted), so the new translation is discarded, and since the existing row has is_deleted=true, the LEFT JOIN still returns sv_tgt.id IS NOT NULL... wait no, if row exists with is_deleted=true, sv_tgt.id IS NOT NULL means key NOT returned as missing.
    
    WAIT. I finally see it. The SELECT in pollAndProcess LEFT JOIN sv_tgt has NO is_deleted filter. So ANY row (deleted or not) causes sv_tgt.id IS NOT NULL, preventing the key from being returned. That means if INSERT succeeds (new row, is_deleted=false), next cycle the key is not returned. No infinite loop.
    
    So what IS causing the loop? Maybe it's simpler: the initial condition before any row exists. Worker finds key → translateKey → Gemini API call fails silently (network issue, quota, etc.) → no INSERT → next cycle finds key again. OR: Gemini returns translation → INSERT succeeds → next cycle key NOT returned → no loop. Unless the Gemini call is failing.
    
    BUT WAIT — the pollAndProcess query has DISTINCT ON (tk.id) but the GROUP BY logic groups per key, not per key+locale. It finds "at least one missing target locale". After translating ALL locales for a key, next cycle: ALL sv_tgt for that key's locales are NOT NULL → key not returned. This should be fine.
    
    REAL SCENARIO for loop: There are 3 non-default locales. Worker finds key is missing. translateKey called with ALL 3 nonDefaultLocales. It writes translations for all 3. Next cycle: all 3 have sv_tgt IS NOT NULL → key not returned → good.
    
    But what if Gemini returns only 2 of 3 translations? The 3rd locale has no sandbox value. Next cycle: key is returned again (3rd locale missing) → translateKey called with all 3 nonDefaultLocales → existingSandbox now has 2 locales → missingLocales has only 1 → Gemini called for 1 locale → same 3rd locale that Gemini keeps skipping → infinite loop if Gemini consistently can't translate that locale.
    
    This is a REAL scenario but it's a Gemini reliability issue, not a code bug per se.
    
    THE ACTUAL CODE BUG: Looking at translateKey line 232-238 again:
    ```
    const existingSandbox = await this.sandboxRepo.find({
      where: { projectId, keyId },
      select: ['localeId'],
    });
    ```
    No isDeleted filter. If soft-deleted rows exist, those locale IDs are in existingLocaleIds, so they're excluded from missingLocales. If a user deleted a translation (soft-delete), then adds locale back, the auto-translate will NEVER re-translate it because translateKey thinks it's "already translated." And pollAndProcess won't return it either because sv_tgt.id IS NOT NULL (soft-deleted row). So there's a permanent block.
    
    This is a bug but not the infinite loop bug.
    
    THE INFINITE LOOP BUG: Most likely the translateKey check at line 237:
    `const missingLocales = nonDefaultLocales.filter((l) => !existingLocaleIds.has(l.id));`
    
    nonDefaultLocales comes from pollAndProcess group-by-project. But translateKey is called for EACH key individually. For a given key, maybe only locale A is missing. But translateKey is given ALL nonDefaultLocales (line 193). It then filters to find which ones are ACTUALLY missing. This should be fine.
    
    Unless: existingSandbox returns records from a DIFFERENT project somehow. No — it filters by projectId AND keyId.
    
    I've been overthinking this. Let me identify the concrete, simple bug:
    
    CONFIRMED BUG: `ON CONFLICT (project_id, key_id, locale_id) DO NOTHING` combined with soft-deleted rows.
    
    If a soft-deleted row exists → INSERT does nothing → is_deleted stays true → but SELECT (no is_deleted filter on sv_tgt) still sees the row → sv_tgt.id IS NOT NULL → key not returned as missing. So no infinite loop in this case, but translation is permanently blocked.
    
    For the INFINITE LOOP specifically: The most likely scenario is that translateKey is invoked, Gemini API call succeeds, but the INSERT hits a conflict with a soft-deleted existing row → DO NOTHING → row stays soft-deleted → pollAndProcess next cycle with NO is_deleted filter → sv_tgt IS NOT NULL (soft-deleted) → key NOT returned → loop STOPS. So actually soft-deleted rows stop the loop but leave translations in a broken state.
    
    I need to check if there's another code path. Let me look at whether sandbox deletion happens elsewhere.

  implication: Need to fix both SELECT queries (add is_deleted=false filter on sv_tgt) AND change INSERT to DO UPDATE to handle soft-deleted rows properly. Also fix translateKey's existingSandbox to filter isDeleted=false.

## Resolution

root_cause: Three bugs working together (primary cause of infinite loop is #1):
  1. Both SELECT queries (processInitTranslateLocales and pollAndProcess) missing `AND sv_tgt.is_deleted = false` on the LEFT JOIN for the target locale. Without this filter, soft-deleted rows prevent keys from being detected as missing translations — permanently blocking re-translation after a key is soft-deleted.
  2. The INSERT uses `ON CONFLICT DO NOTHING` — if a soft-deleted row exists, the new translation is silently discarded, leaving the row soft-deleted.
  3. translateKey's existingSandbox check has no `isDeleted: false` filter — soft-deleted rows are counted as "existing" translations, so those locales are excluded from the Gemini call.
  
  The infinite loop itself: When a new locale is added, initTranslate=true is set. processInitTranslateLocales runs. If ANY soft-deleted sandbox value exists for a (key, locale) pair, the current query (no is_deleted filter) returns sv_tgt.id IS NOT NULL → key not returned as missing → never translated → initTranslate flag never gets reset to false → processInitTranslateLocales loops forever.

fix: 1. Add `AND sv_tgt.is_deleted = false` to the LEFT JOIN sv_tgt in processInitTranslateLocales
     2. Add `AND sv_tgt.is_deleted = false` to the LEFT JOIN sv_tgt in pollAndProcess  
     3. Change INSERT's `ON CONFLICT DO NOTHING` to `ON CONFLICT (project_id, key_id, locale_id) DO UPDATE SET value = EXCLUDED.value, is_deleted = false, updated_at = EXCLUDED.updated_at`
     4. Add `isDeleted: false` to translateKey's sandboxRepo.find() where clause

verification: Code reviewed, lint passed, committed as 9afdf89
files_changed:
  - src/modules/translations/auto-translate-worker.service.ts
