import {
  Controller,
  MessageEvent,
  Param,
  Query,
  Sse,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { from, Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { ProjectEntity } from '../translations/entities/project.entity.js';
import { SseService } from './sse.service.js';

@Controller('sse/projects')
export class SseController {
  constructor(
    private readonly sseService: SseService,
    private readonly jwtService: JwtService,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
  ) {}

  @Sse(':slug')
  events(
    @Param('slug') slug: string,
    @Query('token') token?: string,
  ): Observable<MessageEvent> {
    // Auth: EventSource can't set headers, so JWT via query param
    if (!token) throw new UnauthorizedException('Missing token');
    try {
      this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    return from(
      this.projectRepo.findOne({
        where: { slug },
        select: ['id'],
      }),
    ).pipe(
      mergeMap((project) => {
        if (!project) {
          throw new NotFoundException(`Project "${slug}" not found`);
        }

        return this.sseService.subscribe(project.id);
      }),
    );
  }
}
