# Handoff: Quality Check Prompt Refactor

## Задача
Об'єднати логіку побудови промпту для quality check в один місць.
Зараз є два окремих шляхи з дублюванням — і context-aware логіка
не працює коректно в bulk endpoint.

## Проблема

`ai_quality_check` (stateless MCP tool) → `/translations/ai-quality-check/bulk`
→ `bulkCheckQuality()` → `buildBulkQualityPrompt()`

Context передається всередині JSON items:
```json
[{ "key": "label.train", "source": "Train", "context": "Railway vehicle...", "translations": { "uk": "Поїзд" } }]
```

Gemini бачить context як поле всередині даних, а не як системну інструкцію.
Ambiguity rule на рівні системного промпту перемагає context у даних.

Тест який НЕ проходить:
- source: "Train", translation: "Поїзд", context: "Workout tile, physical exercise"
  → повертає green 95 (мало бути red — Поїзд = vehicle, не exercise)
- source: "Train", translation: "Тренуватись", context: "Workout tile, physical exercise"
  → повертає red 30 (мало бути green — Тренуватись = exercise ✓)

## Архітектура (файли)

### `src/modules/translations/ai-translate.service.ts`

**`checkQuality()` — рядки ~641-720** (single-locale, OLD endpoint)
- Використовує `DEFAULT_QUALITY_TRANSLATE_PROMPT` з `ai-config.service.ts`
- Context передається через `interpolate()` як `{{context}}`
- `meaning_rule` тепер теж через `interpolate()` — conditional logic в коді ✓
- Але цей endpoint вже НЕ використовується MCP (MCP перейшов на bulk)

**`buildBulkQualityPrompt()` — рядки ~574-638** (bulk, використовується MCP)
- Власний hardcoded промпт (не з ai-config)
- Context у JSON items, НЕ через interpolate
- Ambiguity rule захардкоджена в системному промпті без умов

**`bulkCheckQuality()` — рядки ~394-567**
- Викликає `buildBulkQualityPrompt()`
- Обробляє масив items з context per-key

### `src/modules/translations/ai-config.service.ts`

**`DEFAULT_QUALITY_TRANSLATE_PROMPT` — рядки ~32-88**
- Шаблон для single-locale checkQuality
- `{{meaning_rule}}` — вставляється кодом (з context або без)
- `{{context}}` — вставляється через interpolate

**`interpolate()` — рядки ~172-180**
- `vars[key] ?? ''` — missing keys → empty string (нещодавно пофікшено)

## Що зробити

### Варіант (рекомендований): єдиний промпт-білдер

Створити `buildQualityPrompt(items, options)` який:
1. Системна частина (роль, scoring rules, comment rules) — одна для всіх
2. Ambiguity/context rule — залежить від наявності context у конкретного item:
   - Якщо хоч один item має context → в системному промпті написати:
     "For keys WITH context field: context is DEFINITIVE, evaluate against it ONLY.
      For keys WITHOUT context field: apply benefit-of-doubt for all valid interpretations."
   - Або (чистіше): розбити items на дві групи — з context і без,
     зробити два окремих Gemini calls з різними інструкціями, merge results

### Альтернатива (простіше): per-key instruction в JSON

Замість системного правила — додати поле `meaningInstruction` до кожного item:
```json
{
  "key": "label.train",
  "source": "Train",
  "context": "Railway vehicle.",
  "meaningInstruction": "DEFINITIVE context provided. Evaluate against this meaning ONLY.",
  "translations": { "uk": "Поїзд" }
}
```

## Тест для валідації після фіксу

```
// Має бути red (context = workout, але Поїзд = vehicle)
ai_quality_check({
  projectSlug: "antigravity-app",
  source: "Train",
  translation: "Поїзд",
  locale: "uk",
  context: "Workout tile label with a dumbbell icon. Physical exercise, not a vehicle."
})

// Має бути green (context = workout, Тренуватись = exercise ✓)
ai_quality_check({
  projectSlug: "antigravity-app",
  source: "Train",
  translation: "Тренуватись",
  locale: "uk",
  context: "Workout tile label with a dumbbell icon. Physical exercise, not a vehicle."
})

// Має бути green (context = vehicle, Поїзд = vehicle ✓)
ai_quality_check({
  projectSlug: "antigravity-app",
  source: "Train",
  translation: "Поїзд",
  locale: "uk",
  context: "Railway vehicle. Heading on a train booking card."
})
```

## Пов'язані feedback IDs
- `a9bc6a4b` — позначений як reviewed але проблема глибша ніж думали
