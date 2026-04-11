---
status: awaiting_human_verify
trigger: "reset-translations-not-working"
created: 2026-04-06T00:00:00Z
updated: 2026-04-06T00:00:00Z
---

## Current Focus

hypothesis: After reset, worker never re-translates because: (1) auto_translate_enabled = false for project, AND (2) AutoTranslateWorkerService has no public method to trigger for a specific project bypassing the flag
test: Confirmed via curl — endpoint works (deleted 2 rows), but worker logs "No keys need auto-translation" because auto_translate_enabled = false
expecting: Fix by adding triggerForProject() to AutoTranslateWorkerService, exporting it, injecting into SandboxService, calling it fire-and-forget after deletion
next_action: Implement fixes in 4 files

## Symptoms

expected: Clicking "Reset translations" for a namespace should delete all non-default-locale sandbox values for that namespace, then auto-translate worker re-translates within ~10s
actual: User says "щось воно погано працює" (it's working badly) — no specific error described yet
errors: Unknown
reproduction: Go to TranslationsPage (sandbox tab), select a namespace, click "Reset translations" button, confirm in popconfirm
started: Just implemented in this session

## Eliminated

- hypothesis: Endpoint not registered/reachable
  evidence: curl POST /reset-translations returned {deleted: 2} successfully
  timestamp: 2026-04-06T20:10:00Z

- hypothesis: Frontend mutation broken
  evidence: Code reads correctly — posts to correct URL, calls invalidate() on success
  timestamp: 2026-04-06T20:10:00Z

- hypothesis: DELETE query has wrong SQL logic
  evidence: Hard DELETE of non-default locale rows works, confirmed 2 rows deleted
  timestamp: 2026-04-06T20:10:00Z

- hypothesis: Worker container crash is related to auto-translate feature
  evidence: nest_js_worker_1 crash-loops on missing start:worker:dev script — this is an OLD orphaned container from a removed compose service. AutoTranslateWorkerService runs inside main API (confirmed by API logs)
  timestamp: 2026-04-06T20:15:00Z

## Evidence

- timestamp: 2026-04-06T20:10:00Z
  checked: curl POST /reset-translations on project kill/namespace main
  found: Returns {deleted: 2} — endpoint works
  implication: The DELETE SQL is correct

- timestamp: 2026-04-06T20:12:00Z
  checked: API logs for AutoTranslateWorkerService after deletion
  found: "No keys need auto-translation" logged every 10s
  implication: Worker is running but not picking up keys

- timestamp: 2026-04-06T20:13:00Z
  checked: Project auto_translate_enabled field
  found: autoTranslateEnabled: false for project "kill"
  implication: Worker query has WHERE p.auto_translate_enabled = true — excluded

- timestamp: 2026-04-06T20:14:00Z
  checked: deleteNamespaceSandboxTranslations method
  found: No sandboxHasChanges update after deletion
  implication: sandboxHasChanges indicator won't reflect the reset (minor secondary bug)

- timestamp: 2026-04-06T20:15:00Z
  checked: AutoTranslateWorkerService
  found: No public triggerNow() or triggerForProject() method — only private pollAndProcess()
  implication: Cannot trigger worker from outside the class

- timestamp: 2026-04-06T20:16:00Z
  checked: QualityWorkerModule exports
  found: AutoTranslateWorkerService NOT exported — only QualityWorkerService exported
  implication: Cannot inject AutoTranslateWorkerService into SandboxService without export change

## Resolution

root_cause: After deleteNamespaceSandboxTranslations hard-deletes non-default locale rows, the auto-translate worker never picks them up because (1) AutoTranslateWorkerService.pollAndProcess() requires p.auto_translate_enabled = true (project had it false), and (2) there was no mechanism to trigger immediate re-translation for a specific namespace bypassing that flag. Secondary bug: sandboxHasChanges was not updated after reset.

fix: Added AutoTranslateWorkerService.triggerForNamespace(projectId, namespaceId) — a public fire-and-forget method that translates all keys in the namespace missing non-default locale sandbox values, bypassing the auto_translate_enabled flag. Exported AutoTranslateWorkerService from QualityWorkerModule. Injected it into SandboxService. Called triggerForNamespace() after deletion in deleteNamespaceSandboxTranslations. Also added sandboxHasChanges update.

verification: Confirmed via curl and DB query — after calling POST /reset-translations, translations for "hey" key were immediately re-created for all 4 non-default locales (es: Hola, fi: Hei, is: Hæ, nb: Hei). API log shows "triggerForNamespace: translated 1 keys in namespace d71cbb74-46e4-44d0-a17e-5d6340944671". Tested twice — consistent.

files_changed:
  - src/modules/translations/auto-translate-worker.service.ts
  - src/modules/translations/sandbox.service.ts
  - src/modules/translations/quality-worker.module.ts
