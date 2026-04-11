---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/modules/translations/sandbox.service.ts
  - src/modules/translations/translations.controller.ts
  - admin-ui/src/pages/translations/components/columns.tsx
  - admin-ui/src/pages/translations/TranslationsPage.tsx
autonomous: true
requirements: [QUICK-reset-per-locale]
must_haves:
  truths:
    - "User can reset sandbox translations for a specific locale in a namespace"
    - "Default (source) locale cannot be reset — button hidden, backend rejects"
    - "After reset, auto-translate worker re-translates the locale"
    - "Reset button appears in locale column header only in sandbox mode"
  artifacts:
    - path: "src/modules/translations/sandbox.service.ts"
      provides: "deleteLocaleSandboxTranslations method"
      contains: "deleteLocaleSandboxTranslations"
    - path: "src/modules/translations/translations.controller.ts"
      provides: "POST endpoint for per-locale reset"
      contains: "reset-translations"
    - path: "admin-ui/src/pages/translations/components/columns.tsx"
      provides: "Per-locale reset button in column header"
      contains: "onResetLocale"
    - path: "admin-ui/src/pages/translations/TranslationsPage.tsx"
      provides: "Mutation and wiring for per-locale reset"
      contains: "resetLocaleTranslationsMutation"
  key_links:
    - from: "admin-ui/src/pages/translations/TranslationsPage.tsx"
      to: "/translations/projects/:slug/namespaces/:ns/locales/:locale/reset-translations"
      via: "apiClient.post in resetLocaleTranslationsMutation"
      pattern: "apiClient\\.post.*reset-translations"
    - from: "src/modules/translations/translations.controller.ts"
      to: "src/modules/translations/sandbox.service.ts"
      via: "sandboxService.deleteLocaleSandboxTranslations"
      pattern: "deleteLocaleSandboxTranslations"
---

<objective>
Add a "reset translations for this locale" feature to the sandbox table. Users can reset all sandbox translations for a specific non-default locale within a namespace, triggering auto-translate to re-translate them.

Purpose: When AI translations for a specific locale are unsatisfactory (e.g., after changing locale guidance or AI config), users need to reset just that locale — not the entire namespace.
Output: Backend endpoint + frontend button in locale column header.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/modules/translations/sandbox.service.ts (deleteNamespaceSandboxTranslations at line 848 — pattern to copy)
@src/modules/translations/translations.controller.ts (resetNamespaceTranslations at line 631 — pattern to copy)
@admin-ui/src/pages/translations/components/columns.tsx (buildColumns at line 55, locale column at line 120)
@admin-ui/src/pages/translations/TranslationsPage.tsx (resetNsTranslationsMutation at line 306, buildColumns call at line 371, defaultLocale at line 217)
@admin-ui/src/pages/translations/components/types.ts (LocaleInfo, Entry, EntriesTableProps)

<interfaces>
<!-- From types.ts -->
```typescript
export interface LocaleInfo {
  code: string;
  isDefault: boolean;
}
export interface ProjectDetails {
  slug: string;
  name: string;
  locales: LocaleInfo[];
  namespaces: NamespaceInfo[];
}
```

<!-- From sandbox.service.ts — method to copy pattern from -->
```typescript
async deleteNamespaceSandboxTranslations(
  projectSlug: string,
  nsSlug: string,
  userId: string,
  role: UserRole,
): Promise<{ deleted: number }>
```

<!-- From translations.controller.ts — endpoint to copy pattern from -->
```typescript
@Post('projects/:slug/namespaces/:ns/reset-translations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
async resetNamespaceTranslations(
  @Param('slug') slug: string,
  @Param('ns') ns: string,
  @CurrentUser() user: CurrentUserType,
): Promise<{ deleted: number }>
```

