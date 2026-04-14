import { TranslationCacheService } from './translation-cache.service.js';

describe('TranslationCacheService', () => {
  let cache: TranslationCacheService;

  beforeEach(() => {
    cache = new TranslationCacheService();
  });

  it('returns undefined for a cache miss', () => {
    expect(cache.get('proj', 'ns', 'en')).toBeUndefined();
  });

  it('returns the cached value after set()', () => {
    const data = { hello: 'world' };
    cache.set('proj', 'ns', 'en', data);
    expect(cache.get('proj', 'ns', 'en')).toBe(data);
  });

  it('isolates entries by locale', () => {
    cache.set('proj', 'ns', 'en', { a: 1 });
    cache.set('proj', 'ns', 'uk', { a: 2 });
    expect(cache.get('proj', 'ns', 'en')).toEqual({ a: 1 });
    expect(cache.get('proj', 'ns', 'uk')).toEqual({ a: 2 });
  });

  it('invalidateProject() removes all entries for the project', () => {
    cache.set('proj', 'ns1', 'en', { a: 1 });
    cache.set('proj', 'ns2', 'uk', { a: 2 });
    cache.set('other', 'ns1', 'en', { a: 3 });

    cache.invalidateProject('proj');

    expect(cache.get('proj', 'ns1', 'en')).toBeUndefined();
    expect(cache.get('proj', 'ns2', 'uk')).toBeUndefined();
    expect(cache.get('other', 'ns1', 'en')).toEqual({ a: 3 });
  });

  it('invalidateNamespace() with locale removes one entry', () => {
    cache.set('proj', 'ns', 'en', { a: 1 });
    cache.set('proj', 'ns', 'uk', { a: 2 });

    cache.invalidateNamespace('proj', 'ns', 'en');

    expect(cache.get('proj', 'ns', 'en')).toBeUndefined();
    expect(cache.get('proj', 'ns', 'uk')).toEqual({ a: 2 });
  });

  it('invalidateNamespace() without locale removes all locales for that namespace', () => {
    cache.set('proj', 'ns', 'en', { a: 1 });
    cache.set('proj', 'ns', 'uk', { a: 2 });
    cache.set('proj', 'other', 'en', { a: 3 });

    cache.invalidateNamespace('proj', 'ns');

    expect(cache.get('proj', 'ns', 'en')).toBeUndefined();
    expect(cache.get('proj', 'ns', 'uk')).toBeUndefined();
    expect(cache.get('proj', 'other', 'en')).toEqual({ a: 3 });
  });

  it('clear() removes everything', () => {
    cache.set('p1', 'ns', 'en', { a: 1 });
    cache.set('p2', 'ns', 'uk', { a: 2 });

    cache.clear();

    expect(cache.get('p1', 'ns', 'en')).toBeUndefined();
    expect(cache.get('p2', 'ns', 'uk')).toBeUndefined();
  });

  it('stats() returns current size', () => {
    expect(cache.stats()).toEqual({ size: 0, max: 500 });
    cache.set('proj', 'ns', 'en', { a: 1 });
    expect(cache.stats()).toEqual({ size: 1, max: 500 });
  });
});
