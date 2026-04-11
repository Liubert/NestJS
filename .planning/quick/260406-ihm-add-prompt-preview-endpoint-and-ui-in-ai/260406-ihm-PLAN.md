---
phase: quick
plan: 260406-ihm
type: execute
wave: 1
depends_on: []
files_modified:
  - src/modules/translations/ai-translate.service.ts
  - src/modules/translations/translations.controller.ts
  - src/modules/translations/dto/preview-prompt.dto.ts
  - admin-ui/src/pages/ai-settings/AiSettingsPage.tsx
  - admin-ui/src/pages/ai-settings/PromptPreview.tsx
autonomous: true
requirements: [prompt-preview]

must_haves:
  truths:
    - "User can select translate or quality prompt type and see the raw prompt string"
    - "Preview endpoint returns the exact prompt that would be sent to Gemini without calling Gemini"
    - "Existing translate/quality methods still work identically after refactor"
  artifacts:
    - path: "src/modules/translations/dto/preview-prompt.dto.ts"
      provides: "DTO for preview endpoint"
    - path: "admin-ui/src/pages/ai-settings/PromptPreview.tsx"
      provides: "Prompt preview UI component"
  key_links:
    - from: "admin-ui/src/pages/ai-settings/PromptPreview.tsx"
      to: "/translations/ai-preview-prompt"
      via: "axios POST"
      pattern: "apiClient\\.post.*ai-preview-prompt"
    - from: "translations.controller.ts"
      to: "ai-translate.service.ts"
      via: "buildTranslatePrompt / buildQualityPrompt"
      pattern: "buildTranslatePrompt|buildQualityPrompt"
---

<objective>
Add a prompt preview feature that lets admins see the exact prompt string sent to Gemini for translate and quality operations, without making a Gemini call.

Purpose: Debugging and tuning AI prompts — users can verify how their prompt templates render with real inputs before spending API tokens.
Output: New backend endpoint + new UI tab in AI Settings page.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/modules/translations/ai-translate.service.ts
@src/modules/translations/ai-config.service.ts
@src/modules/translations/translations.controller.ts
@admin-ui/src/pages/ai-settings/AiSettingsPage.tsx
@admin-ui/src/pages/ai-config/AiConfigPage.tsx
@admin-ui/src/api/client.ts

<interfaces>
From ai-config.service.ts:
```typescript
export function interpolate(template: string, vars: Record<string, string>): string;

export interface AiConfigUpdate {
  model?: string;
  translatePrompt?: string;
  qualityTranslatePrompt?: string;
  qualityLanguagePrompt?: string;
  contextDetectionPrompt?: string;
}

// AiConfigEntity has fields: model, translatePrompt, qualityTranslatePrompt, qualityLanguagePrompt, contextDetectionPrompt
```

From ai-translate.service.ts:
```typescript
// translate() builds prompt at lines 57-73 using interpolate(aiCfg.translatePrompt, { text, languages }) + locale guidance
// translateForLocales() builds prompt at lines 282-296 using interpolate(aiCfg.translatePrompt, { text, languages }) + locale guidance
// checkQuality() builds prompt at lines 627-650 using interpolate(template, vars) + identicalHint + guidanceHint
// buildBulkQualityPrompt() is already a private method (lines 523-598) — reuse pattern
```

