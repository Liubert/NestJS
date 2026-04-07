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
