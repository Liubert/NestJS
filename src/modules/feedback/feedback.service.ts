import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentFeedbackEntity } from './entities/agent-feedback.entity.js';
import { ProjectEntity } from '../translations/entities/project.entity.js';
import { CreateFeedbackDto } from './dto/create-feedback.dto.js';
import { QueryFeedbackDto } from './dto/query-feedback.dto.js';
import { ReviewFeedbackDto } from './dto/review-feedback.dto.js';

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(AgentFeedbackEntity)
    private readonly feedbackRepo: Repository<AgentFeedbackEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
  ) {}

  async create(
    dto: CreateFeedbackDto,
    currentUser: { userId: string; isMcpToken?: boolean },
  ): Promise<AgentFeedbackEntity> {
    // Rate limit: max 10 feedback items per user per hour
    const recentCount = await this.feedbackRepo
      .createQueryBuilder('fb')
      .where('fb.user_id = :userId', { userId: currentUser.userId })
      .andWhere("fb.created_at > NOW() - INTERVAL '1 hour'")
      .getCount();

    if (recentCount >= 10) {
      throw new HttpException(
        'Rate limit exceeded: max 10 feedback items per hour',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let projectId: string | null = null;
    if (dto.projectSlug) {
      const project = await this.projectRepo.findOne({
        where: { slug: dto.projectSlug },
      });
      if (!project) {
        throw new NotFoundException(`Project "${dto.projectSlug}" not found`);
      }
      projectId = project.id;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { projectSlug: _slug, ...rest } = dto;

    const entity = this.feedbackRepo.create({
      ...rest,
      userId: currentUser.userId,
      projectId,
      isMcpToken: !!currentUser.isMcpToken,
    });

    return this.feedbackRepo.save(entity);
  }

  async findAll(
    query: QueryFeedbackDto,
  ): Promise<{ items: AgentFeedbackEntity[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.feedbackRepo
      .createQueryBuilder('fb')
      .leftJoinAndSelect('fb.user', 'user')
      .leftJoinAndSelect('fb.project', 'project');

    if (query.category) {
      qb.andWhere('fb.category = :category', { category: query.category });
    }

    if (query.severity) {
      qb.andWhere('fb.severity = :severity', { severity: query.severity });
    }

    if (query.reviewed !== undefined) {
      qb.andWhere('fb.reviewed = :reviewed', { reviewed: query.reviewed });
    }

    if (query.projectSlug) {
      qb.andWhere('project.slug = :slug', { slug: query.projectSlug });
    }

    qb.orderBy('fb.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async markReviewed(
    id: string,
    dto: ReviewFeedbackDto,
  ): Promise<AgentFeedbackEntity> {
    const entity = await this.feedbackRepo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`Feedback "${id}" not found`);
    }

    entity.reviewed = dto.reviewed;
    entity.reviewerNote = dto.reviewerNote ?? null;

    return this.feedbackRepo.save(entity);
  }
}
