import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { LRUCache } from 'lru-cache';

/**
 * In-process LRU cache for public translation responses.
 *
 * Key format: `${projectSlug}:${namespace}:${locale}`
 * Value: the fully assembled translation object (already unflattened)
 *
 * TTL: 60 seconds — short enough to limit stale data risk,
 * long enough to absorb repeated requests from multiple frontend clients.
 *
 * Max entries: 500 — fits ~500 project/namespace/locale combinations.
 * At ~50KB per 2000-key namespace, max memory ≈ 25MB.
 */
@Injectable()
export class TranslationCacheService {
  private readonly logger = new Logger(TranslationCacheService.name);
  private readonly cache: LRUCache<string, Record<string, unknown>>;

  constructor() {
    this.cache = new LRUCache<string, Record<string, unknown>>({
      max: 500,
      ttl: 60_000, // 60 seconds
    });
    this.logger.log('Translation LRU cache initialized (max=500, ttl=60s)');
  }

  private buildKey(
    projectSlug: string,
    namespace: string,
    locale: string,
  ): string {
    return `${projectSlug}:${namespace}:${locale}`;
  }

  /**
   * Returns the cached value directly (no deep copy).
   * Callers MUST NOT mutate the returned object — it is shared across requests.
   */
  get(
    projectSlug: string,
    namespace: string,
    locale: string,
  ): Record<string, unknown> | undefined {
    return this.cache.get(this.buildKey(projectSlug, namespace, locale));
  }

  set(
    projectSlug: string,
    namespace: string,
    locale: string,
    data: Record<string, unknown>,
  ): void {
    this.cache.set(this.buildKey(projectSlug, namespace, locale), data);
  }

  /** Invalidate all entries for a given project (e.g. after import, promote) */
  invalidateProject(projectSlug: string): void {
    const prefix = `${projectSlug}:`;
    let evicted = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        evicted++;
      }
    }
    if (evicted > 0) {
      this.logger.log(
        `Invalidated ${evicted} cache entries for project "${projectSlug}"`,
      );
    }
  }

  /** Invalidate specific namespace+locale (e.g. after entry update) */
  invalidateNamespace(
    projectSlug: string,
    namespace: string,
    locale?: string,
  ): void {
    if (locale) {
      this.cache.delete(this.buildKey(projectSlug, namespace, locale));
    } else {
      const prefix = `${projectSlug}:${namespace}:`;
      for (const key of this.cache.keys()) {
        if (key.startsWith(prefix)) {
          this.cache.delete(key);
        }
      }
    }
  }

  /** Clear entire cache */
  clear(): void {
    this.cache.clear();
    this.logger.log('Translation cache cleared');
  }

  stats(): { size: number; max: number } {
    return { size: this.cache.size, max: 500 };
  }
}

@Global()
@Module({
  providers: [TranslationCacheService],
  exports: [TranslationCacheService],
})
export class TranslationCacheModule {}
