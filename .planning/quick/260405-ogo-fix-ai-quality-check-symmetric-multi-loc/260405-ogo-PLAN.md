---
phase: quick
plan: 260405-ogo
type: execute
wave: 1
depends_on: []
files_modified:
  - src/modules/translations/dto/bulk-quality-check-ai.dto.ts
  - src/modules/translations/translations.controller.ts
  - mcp-server/src/tools/ai.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "POST /translations/ai-quality-check/bulk accepts source + locale-keyed translations map and returns locale-keyed quality results"
    - "MCP ai_quality_check tool accepts translations Record<string,string> instead of single translation+locale+mode"
    - "MCP ai_quality_check output shows per-locale score/level/comment lines"
    - "Old POST /translations/ai-quality-check endpoint remains untouched"
  artifacts:
    - path: "src/modules/translations/dto/bulk-quality-check-ai.dto.ts"
      provides: "DTO for bulk AI quality check (source, translations, projectSlug?, context?)"
    - path: "src/modules/translations/translations.controller.ts"
      provides: "New ai-quality-check/bulk endpoint"
    - path: "mcp-server/src/tools/ai.ts"
      provides: "Updated ai_quality_check tool using multi-locale bulk endpoint"
  key_links:
    - from: "translations.controller.ts"
      to: "ai-translate.service.ts#bulkCheckQuality"
      via: "controller calls bulkCheckQuality with items array wrapper"
      pattern: "bulkCheckQuality"
    - from: "mcp-server/src/tools/ai.ts"
      to: "/translations/ai-quality-check/bulk"
      via: "apiPost"
      pattern: "ai-quality-check/bulk"
---

<objective>
Make ai_quality_check symmetric with ai_translate — both accept multi-locale input and return locale-keyed responses.

Purpose: Currently ai_quality_check accepts a single locale+translation pair. This is asymmetric with ai_translate which accepts multi-locale. The MCP agent has to call it N times for N locales. A bulk endpoint + updated MCP tool eliminates this.

Output: New backend endpoint POST /translations/ai-quality-check/bulk, updated MCP ai_quality_check tool.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/modules/translations/translations.controller.ts
@src/modules/translations/ai-translate.service.ts
@src/modules/translations/dto/ai-translate.dto.ts
@src/modules/translations/dto/check-quality.dto.ts
@mcp-server/src/tools/ai.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add bulk AI quality check DTO and controller endpoint</name>
  <files>src/modules/translations/dto/bulk-quality-check-ai.dto.ts, src/modules/translations/translations.controller.ts</files>
  <action>
1. Create `src/modules/translations/dto/bulk-quality-check-ai.dto.ts`:
   - `source: string` — @ApiProperty, @IsString, @MinLength(1)
   - `translations: Record<string, string>` — @ApiProperty({ example: { uk: 'Зберегти', de: 'Speichern' } }), @IsObject (from class-validator)
   - `projectSlug?: string` — @ApiPropertyOptional, @IsOptional, @IsString
   - `context?: string` — @ApiPropertyOptional, @IsOptional, @IsString, @MaxLength(1000)
   - Name the class `BulkQualityCheckAiDto` to distinguish from existing `BulkQualityCheckDto` (which is for project-scoped bulk checks by key names).

2. Add endpoint in `translations.controller.ts`:
   - Import `BulkQualityCheckAiDto` from the new DTO file and `IsObject` is not needed in controller.
   - Place BEFORE the existing `@Post('ai-quality-check')` route (line ~183) so NestJS matches `/bulk` before the non-parameterized route. Actually both are exact paths so order doesn't matter, but place it right after the existing ai-quality-check for logical grouping.
   - Route: `@Post('ai-quality-check/bulk')`
   - Guards: `@UseGuards(JwtAuthGuard)`, `@ApiBearerAuth()`
   - Swagger: `@ApiOperation({ summary: 'Bulk AI quality check for multiple locales' })`
   - Method signature: `async bulkCheckQualityAi(@Body() dto: BulkQualityCheckAiDto): Promise<Record<string, { score: number; level: string; comment: string }>>`
   - Implementation:
     a. If `dto.projectSlug` is provided, resolve projectId and localeGuidance using same pattern as `aiTranslate()` (lines 111-126 in current controller): call `getProjectBySlug`, `getProjectLocales`, build `Record<string,string>` guidance map from locales that have guidance.
     b. Call `this.aiTranslateService.bulkCheckQuality(items, undefined, undefined, projectId, localeGuidance)` where `items = [{ key: 'input', source: dto.source, context: dto.context ?? null, translations: dto.translations }]`. Pass `undefined` for chunkSize and chunkTimeoutMs to use defaults.
     c. Extract: `const localeResults = bulkResult.results['input'] ?? {};`
     d. Return `localeResults` — type is `Record<string, { score: number; level: string; comment: string }>`.
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>New DTO file exists with 4 validated fields. New POST /translations/ai-quality-check/bulk endpoint compiles, accepts multi-locale translations map, delegates to bulkCheckQuality, returns locale-keyed results.</done>
</task>

<task type="auto">
  <name>Task 2: Update MCP ai_quality_check tool to use multi-locale bulk endpoint</name>
  <files>mcp-server/src/tools/ai.ts</files>
  <action>
Replace the `ai_quality_check` tool registration (lines ~199-268) in `mcp-server/src/tools/ai.ts`:

1. Update description:
   ```
   'Check translation quality for multiple locales at once using AI.',
   'Accepts source English text and a locale-to-translation map.',
   'Returns per-locale quality score (1-100), level (green/yellow/red), and comment.',
   'Does NOT persist results — use check_entry_quality to persist.',
   'Usage is tracked per project.',
   ```

2. Update schema — remove `translation`, `locale`, `mode` parameters. Keep `projectSlug`, `source`, `context`. Add:
   - `translations: z.record(z.string(), z.string()).describe('Locale to translation map, e.g. { "uk": "Зберегти", "de": "Speichern" }')`

3. Update handler:
   - Destructure `{ projectSlug, source, translations, context }`
   - Call `apiPost<Record<string, { score: number; level: string; comment: string }>>('/translations/ai-quality-check/bulk', { source, translations, projectSlug, ...(context ? { context } : {}) })`
   - Build output lines:
     ```
     Quality check results:
     Source: "Save"

       [uk] 95/100 (green)
       [de] 61/100 (red) — Wrong register used
     ```
   - Format: for each entry in result, `[${locale}] ${r.score}/100 (${r.level})${r.comment ? ' — ' + r.comment : ''}`
   - Log with `logWrite('ai_quality_check', { projectSlug, source, localeCount: Object.keys(translations).length }, result)`
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js/mcp-server && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>MCP ai_quality_check tool accepts translations map (Record of locale to string), calls /ai-quality-check/bulk, outputs per-locale score lines. Old single-locale backend endpoint remains untouched.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes in both root and mcp-server
- `npm run lint:js` passes in both root and mcp-server
- Old `POST /translations/ai-quality-check` endpoint code unchanged (grep for `checkQuality(@Body` still present)
</verification>

<success_criteria>
- New POST /translations/ai-quality-check/bulk endpoint exists with JWT guard
- Endpoint accepts { source, translations: Record<string,string>, projectSlug?, context? }
- Endpoint returns Record<string, { score, level, comment }> (locale-keyed)
- MCP ai_quality_check accepts translations map instead of single translation+locale+mode
- MCP output shows per-locale quality lines
- Old single-locale endpoint untouched
- Both projects compile cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/260405-ogo-fix-ai-quality-check-symmetric-multi-loc/260405-ogo-SUMMARY.md`
</output>
