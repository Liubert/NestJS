import { createHash } from 'crypto';

export function hashSha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
