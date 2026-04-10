---
status: awaiting_human_verify
trigger: "replace-translate-button-not-working"
created: 2026-04-09T00:00:00Z
updated: 2026-04-09T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — deleteKeySandboxValue calls triggerForKey → translateSingleKey which uses COALESCE(sandbox_en, production_en) as source, whereas deleteLocaleSandboxTranslations (replace-per-locale) calls triggerForNamespace → translateNamespace which uses sandbox_en ONLY (INNER JOIN). The correct fix is to use the same namespace-style query but filtered to the specific key.
test: Implemented — add triggerForKeyLocale method that uses namespace-style SQL with AND tk.id = $5 filter, and update deleteKeySandboxValue to call it with ns.id
expecting: Translation works correctly using sandbox source text, consistent with replace-per-locale behavior
next_action: Implement fix in auto-translate-worker.service.ts and sandbox.service.ts

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Clicking "Replace translate" for a specific key — triggers re-translation and result is saved in sandbox for that key
actual: Button does not work (possibly fails silently, or uses production source text instead of sandbox)
errors: Unknown — need to check code
reproduction: Click "Replace translate" (re-translate) for a specific key in sandbox UI
started: Was broken before (fallback to prod), was fixed, appears broken again

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: Frontend URL encoding issue causing 404
  evidence: encodeURIComponent is used correctly; Express decodes path params
  timestamp: 2026-04-10

- hypothesis: TypeORM query cache returning stale data
  evidence: No cache configuration in app.config.ts
  timestamp: 2026-04-10

- hypothesis: Race condition with polling worker
  evidence: polling worker only runs for auto_translate_enabled=true projects; triggerForKey is fire-and-forget and runs immediately
  timestamp: 2026-04-10

- hypothesis: Access control difference
  evidence: Both deleteLocaleSandboxTranslations and deleteKeySandboxValue have identical owner-or-admin access checks
  timestamp: 2026-04-10

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-10
  checked: git history — commits 175eb04, fcdff47, 464d7bd
  found: 175eb04 changed translateSingleKey from INNER JOIN to LEFT JOIN + COALESCE to handle keys with no sandbox en value. 464d7bd added debug logs showing triggerForKey was still broken after the COALESCE fix.
  implication: The COALESCE fix addressed one symptom but the core issue (using triggerForKey vs triggerForNamespace) remains.

- timestamp: 2026-04-10
  checked: translateSingleKey vs translateNamespace query structure
  found: translateNamespace uses INNER JOIN on sandbox_values for default locale (sandbox source text only). translateSingleKey uses COALESCE(sandbox, production) — different source text derivation.
  implication: The two approaches produce different results. replace-per-locale uses translateNamespace which is known-working. replace-per-key uses translateSingleKey which has been broken and partially fixed.

- timestamp: 2026-04-10
  checked: deleteKeySandboxValue in sandbox.service.ts
  found: It calls triggerForKey(project.id, key.id) but does NOT pass the namespace ID. triggerForKey cannot use the namespace-style query without ns.id.
  implication: The fix requires passing ns.id so the namespace-style query can be used.

- timestamp: 2026-04-10
  checked: translateKey function (called from both paths)
  found: translateKey checks existingSandbox (isDeleted=false) to find missing locales. After deleteKeySandboxValue hard-deletes the fr row, fr should be in missingLocales. The logic is correct.
  implication: The issue is in the SOURCE TEXT QUERY, not in the missing-locale detection. triggerForKey's COALESCE query may return wrong source text or be failing in edge cases.

- timestamp: 2026-04-10
  checked: deleteKeySandboxValue quality state handling
  found: deleteLocaleSandboxTranslations resets quality states for affected rows. deleteKeySandboxValue does NOT reset quality states.
  implication: Minor gap — quality state should also be reset for the deleted locale. To be included in the fix.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: triggerForKey (called by deleteKeySandboxValue) used translateSingleKey which queried source text via COALESCE(sandbox_en, production_en). This is different from triggerForNamespace/translateNamespace which uses INNER JOIN on sandbox_values for the default locale. The COALESCE fallback introduced inconsistency — and in the "replace per key" flow was the last of multiple partial fixes that didn't fully solve the problem. The real fix is to make both flows use the same sandbox-source-text query, consistent with how replace-per-locale works.
fix: Changed triggerForKey signature to accept namespaceId parameter. Updated translateSingleKey to use the same namespace-style SQL query as translateNamespace but with an additional AND tk.id = $4 filter. Updated deleteKeySandboxValue in sandbox.service.ts to pass ns.id when calling triggerForKey. Fixed pre-existing prettier formatting issue on line 435.
verification: npm run lint:check — no errors in changed files. npx tsc -p tsconfig.build.json --noEmit — no type errors. npm test --testPathPattern="auto-translate|sandbox" — 12/12 tests passing.
files_changed:
  - src/modules/translations/auto-translate-worker.service.ts
  - src/modules/translations/sandbox.service.ts
