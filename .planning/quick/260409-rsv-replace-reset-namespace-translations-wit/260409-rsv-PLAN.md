---
phase: quick
plan: 260409-rsv
type: execute
wave: 1
depends_on: []
files_modified:
  - admin-ui/src/pages/translations/TranslationsPage.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Settings gear 'Reset translations' opens a modal with locale checkboxes instead of a simple confirm dialog"
    - "Default locale is excluded from the locale checkboxes (cannot be reset)"
    - "User can select/deselect individual locales and use 'Select all' toggle"
    - "Clicking Reset fires per-locale reset API calls for each selected locale"
    - "Single success message shown after all resets complete (not one per locale)"
    - "Per-locale column header reset button still works independently with its own success message"
  artifacts:
    - path: "admin-ui/src/pages/translations/TranslationsPage.tsx"
      provides: "Multi-locale reset modal replacing namespace-wide reset confirm"
      contains: "resetLocalesModalOpen"
  key_links:
    - from: "Modal onOk handler"
      to: "POST /translations/projects/:slug/namespaces/:ns/locales/:locale/reset-translations"
      via: "Promise.all over selectedLocalesForReset with apiClient.post"
      pattern: "Promise\\.all.*selectedLocalesForReset\\.map"
---

<objective>
Replace the namespace-level "Reset translations" confirm dialog with a multi-locale select modal that lets users choose which locales to reset individually.

Purpose: The current reset-translations action resets ALL non-default locales in one shot via a single confirm dialog. Users need finer control to reset only specific locales. The per-locale reset endpoint already exists (added in 260409-qyy), so this is purely a frontend UX improvement.

Output: Updated TranslationsPage.tsx with a Checkbox-based locale selection modal.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@admin-ui/src/pages/translations/TranslationsPage.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace reset-translations confirm with multi-locale select modal</name>
  <files>admin-ui/src/pages/translations/TranslationsPage.tsx</files>
  <action>
Make these targeted edits to TranslationsPage.tsx:

**1. Add state variables** — after line 186 (`const [addLocaleOpen, setAddLocaleOpen] = useState(false);`), add:
```typescript
const [resetLocalesModalOpen, setResetLocalesModalOpen] = useState(false);
const [selectedLocalesForReset, setSelectedLocalesForReset] = useState<string[]>([]);
```

**2. Remove `resetNsTranslationsMutation`** — delete the entire useMutation block at lines 306-317 (the one calling `/namespaces/${ns}/reset-translations`). Keep `resetNsQualityMutation` and `resetLocaleTranslationsMutation` untouched.

**3. Update `handleSettingsClick`** — replace the `'reset-translations'` branch (lines 449-456) with:
```typescript
} else if (key === 'reset-translations') {
  const nonDefault = locales.filter((l) => l !== defaultLocale);
  setSelectedLocalesForReset(nonDefault);
  setResetLocalesModalOpen(true);
}
```
Also update the dependency array of the useCallback (line 467): remove `resetNsTranslationsMutation`, add `locales` and `defaultLocale`. The new array should be:
```typescript
[namespace, resetNsQualityMutation, locales, defaultLocale]
```

**4. Add the modal JSX** — insert before the closing `</>` (line 563, after the `<AddLocaleModal>` block ends at line 562):
```tsx
<Modal
  open={resetLocalesModalOpen}
  title={`Reset translations for "${namespace}"?`}
  okText="Reset"
  okButtonProps={{ danger: true, disabled: selectedLocalesForReset.length === 0 }}
  onCancel={() => setResetLocalesModalOpen(false)}
  onOk={async () => {
    await Promise.all(
      selectedLocalesForReset.map((locale) =>
        apiClient.post(
          `/translations/projects/${projectSlug}/namespaces/${namespace}/locales/${locale}/reset-translations`,
        ),
      ),
    );
    message.success(
      `${selectedLocalesForReset.length} locale(s) reset — auto-translate will re-translate`,
    );
    invalidate();
    setResetLocalesModalOpen(false);
  }}
>
  <p style={{ marginBottom: 12 }}>
    Select locales to reset. Translations will be deleted and re-translated
    automatically. This cannot be undone.
  </p>
  <Checkbox
    checked={
      selectedLocalesForReset.length ===
      locales.filter((l) => l !== defaultLocale).length
    }
    indeterminate={
      selectedLocalesForReset.length > 0 &&
      selectedLocalesForReset.length <
        locales.filter((l) => l !== defaultLocale).length
    }
    onChange={(e) =>
      setSelectedLocalesForReset(
        e.target.checked ? locales.filter((l) => l !== defaultLocale) : [],
      )
    }
    style={{ marginBottom: 8 }}
  >
    Select all
  </Checkbox>
  <Checkbox.Group
    options={locales
      .filter((l) => l !== defaultLocale)
      .map((l) => ({ label: l, value: l }))}
    value={selectedLocalesForReset}
    onChange={(vals) => setSelectedLocalesForReset(vals as string[])}
    style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
  />
</Modal>
```

**Why use inline `apiClient.post` instead of `resetLocaleTranslationsMutation.mutateAsync`:** The existing `resetLocaleTranslationsMutation` has an `onSuccess` that shows a per-locale success toast and calls `invalidate()`. If we used it in the modal's Promise.all, users would see N individual "Translations for X deleted" toasts plus N invalidate calls. Using a direct API call lets us show a single consolidated success message and call invalidate once.

**What NOT to change:**
- Do NOT touch `resetLocaleTranslationsMutation` — it is still used by per-locale column header reset buttons
- Do NOT touch `resetNsQualityMutation` — it remains for the separate "Reset quality scores" action
- Do NOT touch `resetKeyLocaleMutation` — it is used by per-cell reset buttons
- Do NOT change `settingsItems` — the menu item key 'reset-translations' stays the same, only the handler changes
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js/admin-ui && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
    - "Reset translations" settings action opens a modal with locale checkboxes (default locale excluded)
    - "Select all" checkbox toggles all non-default locales
    - OK button is disabled when no locales selected
    - Clicking OK fires parallel per-locale reset API calls and shows single consolidated success message
    - `resetNsTranslationsMutation` (namespace-level reset) is fully removed
    - Per-locale column header reset buttons still work independently via `resetLocaleTranslationsMutation`
    - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. `cd admin-ui && npx tsc --noEmit` — no TypeScript errors
2. `cd admin-ui && npm run build` — Vite build succeeds
3. Manual: Open translations page in sandbox mode, click settings gear, click "Reset translations" — modal appears with locale checkboxes, not a confirm dialog
</verification>

<success_criteria>
- Reset translations action shows multi-locale select modal instead of simple confirm
- Default locale never appears in the checkbox list
- Single success toast after bulk reset completes
- Per-locale column header reset still works independently
- No TypeScript or build errors
</success_criteria>

<output>
After completion, create `.planning/quick/260409-rsv-replace-reset-namespace-translations-wit/260409-rsv-SUMMARY.md`
</output>
