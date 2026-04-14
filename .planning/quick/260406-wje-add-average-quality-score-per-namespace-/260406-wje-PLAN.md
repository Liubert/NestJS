---
phase: quick
plan: 260406-wje
type: execute
wave: 1
depends_on: []
files_modified:
  - src/modules/translations/translations.service.ts
  - admin-ui/src/pages/projects/ProjectSettingsPage.tsx
autonomous: true
requirements: [QUICK-260406-wje]
must_haves:
  truths:
    - "Each namespace in project details response includes avgScore (number or null)"
    - "ProjectSettingsPage shows quality score badge next to namespace name when avgScore is not null"
    - "Namespaces with no checked translations show no score badge"
  artifacts:
    - path: "src/modules/translations/translations.service.ts"
      provides: "Updated ProjectDetails interface and getProjectDetails with avgScore SQL"
      contains: "avgScore"
    - path: "admin-ui/src/pages/projects/ProjectSettingsPage.tsx"
      provides: "Quality score badge in namespace tags"
      contains: "avgScore"
  key_links:
    - from: "admin-ui/src/pages/projects/ProjectSettingsPage.tsx"
      to: "src/modules/translations/translations.service.ts"
      via: "GET /translations/projects/:slug API response"
      pattern: "avgScore"
---

<objective>
Add average quality score per namespace to the project details endpoint and display it in ProjectSettingsPage.

Purpose: Give users visibility into translation quality per namespace at a glance.
Output: Updated backend response shape + frontend badge display.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/modules/translations/translations.service.ts (lines 76-86 for ProjectDetails interface, lines 296-328 for getProjectDetails method)
@src/modules/translations/entities/translation-value.entity.ts (quality_score column, nullable int)
@src/modules/translations/entities/namespace.entity.ts (NamespaceEntity with id, slug, projectId, keys relation)
@admin-ui/src/pages/projects/ProjectSettingsPage.tsx (ProjectDetails interface lines 46-56, namespace rendering lines 718-758)

<interfaces>
<!-- Key types the executor needs -->

From src/modules/translations/translations.service.ts:
```typescript
export interface ProjectDetails {
  id: string;
  slug: string;
  name: string;
  ownerId: string | null;
  createdAt: Date;
  locales: LocaleInfo[];
  namespaces: string[];           // <-- CHANGING to NamespaceInfo[]
  autoTranslateEnabled: boolean;
  aiTokenDailyLimit: number | null;
}
```

From src/modules/translations/entities/translation-value.entity.ts:
```typescript
@Column({ name: 'quality_score', type: 'int', nullable: true })
qualityScore!: number | null;
```

DB relationships: translation_namespaces -> translation_keys (via namespace_id) -> translation_values (via key_id)
So the join path is: namespace.id -> key.namespaceId -> value.keyId, filtering on value.qualityScore IS NOT NULL.

Injected repos in TranslationsService:
- namespaceRepo: Repository<NamespaceEntity>
- valueRepo: Repository<TranslationValueEntity>
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add avgScore to backend ProjectDetails and getProjectDetails query</name>
  <files>src/modules/translations/translations.service.ts</files>
  <action>
1. Add a new interface above ProjectDetails (around line 76):
```typescript
export interface NamespaceInfo {
  slug: string;
  avgScore: number | null;
}
```

2. Update ProjectDetails interface — change `namespaces: string[]` to `namespaces: NamespaceInfo[]`.

3. In `getProjectDetails()` (line 296), replace the simple `namespaceRepo.findBy` with a query that also computes average quality score. Use `namespaceRepo.createQueryBuilder` to join through keys to values and compute AVG:

```typescript
const nsRows = await this.namespaceRepo
  .createQueryBuilder('ns')
  .select('ns.slug', 'slug')
  .addSelect(
    'ROUND(AVG(tv.quality_score))::int',
    'avgScore',
  )
  .leftJoin('ns.keys', 'tk')
  .leftJoin('tk.values', 'tv', 'tv.quality_score IS NOT NULL')
  .where('ns.project_id = :projectId', { projectId: project.id })
  .groupBy('ns.id')
  .addGroupBy('ns.slug')
  .getRawMany<{ slug: string; avgScore: string | null }>();
```

4. Map the result in the return statement:
```typescript
namespaces: nsRows.map((r) => ({
  slug: r.slug,
  avgScore: r.avgScore !== null ? Number(r.avgScore) : null,
})),
```

Note: The LEFT JOIN with `tv.quality_score IS NOT NULL` condition ensures only values that have been quality-checked contribute to the average. Namespaces with zero checked values will get avgScore = null (AVG of no rows = null).
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>GET /translations/projects/:slug returns namespaces as array of {slug, avgScore} objects instead of plain strings. TypeScript compiles without errors.</done>
</task>

<task type="auto">
  <name>Task 2: Update ProjectSettingsPage to display avgScore badge</name>
  <files>admin-ui/src/pages/projects/ProjectSettingsPage.tsx</files>
  <action>
1. Update the frontend `ProjectDetails` interface (line 46-56): change `namespaces: string[]` to `namespaces: { slug: string; avgScore: number | null }[]`.

2. Update namespace rendering (lines 718-758). Currently iterates `p.namespaces.map((ns) => ...)` where `ns` is a string. Change to destructure the object:

```tsx
{p.namespaces.map(({ slug: ns, avgScore }) => (
  <Tag
    key={ns}
    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
  >
    {ns}
    {avgScore !== null && (
      <Text
        type="secondary"
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: avgScore >= 80 ? '#52c41a' : avgScore >= 60 ? '#faad14' : '#ff4d4f',
        }}
      >
        {avgScore}/100
      </Text>
    )}
    {/* ...rest of icons unchanged, but use ns variable everywhere */}
  </Tag>
))}
```

3. Update all references inside the `.map()` callback that used `ns` as a plain string. The variable `ns` is now extracted via destructuring `{ slug: ns, avgScore }`, so existing usages of `ns` (in EditOutlined onClick, resetNsTranslationsMutation, removeNsMutation, Popconfirm titles) remain correct — `ns` is still the slug string.

4. Fix the empty-state check: change `p.namespaces.length === 0` — this stays the same since it's checking array length.

5. Fix the `initTranslateChecked` alert condition (line 876): `p.namespaces.length > 0` — stays the same.

Color coding for the score badge:
- Green (#52c41a) for score >= 80
- Yellow (#faad14) for score >= 60
- Red (#ff4d4f) for score < 60
- No badge shown when avgScore is null (no checked translations)
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js/admin-ui && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>Each namespace tag in ProjectSettingsPage shows a colored "XX/100" score badge when quality data exists. No badge shown for namespaces without quality checks.</done>
</task>

</tasks>

<verification>
1. Backend compiles: `npx tsc --noEmit` in project root
2. Frontend compiles: `cd admin-ui && npx tsc --noEmit`
3. Lint passes: `npm run lint:js` in project root, `cd admin-ui && npx tsc --noEmit`
</verification>

<success_criteria>
- GET /translations/projects/:slug returns namespaces as `{ slug: string, avgScore: number | null }[]`
- ProjectSettingsPage renders colored score badge next to namespace name when avgScore is present
- No badge shown when avgScore is null
- Both backend and frontend compile without errors
</success_criteria>

<output>
After completion, create `.planning/quick/260406-wje-add-average-quality-score-per-namespace-/260406-wje-SUMMARY.md`
</output>
