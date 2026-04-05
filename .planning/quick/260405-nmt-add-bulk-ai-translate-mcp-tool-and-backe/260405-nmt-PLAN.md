---
phase: quick
plan: 260405-nmt
type: execute
wave: 1
depends_on: []
files_modified:
  - src/modules/translations/dto/bulk-ai-translate.dto.ts
  - src/modules/translations/ai-translate.service.ts
  - src/modules/translations/translations.controller.ts
  - mcp-server/src/tools/ai.ts
autonomous: true
requirements: [bulk-ai-translate]
must_haves:
  truths:
    - "POST /translations/ai-translate/bulk accepts array of entries and returns keyed translations for all target locales"
    - "Entries are processed in chunks of 10 with one Gemini call per chunk"
    - "MCP tool bulk_ai_translate calls the bulk endpoint and returns formatted results with save guidance"
  artifacts:
    - path: "src/modules/translations/dto/bulk-ai-translate.dto.ts"
      provides: "BulkAiTranslateDto with nested BulkAiTranslateEntryDto"
    - path: "src/modules/translations/ai-translate.service.ts"
      provides: "bulkTranslate() method"
    - path: "src/modules/translations/translations.controller.ts"
      provides: "POST ai-translate/bulk endpoint"
    - path: "mcp-server/src/tools/ai.ts"
      provides: "bulk_ai_translate tool registration"
  key_links:
    - from: "translations.controller.ts"
      to: "ai-translate.service.ts"
      via: "aiTranslateService.bulkTranslate()"
      pattern: "bulkTranslate"
    - from: "mcp-server/src/tools/ai.ts"
      to: "/translations/ai-translate/bulk"
      via: "apiPost"
      pattern: "ai-translate/bulk"
---

<objective>
Add bulk AI translation: one API call translates N keys across all target locales.

Purpose: Replace N separate ai_translate calls with a single bulk call for new-namespace or new-locale fill workflows.
Output: Backend endpoint + MCP tool for bulk translation.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/modules/translations/ai-translate.service.ts
@src/modules/translations/translations.controller.ts
@src/modules/translations/dto/ai-translate.dto.ts
@mcp-server/src/tools/ai.ts

<interfaces>
From src/modules/translations/ai-translate.service.ts:
```typescript
// Existing translate() method signature — bulkTranslate follows same patterns
async translate(text: string, projectId?: string, context?: string, targetLocales?: string[], localeGuidance?: Record<string, string>): Promise<Record<string, string>>

// LOCALE_NAMES map at top of file — reuse for locale display names in bulk prompt
const LOCALE_NAMES: Record<string, string> = { uk: 'Ukrainian', ... }

// DEFAULT_TARGET_LOCALES — fallback when no targetLocales provided
const DEFAULT_TARGET_LOCALES: Record<string, string> = { uk: '...', 'nb-NO': '...', sv: '...', 'da-DK': '...' }
```

From src/modules/translations/ai-config.service.ts:
```typescript
export function interpolate(template: string, vars: Record<string, string>): string;
// AiConfigService.getConfig() returns { model, translatePrompt, ... }
```

From src/modules/translations/ai-usage.service.ts:
```typescript
// logUsage({ projectId, operation, inputTokens, outputTokens, model, metadata })
```

