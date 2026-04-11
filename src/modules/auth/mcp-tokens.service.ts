import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { hashSha256 } from '../../common/utils/hash.util.js';
import { McpTokenEntity } from './entities/mcp-token.entity.js';

const TOKEN_PREFIX = 'lmcp_';

@Injectable()
export class McpTokensService {
  constructor(
    @InjectRepository(McpTokenEntity)
    private readonly repo: Repository<McpTokenEntity>,
  ) {}

  async generate(
    userId: string,
    name: string,
  ): Promise<{ token: string; id: string; createdAt: Date }> {
    const raw = TOKEN_PREFIX + randomBytes(32).toString('base64url');
    const tokenHash = hashSha256(raw);

    const entity = this.repo.create({ userId, name, tokenHash });
    const saved = await this.repo.save(entity);

    return { token: raw, id: saved.id, createdAt: saved.createdAt };
  }

  async list(userId: string): Promise<Omit<McpTokenEntity, 'tokenHash'>[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async delete(id: string, userId: string): Promise<void> {
    const token = await this.repo.findOne({ where: { id } });
    if (!token) throw new NotFoundException('Token not found');
    if (token.userId !== userId) throw new ForbiddenException('Not your token');

    await this.repo.delete(id);
  }

  // Called by McpTokenStrategy on every authenticated request
  async validateAndTouch(rawToken: string): Promise<McpTokenEntity | null> {
    const tokenHash = hashSha256(rawToken);

    const token = await this.repo
      .createQueryBuilder('t')
      .addSelect('t.tokenHash')
      .where('t.tokenHash = :tokenHash', { tokenHash })
      .leftJoinAndSelect('t.user', 'user')
      .getOne();

    if (!token) return null;

    // Update lastUsedAt without blocking the request. Use tokenHash in WHERE
    // to avoid relying on token.id being correctly hydrated from the QB result.
    this.repo
      .createQueryBuilder()
      .update(McpTokenEntity)
      .set({ lastUsedAt: new Date() })
      .where('token_hash = :tokenHash', { tokenHash })
      .execute()
      .catch(() => null);

    return token;
  }
}
