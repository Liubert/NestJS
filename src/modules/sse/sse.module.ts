import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectEntity } from '../translations/entities/project.entity.js';
import { SseController } from './sse.controller.js';
import { SseService } from './sse.service.js';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([ProjectEntity])],
  controllers: [SseController],
  providers: [SseService],
  exports: [SseService],
})
export class SseModule {}