From locale-registry.ts:
```typescript
export function getLocaleName(code: string): string;
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract prompt builders and add preview endpoint</name>
  <files>
    src/modules/translations/ai-translate.service.ts,
    src/modules/translations/dto/preview-prompt.dto.ts,
    src/modules/translations/translations.controller.ts
  </files>
  <action>
1. **Create `src/modules/translations/dto/preview-prompt.dto.ts`:**
   - `type`: `@IsIn(['translate', 'quality'])` — required
   - `text`: `@IsString()` — required, the source text
   - `targetLocales`: `@IsOptional()` `Record<string, string>` — locale code to locale name map (e.g. `{ "uk": "Ukrainian", "sv": "Swedish" }`)
   - `localeSkill`: `@IsOptional()` `Record<string, string>` — locale code to guidance string map
   - `context`: `@IsOptional()` `@IsString()` — optional context
   - `locale`: `@IsOptional()` `@IsString()` — required only for quality type (the specific locale being checked)
   - `translation`: `@IsOptional()` `@IsString()` — required only for quality type (the translation text)
   - `mode`: `@IsOptional()` `@IsIn(['translation_quality', 'language_quality'])` — quality sub-mode, defaults to `translation_quality`
   - Use `@ApiProperty` / `@ApiPropertyOptional` decorators with examples as per project conventions

2. **Add two public methods to `AiTranslateService`:**
   - `buildTranslatePrompt(text: string, targetLocales: Record<string, string>, localeGuidance?: Record<string, string>, context?: string): Promise<string>`
     - Loads aiConfig via `this.aiConfig.getConfig()`
     - Builds `languages` string from targetLocales entries: `${name} (${code})`
     - Builds vars: `{ text, languages }`, adds `context` if provided
     - Calls `interpolate(aiCfg.translatePrompt, vars)`
     - Appends locale guidance lines if localeGuidance provided (same pattern as lines 66-73 in current code)
     - Returns the prompt string
   - `buildQualityPrompt(source: string, translation: string, locale: string, mode: 'translation_quality' | 'language_quality', context?: string, localeGuidance?: string): Promise<string>`
     - Loads aiConfig
     - Selects template based on mode (same as checkQuality lines 627-629)
     - Builds vars with meaning_rule (same logic as checkQuality lines 632-639)
     - Adds identicalHint if source === translation (same as lines 643-644)
     - Adds guidanceHint if localeGuidance provided (same as lines 646-648)
     - Returns `interpolate(template, vars) + identicalHint + guidanceHint`

   Then refactor existing methods to call these builders:
   - In `translate()`: replace lines 57-73 with `const prompt = await this.buildTranslatePrompt(text, Object.fromEntries(localeEntries), localeGuidance, context);`
   - In `translateForLocales()`: replace lines 282-296 with `const prompt = await this.buildTranslatePrompt(text, targetLocales, localeGuidance);`
   - In `checkQuality()`: replace lines 627-650 with `const prompt = await this.buildQualityPrompt(source, translation, locale, mode, context, localeGuidance);`

3. **Add endpoint in `translations.controller.ts`:**
   - `POST 'ai-preview-prompt'` — place in the AI section (after `ai-quality-check/bulk`, before Projects section)
   - `@UseGuards(JwtAuthGuard)`, `@ApiBearerAuth()`, `@ApiOperation({ summary: 'Preview constructed prompt without calling Gemini' })`
   - Import `PreviewPromptDto` from `./dto/preview-prompt.dto.js`
   - Handler: `async previewPrompt(@Body() dto: PreviewPromptDto): Promise<{ prompt: string }>`
   - If `dto.type === 'translate'`: call `this.aiTranslateService.buildTranslatePrompt(dto.text, dto.targetLocales ?? {}, dto.localeSkill, dto.context)` — if targetLocales is empty/missing, use a sensible default like `{ "uk": "Ukrainian" }` so the preview shows something
   - If `dto.type === 'quality'`: call `this.aiTranslateService.buildQualityPrompt(dto.text, dto.translation ?? '', dto.locale ?? 'uk', dto.mode ?? 'translation_quality', dto.context, dto.localeSkill?.[dto.locale ?? 'uk'])` — note quality prompt takes a single locale's guidance string, not the full map
   - Return `{ prompt }`
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
    - PreviewPromptDto exists with proper validators
    - buildTranslatePrompt and buildQualityPrompt are public methods on AiTranslateService
    - Existing translate/translateForLocales/checkQuality methods use the new builders (no duplicate prompt logic)
    - POST /translations/ai-preview-prompt endpoint exists, JWT-protected, returns { prompt: string }
    - TypeScript compiles cleanly
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Prompt Preview tab in AI Settings page</name>
  <files>
    admin-ui/src/pages/ai-settings/PromptPreview.tsx,
    admin-ui/src/pages/ai-settings/AiSettingsPage.tsx
  </files>
  <action>
1. **Create `admin-ui/src/pages/ai-settings/PromptPreview.tsx`:**
   - Import: React, { useState } from 'react'; Form, Input, Select, Button, Card, Space, Typography, message from 'antd'; { EyeOutlined } from '@ant-design/icons'; apiClient from '../../api/client'
   - Component `PromptPreview: React.FC`
   - State: `prompt` (string, result), `loading` (boolean)
   - Form fields inside a `<Card size="small" title="Prompt Preview">`:
     - **Type** (`type`): `<Select>` with options `[{ value: 'translate', label: 'Translate' }, { value: 'quality', label: 'Quality Check' }]` — required, default 'translate'
     - **Source Text** (`text`): `<Input.TextArea rows={2}>` — required
     - **Translation** (`translation`): `<Input.TextArea rows={2}>` — show only when type === 'quality' (use Form.Item shouldUpdate or a watched field via `Form.useWatch`)
     - **Locale** (`locale`): `<Input placeholder="uk">` — show only when type === 'quality'
     - **Mode** (`mode`): `<Select>` with options translation_quality / language_quality — show only when type === 'quality', default 'translation_quality'
     - **Target Locales** (`targetLocalesStr`): `<Input.TextArea rows={2} placeholder='{"uk": "Ukrainian", "sv": "Swedish"}'>` — show only when type === 'translate'. This is a JSON string that gets parsed before sending.
     - **Locale Skill** (`localeSkillStr`): `<Input.TextArea rows={2} placeholder='{"uk": "Use informal tone"}'>` — optional, JSON string
     - **Context** (`context`): `<Input placeholder="Button label in checkout flow">` — optional
   - **Preview button**: `<Button type="primary" icon={<EyeOutlined />} onClick={handlePreview} loading={loading}>Preview Prompt</Button>`
   - `handlePreview`:
     - Validate form, extract values
     - Parse `targetLocalesStr` as JSON (wrap in try/catch, show `message.error('Invalid JSON in target locales')` on failure)
     - Parse `localeSkillStr` as JSON if provided (same pattern)
     - POST to `/translations/ai-preview-prompt` with body: `{ type, text, targetLocales (parsed object), localeSkill (parsed object), context, translation, locale, mode }`
     - On success: set `prompt` state to `response.data.prompt`
     - On error: `message.error('Failed to preview prompt')`
   - **Result display**: Below the form, show a `<Card size="small" title="Generated Prompt" style={{ marginTop: 16 }}>` containing `<Input.TextArea value={prompt} readOnly rows={20} style={{ fontFamily: 'monospace', fontSize: 12 }} />` — only render when `prompt` is truthy
   - Style: `maxWidth: 900` wrapper div, consistent with AiConfigPage

2. **Update `admin-ui/src/pages/ai-settings/AiSettingsPage.tsx`:**
   - Import `{ EyeOutlined }` from '@ant-design/icons'
   - Import `PromptPreview` from './PromptPreview'
   - Add a third tab item:
     ```
     {
       key: 'prompt-preview',
       label: <span><EyeOutlined /> Prompt Preview</span>,
       children: <PromptPreview />,
     }
     ```
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js/admin-ui && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
    - PromptPreview component renders form with type selector, text input, conditional quality fields, target locales JSON input, locale skill JSON input, context input, preview button
    - Preview button calls POST /translations/ai-preview-prompt and displays the raw prompt in a read-only monospace textarea
    - New "Prompt Preview" tab appears in AI Settings page alongside existing "AI Config" and "MCP Prompts" tabs
    - TypeScript compiles cleanly
  </done>
</task>

</tasks>

<verification>
1. Backend compiles: `npx tsc --noEmit` passes
2. Frontend compiles: `cd admin-ui && npx tsc --noEmit` passes
3. Lint passes: `npm run lint:js` in root
4. Existing translate/quality methods produce identical prompts (refactor is extraction only, no logic change)
</verification>

<success_criteria>
- POST /translations/ai-preview-prompt returns the constructed prompt string for both translate and quality types
- AI Settings page has a third "Prompt Preview" tab
- The preview shows the exact prompt string that would be sent to Gemini
- No Gemini API call is made during preview
- Existing AI translate and quality check functionality is unchanged
</success_criteria>

<output>
After completion, create `.planning/quick/260406-ihm-add-prompt-preview-endpoint-and-ui-in-ai/260406-ihm-SUMMARY.md`
</output>
