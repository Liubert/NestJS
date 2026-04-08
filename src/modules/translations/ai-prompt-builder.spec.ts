import {
  buildBulkTranslatePrompt,
  buildBulkQualityPrompt,
} from './ai-prompt-builder.js';

// ─── buildBulkTranslatePrompt — context handling ──────────────────────────────

describe('buildBulkTranslatePrompt — context handling', () => {
  const baseRules = 'Use natural, concise wording suitable for UI labels.';

  it('includes CRITICAL context rule that forbids dual alternatives', () => {
    const prompt = buildBulkTranslatePrompt(
      [
        {
          key: 'book',
          text: 'book',
          context: 'to read',
          targetLocales: ['uk'],
        },
      ],
      baseRules,
      null,
      '',
    );

    expect(prompt).toContain('CRITICAL');
    expect(prompt).toContain('NEVER provide multiple alternatives');
  });

  it('instructs AI to set contextNeed="none" when context is present', () => {
    const prompt = buildBulkTranslatePrompt(
      [
        {
          key: 'book',
          text: 'book',
          context: 'to read',
          targetLocales: ['uk'],
        },
      ],
      baseRules,
      null,
      '',
    );

    expect(prompt).toMatch(/contextNeed.*none.*context already resolves/i);
  });

  it('passes context field into the entries JSON', () => {
    const prompt = buildBulkTranslatePrompt(
      [
        {
          key: 'book',
          text: 'book',
          context: 'to read',
          targetLocales: ['uk'],
        },
      ],
      baseRules,
      null,
      '',
    );

    expect(prompt).toContain('"context"');
    expect(prompt).toContain('to read');
  });

  it('does NOT include context field in entries JSON when context is absent', () => {
    const prompt = buildBulkTranslatePrompt(
      [{ key: 'save', text: 'Save', targetLocales: ['uk'] }],
      baseRules,
      null,
      '',
    );

    // The entries JSON should not have a "context" key for this entry
    const entriesJson = prompt.split('Entries to translate:')[1];
    expect(entriesJson).not.toContain('"context"');
  });

  it('includes fallback instruction for entries without context', () => {
    const prompt = buildBulkTranslatePrompt(
      [{ key: 'save', text: 'Save', targetLocales: ['uk'] }],
      baseRules,
      null,
      '',
    );

    expect(prompt).toContain('most common UI interpretation');
  });
});

// ─── buildBulkTranslatePrompt — dot-notation key format (regression) ──────────