<!-- From columns.tsx — current buildColumns signature -->
```typescript
export function buildColumns(
  locales: string[],
  projectSlug: string,
  namespace: string,
  isSandbox: boolean | undefined,
  onQualityUpdate: () => void,
  onEdit: ((entry: Entry) => void) | undefined,
  onDelete: ((key: string) => void) | undefined,
  getFlagForCode: (code: string) => string,
  renderKeyExtra?: (key: string, namespace: string) => React.ReactNode,
  deleteConfirmTitle?: string,
  deleteConfirmDescription?: string,
): ColumnsType<Entry>
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Backend — add deleteLocaleSandboxTranslations service method and controller endpoint</name>
  <files>src/modules/translations/sandbox.service.ts, src/modules/translations/translations.controller.ts</files>
  <action>
**1. sandbox.service.ts** — Add new method `deleteLocaleSandboxTranslations` after `deleteNamespaceSandboxTranslations` (after line 904). Copy the pattern from `deleteNamespaceSandboxTranslations` but target a specific locale instead of all non-default locales:

```typescript
async deleteLocaleSandboxTranslations(
  projectSlug: string,
  nsSlug: string,
  localeCode: string,
  userId: string,
  role: UserRole,
): Promise<{ deleted: number }>
```

Implementation:
- Access check: `if (!this.isAdmin(role) && project.ownerId !== userId)` — throw ForbiddenException "Only the project owner or admin can reset locale translations"
- Find project via `this.requireProject(projectSlug)`
- Find namespace: `this.namespaceRepo.findOne({ where: { projectId: project.id, slug: nsSlug } })` — throw NotFoundException if not found
- Find locale: `this.localeRepo.findOne({ where: { projectId: project.id, code: localeCode } })` — throw NotFoundException if not found
- Guard: if `locale.isDefault === true`, throw `BadRequestException('Cannot reset the default (source) locale')` — source locale values are the reference
- SQL DELETE: same pattern as deleteNamespaceSandboxTranslations but filtering by specific locale_id instead of excluding default:
  ```sql
  DELETE FROM sandbox_values
  WHERE project_id = $1
    AND locale_id = $2
    AND key_id IN (SELECT id FROM translation_keys WHERE namespace_id = $3)
  RETURNING id
  ```
  Parameters: `[project.id, locale.id, ns.id]`
- If deletedRows.length > 0: `this.projectRepo.update(project.id, { sandboxHasChanges: true })`
- Always trigger re-translation: `this.autoTranslateWorkerService.triggerForNamespace(project.id, ns.id)`
- Reset quality states for the deleted locale's remaining sandbox values (same pattern as existing method but also filter by locale_id):
  ```sql
  UPDATE sandbox_values
  SET quality_review_state = 'not_checked'
  WHERE project_id = $1
    AND locale_id = $2
    AND key_id IN (SELECT id FROM translation_keys WHERE namespace_id = $3)
    AND is_deleted = false
  ```
  Note: After the DELETE, this UPDATE may match 0 rows (all were deleted), which is fine — it's a safety net.
- Return `{ deleted: deletedCount }`

**2. translations.controller.ts** — Add new endpoint after `resetNamespaceTranslations` (after line 649). Copy pattern from lines 631-649:

```typescript
@Post('projects/:slug/namespaces/:ns/locales/:locale/reset-translations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiOperation({
  summary: 'Delete sandbox translations for a specific locale in a namespace — auto-translate worker will re-translate',
})
async resetLocaleTranslations(
  @Param('slug') slug: string,
  @Param('ns') ns: string,
  @Param('locale') locale: string,
  @CurrentUser() user: CurrentUserType,
): Promise<{ deleted: number }> {
  return this.sandboxService.deleteLocaleSandboxTranslations(
    slug,
    ns,
    locale,
    user.userId,
    user.role,
  );
}
```

Ensure `BadRequestException` is imported in sandbox.service.ts if not already (check existing imports).
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx tsc --noEmit --project tsconfig.build.json 2>&1 | head -30</automated>
  </verify>
  <done>New POST endpoint /translations/projects/:slug/namespaces/:ns/locales/:locale/reset-translations exists, backed by deleteLocaleSandboxTranslations service method. TypeScript compiles without errors. Default locale is rejected with 400.</done>
</task>

<task type="auto">
  <name>Task 2: Frontend — add per-locale reset button to column headers and wire mutation</name>
  <files>admin-ui/src/pages/translations/components/columns.tsx, admin-ui/src/pages/translations/TranslationsPage.tsx</files>
  <action>
**1. columns.tsx** — Modify `buildColumns` to support per-locale reset:

Add two new optional parameters at the end of the signature (after `deleteConfirmDescription`):
```typescript
onResetLocale?: (locale: string) => void,
defaultLocale?: string,
```

Add import for `SyncOutlined` from `@ant-design/icons` (add to existing icon imports), and `Popconfirm` and `Button` from `antd` (add to existing antd imports — check if already imported).

Modify the locale column mapping (line 120-154). Currently `title` is a simple `<Tag>`. When `isSandbox && onResetLocale && locale !== defaultLocale`, wrap the tag in a `<Space size={4}>` that adds a reset button:

```tsx
title: (
  <Space size={4}>
    <Tag color="blue">
      {getFlagForCode(locale)} {locale}
    </Tag>
    {isSandbox && onResetLocale && locale !== defaultLocale && (
      <Popconfirm
        title={`Reset "${locale}" translations?`}
        description="All sandbox translations for this locale will be deleted and re-translated automatically."
        onConfirm={() => onResetLocale(locale)}
        okText="Reset"
        okButtonProps={{ danger: true }}
      >
        <Button
          type="text"
          size="small"
          icon={<SyncOutlined />}
          danger
          style={{ padding: '0 2px', height: 20, width: 20, minWidth: 20 }}
        />
      </Popconfirm>
    )}
  </Space>
),
```

When `!isSandbox || !onResetLocale || locale === defaultLocale`, keep the original simple `<Tag>` (no wrapping Space needed for cleanliness, but keeping it in a Space is also fine — the Space with a single child renders identically).

**2. TranslationsPage.tsx** — Add mutation and pass to buildColumns:

Add `resetLocaleTranslationsMutation` after `resetNsQualityMutation` (after line 330). Follow the same pattern as `resetNsTranslationsMutation` (lines 306-317):

```typescript
const resetLocaleTranslationsMutation = useMutation({
  mutationFn: (locale: string) =>
    apiClient.post(
      `/translations/projects/${projectSlug}/namespaces/${namespace}/locales/${locale}/reset-translations`,
    ),
  onSuccess: (_data, locale) => {
    message.success(`Translations for "${locale}" deleted — auto-translate will re-translate`);
    invalidate();
  },
  onError: (e: any) =>
    message.error(e.response?.data?.message ?? 'Error resetting locale translations'),
});
```

Update the `buildColumns` call in `useMemo` (line 371-392) to pass the two new parameters:

```typescript
const columns = useMemo(
  () =>
    buildColumns(
      locales,
      projectSlug,
      namespace,
      isSandbox,
      invalidate,
      updateFn ? (entry) => { ... } : undefined,
      deleteFn ? (key) => deleteMutation.mutate(key) : undefined,
      getFlagForCode,
      renderKeyExtra,
      deleteConfirmTitle,
      deleteConfirmDescription,
      isSandbox ? (locale) => resetLocaleTranslationsMutation.mutate(locale) : undefined,
      defaultLocale,
    ),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [locales, projectSlug, namespace, isSandbox, invalidate, getFlagForCode, renderKeyExtra, deleteConfirmTitle, deleteConfirmDescription, defaultLocale],
);
```

Note: `resetLocaleTranslationsMutation` is intentionally excluded from the deps array (same pattern as `deleteMutation` — it's a stable ref from useMutation).
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js/admin-ui && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>Locale column headers in sandbox mode show a small red sync button next to non-default locale tags. Clicking shows a Popconfirm, confirming calls the reset endpoint. Default locale has no button. TypeScript compiles without errors.</done>
</task>

</tasks>

<verification>
1. Backend compiles: `cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx tsc --noEmit --project tsconfig.build.json`
2. Frontend compiles: `cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js/admin-ui && npx tsc --noEmit`
3. Lint passes: `cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npm run lint:js` and `cd admin-ui && npx eslint src/pages/translations/components/columns.tsx src/pages/translations/TranslationsPage.tsx`
</verification>

<success_criteria>
- POST /translations/projects/:slug/namespaces/:ns/locales/:locale/reset-translations endpoint exists and is guarded by JwtAuthGuard
- Default locale is rejected with BadRequestException
- Non-owner non-admin users are rejected with ForbiddenException
- Sandbox translations for the specific locale are deleted, sandboxHasChanges set to true
- Auto-translate worker is triggered after reset
- Frontend shows a small danger sync button next to each non-default locale column header in sandbox mode
- Button is hidden for default locale and for production mode
- Clicking the button and confirming calls the endpoint and invalidates queries
</success_criteria>

<output>
After completion, create `.planning/quick/260409-qyy-add-reset-per-locale-feature-to-sandbox-/260409-qyy-SUMMARY.md`
</output>
