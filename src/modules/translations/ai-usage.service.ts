import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiUsageLogEntity } from './entities/ai-usage-log.entity.js';

@Injectable()
export class AiUsageService {
  constructor(
    @InjectRepository(AiUsageLogEntity)
    private readonly repo: Repository<AiUsageLogEntity>,
  ) {}

  async logUsage(params: {
    projectId: string;
    operation: string;
    inputTokens: number;
    outputTokens: number;
    model: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.repo.save({
      ...params,
      totalTokens: params.inputTokens + params.outputTokens,
    });
  }

  async getProjectUsage(
    projectId: string,
    options?: { since?: Date },
  ): Promise<{
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    breakdown: {
      operation: string;
      totalTokens: number;
      inputTokens: number;
      outputTokens: number;
      callCount: number;
    }[];
  }> {
    const qb = this.repo
      .createQueryBuilder('log')
      .where('log.project_id = :projectId', { projectId });

    if (options?.since) {
      qb.andWhere('log.created_at >= :since', { since: options.since });
    }

    const breakdown = await qb
      .select('log.operation', 'operation')
      .addSelect('COALESCE(SUM(log.total_tokens), 0)', 'totalTokens')
      .addSelect('COALESCE(SUM(log.input_tokens), 0)', 'inputTokens')
      .addSelect('COALESCE(SUM(log.output_tokens), 0)', 'outputTokens')
      .addSelect('COUNT(*)::int', 'callCount')
      .groupBy('log.operation')
      .getRawMany<{
        operation: string;
        totalTokens: string;
        inputTokens: string;
        outputTokens: string;
        callCount: number;
      }>();

    const totalTokens = breakdown.reduce(
      (sum, row) => sum + (Number(row.totalTokens) || 0),
      0,
    );
    const inputTokens = breakdown.reduce(
      (sum, row) => sum + (Number(row.inputTokens) || 0),
      0,
    );
    const outputTokens = breakdown.reduce(
      (sum, row) => sum + (Number(row.outputTokens) || 0),
      0,
    );

    return {
      totalTokens,
      inputTokens,
      outputTokens,
      breakdown: breakdown.map((row) => ({
        operation: row.operation,
        totalTokens: Number(row.totalTokens) || 0,
        inputTokens: Number(row.inputTokens) || 0,
        outputTokens: Number(row.outputTokens) || 0,
        callCount: Number(row.callCount) || 0,
      })),
    };
  }

  async getProjectUsageSummary(projectId: string): Promise<{
    totalTokens: number;
    last30Days: number;
    callCount: number;
  }> {
    const [totalResult] = await this.repo
      .createQueryBuilder('log')
      .where('log.project_id = :projectId', { projectId })
      .select('COALESCE(SUM(log.total_tokens), 0)', 'totalTokens')
      .addSelect('COUNT(*)::int', 'callCount')
      .getRawMany<{ totalTokens: string; callCount: number }>();

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [last30Result] = await this.repo
      .createQueryBuilder('log')
      .where('log.project_id = :projectId', { projectId })
      .andWhere('log.created_at >= :since', { since: thirtyDaysAgo })
      .select('COALESCE(SUM(log.total_tokens), 0)', 'totalTokens')
      .getRawMany<{ totalTokens: string }>();

    return {
      totalTokens: Number(totalResult.totalTokens),
      last30Days: Number(last30Result.totalTokens),
      callCount: Number(totalResult.callCount),
    };
  }
}
