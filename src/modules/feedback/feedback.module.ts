import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentFeedbackEntity } from './entities/agent-feedback.entity.js';
import { ProjectEntity } from '../translations/entities/project.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([AgentFeedbackEntity, ProjectEntity])],
  controllers: [],
  providers: [],
  exports: [],
})
export class FeedbackModule {}