From mcp-server/src/tools/ai.ts:
```typescript
import { apiGet, apiPost } from '../api-client.js';
import { logWrite } from '../logger.js';
import { errorResult, textResult } from '../utils.js';
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add BulkAiTranslateDto and bulkTranslate service method</name>
  <files>src/modules/translations/dto/bulk-ai-translate.dto.ts, src/modules/translations/ai-translate.service.ts</files>
  <action>
1. Create `src/modules/translations/dto/bulk-ai-translate.dto.ts`:
   - Class `BulkAiTranslateEntryDto` with fields:
     - `key: string` (@IsString, @MinLength(1))
     - `text: string` (@IsString, @MinLength(1))
     - `context?: string` (@IsOptional, @IsString, @MaxLength(1000))
   - Class `BulkAiTranslateDto` with fields:
     - `entries: BulkAiTranslateEntryDto[]` (@IsArray, @ValidateNested({ each: true }), @Type(() => BulkAiTranslateEntryDto), @ArrayMinSize(1), @ArrayMaxSize(200))
     - `projectSlug?: string` (@IsOptional, @IsString)
     - `targetLocales?: string[]` (@IsOptional, @IsArray, @IsString({ each: true }))
   - Add @ApiProperty / @ApiPropertyOptional decorators with examples and descriptions.

2. Add `bulkTranslate()` method to `AiTranslateService` in `ai-translate.service.ts`:
   - Signature: `async bulkTranslate(entries: Array<{ key: string; text: string; context?: string }>, projectId?: string, targetLocales?: string[], localeGuidance?: Record<string, string>): Promise<Record<string, Record<string, string>>>`
   - Check GEMINI_API_KEY (same pattern as translate()).
   - Build localeEntries from targetLocales or DEFAULT_TARGET_LOCALES (same logic as translate()).
   - If localeEntries is empty, return {}.
   - Build languages string from localeEntries.
   - Process entries in chunks of 10 (`const BULK_CHUNK_SIZE = 10` constant at top of method or module level).
   - Per chunk, build a prompt:
     ```
     Translate these English UI strings to ${languages}.
     Return ONLY valid JSON with no markdown, no explanation:
     { "key1": { "uk": "...", "nb-NO": "..." }, "key2": { ... } }

     Strings to translate:
     ${JSON.stringify(Object.fromEntries(chunk.map(e => [e.key, e.text])))}

     ${chunk entries with context get appended as: "Context for key 'xxx': yyy"}
     ```
   - If localeGuidance is provided, append guidance section (same pattern as translate()).
   - Call model.generateContent(prompt), clean response (same ```json``` stripping pattern).
   - Parse JSON as Record<string, Record<string, string>>.
   - On parse failure: log warning with `Logger` (`private readonly logger = new Logger(AiTranslateService.name)` — add if not present), push chunk keys to a skippedKeys array, continue to next chunk.
   - Filter each parsed key's locale map to only include requested locale codes.
   - Merge chunk results into final `Record<string, Record<string, string>>`.
   - After all chunks: log usage with operation 'bulk_translate', metadata: { keyCount: entries.length, localeCount, chunksProcessed, skippedKeys }.
   - Return merged result (do NOT include skippedKeys in return — just silently omit them; caller sees which keys are missing).

  Import `Logger` from `@nestjs/common` if not already imported. Import `Type` from `class-transformer` in DTO file.
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>BulkAiTranslateDto validates input with nested validation. bulkTranslate() processes entries in chunks of 10, handles parse failures gracefully, tracks usage.</done>
</task>

<task type="auto">
  <name>Task 2: Add bulk translate endpoint and MCP tool</name>
  <files>src/modules/translations/translations.controller.ts, mcp-server/src/tools/ai.ts</files>
  <action>
1. Add endpoint in `translations.controller.ts`:
   - Import `BulkAiTranslateDto` from `./dto/bulk-ai-translate.dto.js`.
   - Add method `bulkAiTranslate()` with route `@Post('ai-translate/bulk')` in the AI section (after the existing aiTranslate method, before ai-quality-check).
   - Apply `@UseGuards(JwtAuthGuard)`, `@ApiBearerAuth()`, `@ApiOperation({ summary: 'Bulk AI-translate multiple keys' })`.
   - Accept `@Body() dto: BulkAiTranslateDto`.
   - Return type: `Promise<Record<string, Record<string, string>>>`.
   - Body logic (same pattern as aiTranslate):
     - If dto.projectSlug: load project via getProjectBySlug, get projectId, load locales, build localeGuidance record.
     - Filter dto.targetLocales against project locales if both provided (keep only codes that exist in project locales, exclude default locale).
     - If no projectSlug and no targetLocales: pass undefined (service will use DEFAULT_TARGET_LOCALES).
     - Call `this.aiTranslateService.bulkTranslate(dto.entries, projectId, targetLocales, localeGuidance)`.
     - Return result directly.

2. Add `bulk_ai_translate` tool in `mcp-server/src/tools/ai.ts`:
   - Register after `ai_translate` tool.
   - Tool name: `bulk_ai_translate`.
   - Description: `'Translate multiple English texts to all project locales in one call using AI (Gemini). ' + 'Processes in batches of 10 keys per AI call. Max 200 entries. ' + 'Use for bulk new-namespace translation or filling a new locale. ' + 'Replaces N separate ai_translate calls with one bulk operation.'`
   - Schema:
     - `projectSlug: z.string().describe('Project slug (required for locale resolution and usage tracking)')` — NOT optional here, always required for MCP since we need project locales.
     - `entries: z.array(z.object({ key: z.string().describe('Translation key'), text: z.string().min(1).describe('English source text'), context: z.string().max(1000).optional().describe('Context for this key') })).min(1).max(200).describe('Array of entries to translate')`
     - `targetLocales: z.array(z.string()).optional().describe('Optional list of locale codes. When omitted, translates to all non-default project locales.')`
   - Handler:
     - Fetch project details (same as ai_translate): `apiGet<{ locales: { code: string; isDefault: boolean }[] }>(`/translations/projects/${projectSlug}`)`.
     - Build allProjectLocales (non-default), validate callerLocales against them (same pattern as ai_translate), track ignoredLocales.
     - Call `apiPost<Record<string, Record<string, string>>>('/translations/ai-translate/bulk', { entries, projectSlug, targetLocales, })`.
     - `logWrite('bulk_ai_translate', { projectSlug, entryCount: entries.length }, result)`.
     - Format output:
       ```
       Translated ${Object.keys(result).length} keys to [${targetLocales.join(', ')}]:

       ${JSON.stringify(result, null, 2)}

       ${ignoredLocales.length > 0 ? `Note: ignored unknown locales: ${ignoredLocales.join(', ')}` : ''}
       Use bulk_import to save — pass as data parameter: { "locale": { "key": "value" } }
       ```
     - Note: the result is keyed by translation key with locale values, but bulk_import expects locale-keyed format. The guidance tells the agent to restructure. This is intentional — the agent knows how to pivot the data.
     - Wrap in try/catch returning errorResult on failure.
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx tsc --noEmit --pretty 2>&1 | head -30 && cd mcp-server && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>POST /translations/ai-translate/bulk returns keyed translations. MCP bulk_ai_translate tool calls endpoint with project locale resolution and outputs formatted results with bulk_import save guidance.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes in both root and mcp-server
- `npm run lint:js` passes
- Manual: `curl -X POST http://localhost:3000/translations/ai-translate/bulk -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"entries":[{"key":"btn.save","text":"Save"},{"key":"btn.cancel","text":"Cancel"}],"projectSlug":"your-project"}' | jq .` returns `{ "btn.save": { "uk": "...", ... }, "btn.cancel": { ... } }`
</verification>

<success_criteria>
- Bulk endpoint translates 2+ keys in one call, returns Record<string, Record<string, string>>
- Chunk processing: 11 entries produce 2 Gemini calls (10+1)
- Parse failure in one chunk does not fail the entire request
- MCP tool resolves project locales, calls bulk endpoint, formats output with save instructions
- AI usage tracked with operation 'bulk_translate'
</success_criteria>

<output>
After completion, create `.planning/quick/260405-nmt-add-bulk-ai-translate-mcp-tool-and-backe/260405-nmt-SUMMARY.md`
</output>