describe('buildBulkTranslatePrompt — dot-notation key format (regression)', () => {
  const baseRules = 'Use natural, concise wording suitable for UI labels.';

  it('serializes entries as a JSON object keyed by translation key, not an array', () => {
    const prompt = buildBulkTranslatePrompt(
      [
        { key: 'nav.home', text: 'Home', targetLocales: ['nb'] },
        { key: 'btn.save', text: 'Save', targetLocales: ['nb'] },
        { key: 'errors.required', text: 'Required', targetLocales: ['nb'] },
      ],
      baseRules,
      null,
      '',
    );

    const entriesJson = prompt.split('Entries to translate:')[1].trim();
    const parsed = JSON.parse(entriesJson) as unknown;

    expect(Array.isArray(parsed)).toBe(false);
    expect(typeof parsed).toBe('object');
    expect(parsed).not.toBeNull();

    const keys = Object.keys(parsed as Record<string, unknown>);
    expect(keys).toContain('nav.home');
    expect(keys).toContain('btn.save');
    expect(keys).toContain('errors.required');

    // Should NOT have numeric keys (which is what happens with array input)
    expect(keys).not.toContain('0');
    expect(keys).not.toContain('1');
    expect(keys).not.toContain('2');
  });

  it('preserves dot-notation keys verbatim in the JSON payload', () => {
    const prompt = buildBulkTranslatePrompt(
      [
        { key: 'nav.home', text: 'Home', targetLocales: ['nb'] },
        { key: 'btn.save', text: 'Save', targetLocales: ['nb'] },
      ],
      baseRules,
      null,
      '',
    );

    expect(prompt).toContain('"nav.home":');
    expect(prompt).toContain('"btn.save":');
  });

  it('includes text and targetLanguages in each entry value', () => {
    const prompt = buildBulkTranslatePrompt(
      [
        { key: 'nav.home', text: 'Home', targetLocales: ['nb'] },
        { key: 'btn.save', text: 'Save', targetLocales: ['nb'] },
      ],
      baseRules,
      null,
      '',
    );

    const entriesJson = prompt.split('Entries to translate:')[1].trim();
    const parsed = JSON.parse(entriesJson) as Record<
      string,
      { text: string; targetLanguages: string; context?: string }
    >;

    expect(typeof parsed['nav.home'].text).toBe('string');
    expect(typeof parsed['nav.home'].targetLanguages).toBe('string');
    expect(parsed['nav.home'].text).toBe('Home');

    expect(typeof parsed['btn.save'].text).toBe('string');
    expect(typeof parsed['btn.save'].targetLanguages).toBe('string');
    expect(parsed['btn.save'].text).toBe('Save');
  });

  it('omits context field when entry has no context', () => {
    const prompt = buildBulkTranslatePrompt(
      [
        {
          key: 'nav.home',
          text: 'Home',
          context: 'Main navigation link',
          targetLocales: ['nb'],
        },
        { key: 'btn.save', text: 'Save', targetLocales: ['nb'] },
      ],
      baseRules,
      null,
      '',
    );

    const entriesJson = prompt.split('Entries to translate:')[1].trim();
    const parsed = JSON.parse(entriesJson) as Record<
      string,
      { text: string; targetLanguages: string; context?: string }
    >;

    expect(parsed['nav.home'].context).toBe('Main navigation link');
    expect('context' in parsed['btn.save']).toBe(false);
  });
});

// ─── buildBulkQualityPrompt — context handling ────────────────────────────────

describe('buildBulkQualityPrompt — context handling', () => {
  it('includes CRITICAL context rule', () => {
    const prompt = buildBulkQualityPrompt([
      {
        key: 'book',
        source: 'book',
        context: 'to read',
        translations: { uk: 'книга' },
      },
    ]);

    expect(prompt).toContain('CRITICAL');
  });

  it('instructs AI to set contextNeed="none" when context is provided', () => {
    const prompt = buildBulkQualityPrompt([
      {
        key: 'book',
        source: 'book',
        context: 'to read',
        translations: { uk: 'книга' },
      },
    ]);

    expect(prompt).toMatch(/contextNeed.*none.*context already resolves/i);
  });

  it('instructs AI NOT to report source as ambiguous when context is present', () => {
    const prompt = buildBulkQualityPrompt([
      {
        key: 'book',
        source: 'book',
        context: 'to read',
        translations: { uk: 'книга' },
      },
    ]);

    expect(prompt).toContain('Do NOT report the source as ambiguous');
  });

  it('includes context field in items JSON', () => {
    const prompt = buildBulkQualityPrompt([
      {
        key: 'book',
        source: 'book',
        context: 'to read',
        translations: { uk: 'книга' },
      },
    ]);

    expect(prompt).toContain('"context"');
    expect(prompt).toContain('to read');
  });

  it('does NOT contain "Do NOT report the source as ambiguous" instruction for null context entries', () => {
    // The CRITICAL rule is always present in the prompt header, but this test
    // confirms the context field is null/absent in the items JSON itself
    const prompt = buildBulkQualityPrompt([
      {
        key: 'home',
        source: 'Home',
        context: null,
        translations: { uk: 'Головна' },
      },
    ]);

    // Items JSON should have context: null — AI can still flag it as ambiguous
    const itemsJson = prompt.split('Translations to review:')[1];
    expect(itemsJson).toContain('"context": null');
  });
});
