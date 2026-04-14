---
phase: quick-260407-hur
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - admin-ui/package.json
  - admin-ui/src/pages/projects/ProjectSettingsPage.tsx
  - admin-ui/src/pages/translations/TranslationsPage.tsx
  - admin-ui/src/pages/translations/components/FilterBar.tsx
  - admin-ui/src/pages/translations/components/columns.tsx
  - admin-ui/src/pages/translations/components/types.ts
  - admin-ui/src/pages/translations/components/AddLocaleModal.tsx
  - admin-ui/vite.config.ts
  - src/modules/translations/ai-config.service.ts
  - src/modules/translations/ai-translate.service.ts
  - src/modules/translations/quality-worker.service.ts
  - src/modules/translations/sandbox.service.ts
  - src/modules/translations/translations.service.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "All modified files pass lint with no regressions"
    - "All changes are committed in a single clean commit"
    - "Debug artifact .planning/debug/reset-translations-not-working.md is NOT committed"
  artifacts:
    - path: "admin-ui/src/pages/translations/components/AddLocaleModal.tsx"
      provides: "New reusable locale modal component"
  key_links: []
---

<objective>
Run lint auto-fix on both backend and frontend, stage all modified/untracked files (excluding the debug artifact), and commit with a descriptive message summarizing all changes.

Purpose: Get all in-progress UI and backend improvements into git so they can be deployed to stage.
Output: One clean git commit with all 13 modified/new files.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Lint auto-fix both backend and admin-ui</name>
  <files>various (lint in-place)</files>
  <action>
    Run lint:fix on both the backend and the admin-ui to auto-fix safe issues:

    1. Backend lint fix (from repo root):
       ```
       npm run lint:fix
       ```
       Then verify no new errors:
       ```
       npm run lint:js
       ```

    2. Frontend lint fix (from admin-ui/):
       ```
       cd admin-ui && npm run lint:fix
       ```
       (admin-ui uses eslint; if `lint:fix` script is not present, run `npx eslint --fix src/`)

    Accept any errors that were already present in the baseline — only fail if NEW errors were introduced by the changes in this task's file list.
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npm run lint:js 2>&1 | tail -20</automated>
  </verify>
  <done>Both backend and frontend lint complete with no regressions vs baseline. Auto-fixed files saved to disk.</done>
</task>

<task type="auto">
  <name>Task 2: Stage and commit all changes (excluding debug artifact)</name>
  <files>all files listed in files_modified frontmatter + AddLocaleModal.tsx</files>
  <action>
    Stage exactly the files listed below. Do NOT stage `.planning/debug/reset-translations-not-working.md`.

    Files to stage:
    - admin-ui/package.json
    - admin-ui/src/pages/projects/ProjectSettingsPage.tsx
    - admin-ui/src/pages/translations/TranslationsPage.tsx
    - admin-ui/src/pages/translations/components/FilterBar.tsx
    - admin-ui/src/pages/translations/components/columns.tsx
    - admin-ui/src/pages/translations/components/types.ts
    - admin-ui/src/pages/translations/components/AddLocaleModal.tsx
    - admin-ui/vite.config.ts
    - src/modules/translations/ai-config.service.ts
    - src/modules/translations/ai-translate.service.ts
    - src/modules/translations/quality-worker.service.ts
    - src/modules/translations/sandbox.service.ts
    - src/modules/translations/translations.service.ts

    Stage using explicit paths (NOT `git add -A` or `git add .`):
    ```
    git add admin-ui/package.json \
      admin-ui/src/pages/projects/ProjectSettingsPage.tsx \
      admin-ui/src/pages/translations/TranslationsPage.tsx \
      admin-ui/src/pages/translations/components/FilterBar.tsx \
      admin-ui/src/pages/translations/components/columns.tsx \
      admin-ui/src/pages/translations/components/types.ts \
      admin-ui/src/pages/translations/components/AddLocaleModal.tsx \
      admin-ui/vite.config.ts \
      src/modules/translations/ai-config.service.ts \
      src/modules/translations/ai-translate.service.ts \
      src/modules/translations/quality-worker.service.ts \
      src/modules/translations/sandbox.service.ts \
      src/modules/translations/translations.service.ts
    ```

    Then commit with:
    ```
    git commit -m "feat(ui+api): quality filters in column header, settings gear, AddLocaleModal, context detection improvements

    - TranslationsPage: sandbox diff per-namespace, promote always selective, settings dropdown
    - FilterBar: replaced quality/sort dropdowns with settings gear icon; changedNamespaces badge
    - columns.tsx: quality filter moved to column header; ctx tags renamed to 'needs context'
    - types.ts: updated FilterBarProps and EntriesTableProps accordingly
    - ProjectSettingsPage: replaced inline locale form with reusable AddLocaleModal component
    - AddLocaleModal.tsx: new reusable modal for adding locales (extracted from ProjectSettingsPage)
    - vite.config.ts: added preview config and sourcemap support
    - admin-ui/package.json: fixed duplicate 'preview' script key
    - ai-config.service.ts: shortened DEFAULT_CONTEXT_DETECTION_PROMPT
    - ai-translate.service.ts: pass contextDetectionPrompt to buildBulkQualityPrompt
    - quality-worker.service.ts: poll interval 30s→10s, TS type fixes, contextInfo priority merge
    - sandbox.service.ts: reset quality states after reset-translations; contextNeed priority logic
    - translations.service.ts: contextNeed priority logic"
    ```

    Verify the commit does NOT include `.planning/debug/reset-translations-not-working.md`:
    ```
    git show --stat HEAD | grep -v "reset-translations-not-working"
    ```
  </action>
  <verify>
    <automated>git log --oneline -1 && git show --stat HEAD</automated>
  </verify>
  <done>
    - `git log --oneline -1` shows the new commit
    - `git show --stat HEAD` lists all 13 expected files and does NOT include the debug artifact
    - Working tree is clean for the committed files
  </done>
</task>

</tasks>

<verification>
After both tasks complete:
1. `git show --stat HEAD` lists exactly the 13 files — no more, no less
2. `.planning/debug/reset-translations-not-working.md` is still untracked (not committed)
3. No new lint errors in either backend or frontend
</verification>

<success_criteria>
- Lint auto-fix applied to both backend and admin-ui with no regressions
- Single clean commit containing all 13 modified/new files
- Debug artifact excluded from commit and remains untracked
- Repository is ready for `git push origin develop` (to be done manually by user)
</success_criteria>

<output>
No SUMMARY file needed for quick tasks. Return result inline.
</output>
